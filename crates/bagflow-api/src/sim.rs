//! One simulation run: validated config, execution with collection on, and the views
//! served from a retained run.

use crate::error::{ApiError, ApiResult};
use bagflow_core::collect::{CollectOptions, Collected, Hop, WAIT_BOUNDS_MS};
use bagflow_core::engine2::{inspection_ms, run_collected, Outage, Policy, RunStats, Strategy, Target};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::airport_network;
use bagflow_core::scenarios::{build, ALL};
use bagflow_core::soa::BagSoA;
use bagflow_core::types::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const SEED: u64 = 42;
pub const SAMPLE_INTERVAL_MS: u64 = 60_000;
pub const BAG_COUNT_RANGE: (u64, u64) = (1_000, 1_000_000);
pub const CAPACITY_PCT_RANGE: (u32, u32) = (20, 300);
pub const MULTIPLIER_RANGE: (u32, u32) = (1, 20);
pub const MAX_PAGE_SIZE: usize = 500;

/// Node status is a display rule applied by the API to engine samples; the engine has no status.
const STATUS_WINDOW: usize = 15; // samples, so 15 simulation minutes
const HIGH_UTIL: f64 = 0.75;
const CONGESTED_UTIL: f64 = 0.95;

pub const BAG_STATUSES: [&str; 12] = [
    "CHECKED_IN", "IDENTIFIED", "SCREENING", "CLEARED", "IN_TRANSIT", "SORTED",
    "TRANSFER_PENDING", "LOADING", "LOADED", "DELAYED", "MISROUTED", "HELD_FOR_INSPECTION",
];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct SimConfig {
    pub scenario: String,
    pub routing: String,
    pub policy: String,
    pub capacity_pct: u32,
    pub server_multiplier: u32,
    pub bag_count: u64,
}

impl Default for SimConfig {
    fn default() -> Self {
        SimConfig {
            scenario: "Normal".into(),
            routing: "dijkstra".into(),
            policy: "fcfs".into(),
            capacity_pct: 100,
            server_multiplier: 1,
            bag_count: 250_000,
        }
    }
}

pub fn parse_scenario(s: &str) -> Option<Scenario> {
    ALL.into_iter().find(|x| format!("{x:?}") == s)
}

pub fn parse_routing(s: &str) -> Option<Strategy> {
    Strategy::ALL.into_iter().find(|x| x.name() == s)
}

pub fn parse_policy(s: &str) -> Option<Policy> {
    Policy::ALL.into_iter().find(|x| x.name() == s)
}

pub fn check_range<T: PartialOrd + std::fmt::Display + Copy>(name: &str, v: T, (lo, hi): (T, T)) -> ApiResult<()> {
    if v < lo || v > hi {
        return Err(ApiError::invalid(format!("{name} must be between {lo} and {hi}, got {v}")));
    }
    Ok(())
}

impl SimConfig {
    pub fn parsed(&self) -> ApiResult<(Scenario, Strategy, Policy)> {
        let sc = parse_scenario(&self.scenario).ok_or_else(|| ApiError::invalid(format!("unknown scenario '{}'", self.scenario)))?;
        let st = parse_routing(&self.routing).ok_or_else(|| ApiError::invalid(format!("unknown routing '{}'", self.routing)))?;
        let po = parse_policy(&self.policy).ok_or_else(|| ApiError::invalid(format!("unknown policy '{}'", self.policy)))?;
        Ok((sc, st, po))
    }

    pub fn validate(&self) -> ApiResult<()> {
        self.parsed()?;
        check_range("bag_count", self.bag_count, BAG_COUNT_RANGE)?;
        check_range("capacity_pct", self.capacity_pct, CAPACITY_PCT_RANGE)?;
        check_range("server_multiplier", self.server_multiplier, MULTIPLIER_RANGE)
    }
}

/// Server counts after the multiplier and the capacity percentage (at least one per node).
pub fn scale_servers(nodes: &mut [Node], pct: u32) {
    for nd in nodes.iter_mut() {
        nd.servers = ((nd.servers as u32 * pct / 100).max(1)) as u16;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum NodeStatus {
    Offline,
    Normal,
    High,
    Congested,
}

impl NodeStatus {
    fn name(self) -> &'static str {
        match self {
            NodeStatus::Offline => "offline",
            NodeStatus::Normal => "normal",
            NodeStatus::High => "high",
            NodeStatus::Congested => "congested",
        }
    }
}

fn status_rule() -> Value {
    json!({
        "source": "API display rule applied to engine samples; not an engine output",
        "window_samples": STATUS_WINDOW,
        "utilisation": "sum of sampled busy servers / sum of sampled capacity over the trailing window",
        "high_at": HIGH_UTIL,
        "congested_at": CONGESTED_UTIL,
        "offline": "capacity is 0 at the sample",
        "whole_run": "worst status over all samples, ignoring offline ones",
    })
}

/// A retained run, including every bag's history.
pub struct SimData {
    bags: BagSoA,
    /// Flight per bag before the scenario changed it (`SorterOverload` rewrites flights to redirect bags).
    original_flight: Option<Vec<u32>>,
    flights: Vec<Flight>,
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    outages: Vec<Outage>,
    stats: RunStats,
    collected: Collected,
    /// Per sample and node: (status, windowed utilisation). Indexed `sample * nodes + node`.
    status: Vec<(NodeStatus, Option<f64>)>,
}

pub struct Finished {
    pub data: SimData,
    /// What is persisted and served after the run is no longer retained.
    pub result: Value,
}

/// Run one validated config. `progress` receives (phase, done, total).
pub fn execute(cfg: &SimConfig, progress: &mut dyn FnMut(&'static str, u64, u64)) -> Result<Finished, String> {
    let (sc, st, po) = cfg.parsed().map_err(|e| e.message)?;
    progress("generating", 0, cfg.bag_count);
    let threads = std::thread::available_parallelism().map(|x| x.get()).unwrap_or(1);
    let (flights, base) = generate_par(&GenConfig { seed: SEED, target_bags: cfg.bag_count as usize }, threads);

    let (mut nodes, edges) = airport_network(cfg.server_multiplier as u16);
    scale_servers(&mut nodes, cfg.capacity_pct);
    let setup = build(sc, &base, &nodes, &edges, SEED);
    let original_flight = (setup.bags.flight[..base.len()] != base.flight[..]).then(|| base.flight.clone());
    let generated = base.len();
    let dataset_checksum = base.checksum();
    drop(base);

    let total = setup.bags.len() as u64;
    progress("simulating", 0, total);
    let started = std::time::Instant::now();
    let mut on_progress = |done: u64, total: u64| progress("simulating", done, total);
    let (stats, collected) = run_collected(
        &setup.bags,
        &setup.nodes,
        &setup.edges,
        st,
        po,
        SEED,
        &setup.outages,
        CollectOptions { history: true, sample_interval_ms: Some(SAMPLE_INTERVAL_MS) },
        Some(&mut on_progress),
    );
    let wall_s = started.elapsed().as_secs_f64();

    progress("summarising", total, total);
    let status = sample_statuses(&collected, setup.nodes.len());
    let data = SimData {
        bags: setup.bags,
        original_flight,
        flights,
        nodes: setup.nodes,
        edges: setup.edges,
        outages: setup.outages,
        stats,
        collected,
        status,
    };
    let dataset = json!({
        "seed": SEED,
        "bags_requested": cfg.bag_count,
        "bags_generated": generated,
        "bags_simulated": data.bags.len(),
        "flights": data.flights.len(),
        "checksum": format!("{dataset_checksum:016x}"),
    });
    let result = data.result(dataset, wall_s);
    Ok(Finished { data, result })
}

fn sample_statuses(c: &Collected, nn: usize) -> Vec<(NodeStatus, Option<f64>)> {
    let series = c.series.as_ref().expect("series collection is on");
    let mut out = Vec::with_capacity(series.len() * nn);
    let mut busy = vec![0u64; nn];
    let mut cap = vec![0u64; nn];
    for i in 0..series.len() {
        for (n, s) in series.at(i).iter().enumerate() {
            busy[n] += s.busy as u64;
            cap[n] += s.capacity as u64;
            if i >= STATUS_WINDOW {
                let old = series.at(i - STATUS_WINDOW)[n];
                busy[n] -= old.busy as u64;
                cap[n] -= old.capacity as u64;
            }
            if s.capacity == 0 {
                out.push((NodeStatus::Offline, None));
                continue;
            }
            let u = busy[n] as f64 / cap[n] as f64;
            let status = if u >= CONGESTED_UTIL {
                NodeStatus::Congested
            } else if u >= HIGH_UTIL {
                NodeStatus::High
            } else {
                NodeStatus::Normal
            };
            out.push((status, Some(u)));
        }
    }
    out
}

fn node_name(nodes: &[Node], i: usize) -> String {
    let kind = nodes[i].kind;
    let k = nodes[..i].iter().filter(|n| n.kind == kind).count();
    match kind {
        NodeKind::CheckIn => "Check-in".into(),
        NodeKind::Identification => "Identification".into(),
        NodeKind::Screening => format!("Screening {}", (b'A' + k as u8) as char),
        NodeKind::Sorter => format!("Sorter {}", k + 1),
        NodeKind::Loading => format!("Loading area {}", k + 1),
        other => format!("{other:?} {}", k + 1),
    }
}

fn priority_name(p: u8) -> &'static str {
    match p {
        PRIO_TIGHT => "tight_connection",
        PRIO_PRIORITY => "priority",
        _ => "standard",
    }
}

fn edge_id(e: &Edge) -> String {
    format!("e{}-{}", e.from, e.to)
}

/// Where a bag is at one moment.
#[derive(Clone, Copy, Debug)]
enum Place {
    NotArrived,
    Waiting(usize),
    InService(usize),
    Travelling { next: usize },
    Finished { node: usize, at_ms: u64 },
}

impl Place {
    fn phase(self) -> &'static str {
        match self {
            Place::NotArrived => "not_arrived",
            Place::Waiting(_) => "waiting",
            Place::InService(_) => "in_service",
            Place::Travelling { .. } => "travelling",
            Place::Finished { .. } => "finished",
        }
    }
    fn node(self) -> Option<usize> {
        match self {
            Place::Waiting(n) | Place::InService(n) | Place::Finished { node: n, .. } => Some(n),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct BaggageQuery {
    pub page: Option<usize>,
    pub page_size: Option<usize>,
    pub status: Option<String>,
    pub flight: Option<u32>,
    pub node: Option<usize>,
    /// Exact bag id.
    pub q: Option<String>,
    pub sort: Option<String>,
    pub order: Option<String>,
    /// Playback time. Without it the final state of the run is returned.
    pub at_ms: Option<u64>,
}

impl SimData {
    fn route(&self, bag: usize) -> impl Iterator<Item = (u8, Hop)> + '_ {
        self.collected.history.as_ref().expect("history collection is on").route(bag)
    }

    fn deadline_ms(&self, bag: usize) -> u64 {
        self.bags.deadline_s[bag] as u64 * 1000
    }

    fn flight(&self, bag: usize) -> u32 {
        match &self.original_flight {
            Some(f) if bag < f.len() => f[bag],
            _ => self.bags.flight[bag],
        }
    }

    fn place(&self, bag: usize, at_ms: Option<u64>) -> Place {
        let t = at_ms.unwrap_or(u64::MAX);
        let mut route = self.route(bag).peekable();
        let mut last: Option<(usize, Hop)> = None;
        while let Some(&(n, h)) = route.peek() {
            if h.arrive_ms as u64 > t {
                break;
            }
            last = Some((n as usize, h));
            route.next();
        }
        let Some((n, h)) = last else { return Place::NotArrived };
        if t < h.start_ms as u64 {
            Place::Waiting(n)
        } else if t < h.end_ms as u64 {
            Place::InService(n)
        } else if self.nodes[n].kind == NodeKind::Loading {
            Place::Finished { node: n, at_ms: h.end_ms as u64 }
        } else {
            let next = route.peek().expect("a bag that left a non-loading node has a next hop").0 as usize;
            Place::Travelling { next }
        }
    }

    fn held(&self, bag: usize, node: usize) -> Option<f64> {
        inspection_ms(SEED, bag as u32, self.nodes[node].kind)
    }

    /// The blueprint status for a place. `IDENTIFIED` and `SORTED` are timeline milestones
    /// only: the engine moves a bag on the moment that service ends.
    fn status_of(&self, bag: usize, place: Place) -> Option<&'static str> {
        Some(match place {
            Place::NotArrived => return None,
            Place::Travelling { .. } => "IN_TRANSIT",
            Place::Finished { at_ms, .. } => {
                if at_ms <= self.deadline_ms(bag) {
                    "LOADED"
                } else {
                    "DELAYED"
                }
            }
            Place::Waiting(n) | Place::InService(n) => match self.nodes[n].kind {
                NodeKind::CheckIn | NodeKind::Identification => "CHECKED_IN",
                NodeKind::Screening => {
                    if matches!(place, Place::InService(_)) && self.held(bag, n).is_some() {
                        "HELD_FOR_INSPECTION"
                    } else {
                        "SCREENING"
                    }
                }
                NodeKind::Loading => "LOADING",
                _ => "CLEARED", // at a sorter, not sorted yet
            },
        })
    }

    fn bag_json(&self, bag: usize, at_ms: Option<u64>) -> Value {
        let place = self.place(bag, at_ms);
        let t = at_ms.unwrap_or(u64::MAX);
        let flight = self.flight(bag);
        let loading = self.route(bag).last().map(|(n, _)| n as usize);
        let waited: u64 = self
            .route(bag)
            .filter(|(_, h)| h.arrive_ms as u64 <= t)
            .map(|(_, h)| (h.start_ms as u64).min(t) - h.arrive_ms as u64)
            .sum();
        let finish = match place {
            Place::Finished { at_ms, .. } => Some(at_ms),
            _ => None,
        };
        let next = match place {
            Place::Travelling { next } => Some(next),
            _ => None,
        };
        let arrival_ms = self.bags.arrival_s[bag] as u64 * 1000;
        json!({
            "id": bag,
            "passenger_id": self.bags.pax[bag],
            "flight_id": flight,
            "redirected": flight != self.bags.flight[bag],
            "priority": priority_name(self.bags.priority[bag]),
            "transfer": self.bags.flags[bag] & FLAG_TRANSFER != 0,
            "special_handling": self.bags.flags[bag] & FLAG_SPECIAL != 0,
            "weight_kg": self.bags.weight_dg[bag] as f64 / 10.0,
            "arrival_ms": arrival_ms,
            "deadline_ms": self.deadline_ms(bag),
            "departure_ms": self.flights.get(flight as usize).map(|f| f.departure_s as u64 * 1000),
            "status": self.status_of(bag, place),
            "phase": place.phase(),
            "current_node": place.node(),
            "next_node": next,
            "loading_node": loading,
            "overdue": finish.is_none() && !matches!(place, Place::NotArrived) && t > self.deadline_ms(bag),
            "finish_ms": finish,
            "wait_ms": waited,
        })
    }

    pub fn baggage_page(&self, q: &BaggageQuery) -> ApiResult<Value> {
        let page = q.page.unwrap_or(1);
        let page_size = q.page_size.unwrap_or(50);
        if page == 0 {
            return Err(ApiError::invalid("page starts at 1"));
        }
        check_range("page_size", page_size, (1, MAX_PAGE_SIZE))?;
        if let Some(s) = &q.status {
            if !BAG_STATUSES.contains(&s.as_str()) {
                return Err(ApiError::invalid(format!("unknown status '{s}'")));
            }
        }
        if let Some(n) = q.node {
            if n >= self.nodes.len() {
                return Err(ApiError::invalid(format!("unknown node {n}")));
            }
        }
        let wanted_id = match q.q.as_deref() {
            None | Some("") => None,
            Some(s) => Some(s.trim().parse::<usize>().map_err(|_| ApiError::invalid("q must be a bag id (a whole number)"))?),
        };
        let sort = q.sort.as_deref().unwrap_or("id");
        if !["id", "arrival", "deadline"].contains(&sort) {
            return Err(ApiError::invalid("sort must be id, arrival or deadline"));
        }
        let descending = match q.order.as_deref().unwrap_or("asc") {
            "asc" => false,
            "desc" => true,
            _ => return Err(ApiError::invalid("order must be asc or desc")),
        };

        // counts cover the whole run (for the KPI cards); filters apply to the table only
        let (mut not_arrived, mut waiting, mut in_service, mut travelling, mut loaded, mut delayed) = (0u64, 0u64, 0u64, 0u64, 0u64, 0u64);
        let mut matches: Vec<u32> = Vec::new();
        for i in 0..self.bags.len() {
            let place = self.place(i, q.at_ms);
            match place {
                Place::NotArrived => not_arrived += 1,
                Place::Waiting(_) => waiting += 1,
                Place::InService(_) => in_service += 1,
                Place::Travelling { .. } => travelling += 1,
                Place::Finished { at_ms, .. } => {
                    if at_ms <= self.deadline_ms(i) {
                        loaded += 1
                    } else {
                        delayed += 1
                    }
                }
            }
            if wanted_id.is_some_and(|id| id != i) {
                continue;
            }
            if q.flight.is_some_and(|f| f != self.flight(i)) {
                continue;
            }
            if let Some(n) = q.node {
                // final state: bags that visited the node; playback: bags at the node now
                let hit = match q.at_ms {
                    Some(_) => place.node() == Some(n) && !matches!(place, Place::Finished { .. }),
                    None => self.route(i).any(|(v, _)| v as usize == n),
                };
                if !hit {
                    continue;
                }
            }
            if q.status.as_deref().is_some_and(|s| self.status_of(i, place) != Some(s)) {
                continue;
            }
            matches.push(i as u32);
        }
        match sort {
            "arrival" => matches.sort_by_key(|&i| (self.bags.arrival_s[i as usize], i)),
            "deadline" => matches.sort_by_key(|&i| (self.bags.deadline_s[i as usize], i)),
            _ => {}
        }
        if descending {
            matches.reverse();
        }
        let items: Vec<Value> = matches
            .iter()
            .skip((page - 1).saturating_mul(page_size))
            .take(page_size)
            .map(|&i| self.bag_json(i as usize, q.at_ms))
            .collect();
        Ok(json!({
            "page": page,
            "page_size": page_size,
            "total": matches.len(),
            "at_ms": q.at_ms,
            "counts": {
                "total": self.bags.len(),
                "not_arrived": not_arrived,
                "waiting": waiting,
                "in_service": in_service,
                "travelling": travelling,
                "in_system": waiting + in_service + travelling,
                "loaded_on_time": loaded,
                "delayed": delayed,
            },
            "items": items,
        }))
    }

    pub fn bag_detail(&self, bag: usize, at_ms: Option<u64>) -> ApiResult<Value> {
        if bag >= self.bags.len() {
            return Err(ApiError::not_found(format!("no bag {bag} in this run")));
        }
        let mut route = Vec::new();
        let mut timeline = Vec::new();
        let state = |name: &str, at: Option<u64>, node: usize, waited: Option<u64>| {
            json!({ "state": name, "at_ms": at, "node": node, "waiting_ms": waited })
        };
        for (n, h) in self.route(bag) {
            let n = n as usize;
            let (arrive, start, end) = (h.arrive_ms as u64, h.start_ms as u64, h.end_ms as u64);
            let waited = Some(start - arrive);
            let held = self.held(bag, n);
            route.push(json!({
                "node": n,
                "name": node_name(&self.nodes, n),
                "arrive_ms": arrive,
                "start_ms": start,
                "end_ms": end,
                "wait_ms": start - arrive,
                "service_ms": end - start,
                "inspection_ms": held.map(|x| x.round() as u64),
            }));
            match self.nodes[n].kind {
                NodeKind::CheckIn => timeline.push(state("CHECKED_IN", Some(arrive), n, waited)),
                NodeKind::Identification => timeline.push(state("IDENTIFIED", Some(end), n, waited)),
                NodeKind::Screening => {
                    timeline.push(state("SCREENING", Some(start), n, waited));
                    if let Some(extra) = held {
                        // part of the screening service, so it has no time of its own
                        let mut e = state("HELD_FOR_INSPECTION", None, n, None);
                        e["duration_ms"] = json!(extra.round() as u64);
                        timeline.push(e);
                    }
                    timeline.push(state("CLEARED", Some(end), n, None));
                    timeline.push(state("IN_TRANSIT", Some(end), n, None));
                }
                NodeKind::Loading => {
                    timeline.push(state("LOADING", Some(start), n, waited));
                    let outcome = if end <= self.deadline_ms(bag) { "LOADED" } else { "DELAYED" };
                    timeline.push(state(outcome, Some(end), n, None));
                }
                _ => timeline.push(state("SORTED", Some(end), n, waited)),
            }
        }
        let mut out = self.bag_json(bag, at_ms);
        out["at_ms"] = json!(at_ms);
        out["route"] = json!(route);
        out["timeline"] = json!(timeline); // always the whole run, also when at_ms is given
        Ok(out)
    }

    fn node_rows(&self) -> Vec<Value> {
        let series = self.collected.series.as_ref().expect("series collection is on");
        let nn = self.nodes.len();
        (0..nn)
            .map(|n| {
                let own = || self.status.iter().skip(n).step_by(nn);
                let worst = own().map(|s| s.0).max().unwrap_or(NodeStatus::Normal).max(NodeStatus::Normal);
                let nd = &self.nodes[n];
                json!({
                    "id": n,
                    "name": node_name(&self.nodes, n),
                    "type": format!("{:?}", nd.kind),
                    "x": nd.x,
                    "y": nd.y,
                    "capacity": nd.servers,
                    // nominal, from server count and base mean service (no inspection time)
                    "processing_rate_per_s": nd.servers as f64 * 1000.0 / nd.mean_service_ms as f64,
                    "mean_service_ms": nd.mean_service_ms,
                    "arrivals": self.stats.arrivals[n],
                    "completions": series.at(series.len() - 1)[n].completions,
                    "avg_wait_s": self.stats.avg_wait_s[n],
                    "max_queue": self.stats.max_queue[n],
                    "utilisation": self.stats.util[n],
                    "peak_window_utilisation": own().filter_map(|s| s.1).fold(0.0f64, f64::max),
                    "status": worst.name(),
                    "was_offline": own().any(|s| s.0 == NodeStatus::Offline),
                    "wait_histogram": self.collected.wait_hist[n],
                })
            })
            .collect()
    }

    fn result(&self, dataset: Value, wall_s: f64) -> Value {
        let s = &self.stats;
        let n = s.n.max(1) as f64;
        let total_wait_s: f64 = s.avg_wait_s.iter().zip(&s.arrivals).map(|(w, &a)| w * a as f64).sum();
        let nodes = self.node_rows();
        let congested = nodes.iter().filter(|x| x["status"] == "congested").count();
        let series = self.collected.series.as_ref().expect("series collection is on");
        json!({
            "dataset": dataset,
            "engine_checksum": format!("{:016x}", s.checksum),
            "sim_wall_s": wall_s,
            "summary": {
                "total_bags": s.n,
                "processed_bags": s.loaded + s.delayed,
                "loaded_on_time": s.loaded,
                "delayed_bags": s.delayed,
                "unfinished_bags": s.unfinished,
                // the run is over, so this equals unfinished_bags; use baggage?at_ms= for playback counts
                "in_transit": s.unfinished,
                "delayed_pct": 100.0 * s.delayed as f64 / n,
                "on_time_loading_rate": s.loaded as f64 / n,
                "tight_total": s.tight_total,
                "tight_delayed": s.tight_delayed,
                "tight_delayed_pct": 100.0 * s.tight_delayed as f64 / s.tight_total.max(1) as f64,
                "average_waiting_time_s": total_wait_s / n,
                "mean_sojourn_s": s.mean_sojourn_s,
                "p95_sojourn_s": s.p95_sojourn_s,
                "max_queue": s.max_queue.iter().max().copied().unwrap_or(0),
                "max_utilisation": s.util.iter().copied().fold(0.0f64, f64::max),
                "congested_facilities": congested,
                "end_ms": series.times_ms.last(),
            },
            "nodes": nodes,
            "wait_histogram_bounds_ms": WAIT_BOUNDS_MS,
            "status_rule": status_rule(),
        })
    }

    /// Graph, per-node statistics and time-series. With `at_ms`, node and edge state is
    /// taken from the last sample at or before that time.
    pub fn network(&self, at_ms: Option<u64>) -> Value {
        let series = self.collected.series.as_ref().expect("series collection is on");
        let nn = self.nodes.len();
        let sample = at_ms.and_then(|t| series.times_ms.partition_point(|&x| x <= t).checked_sub(1));
        let mut nodes = self.node_rows();
        for (n, row) in nodes.iter_mut().enumerate() {
            let ids = |incoming: bool| -> Vec<String> {
                self.edges
                    .iter()
                    .filter(|e| if incoming { e.to as usize == n } else { e.from as usize == n })
                    .map(edge_id)
                    .collect()
            };
            row["incoming"] = json!(ids(true));
            row["outgoing"] = json!(ids(false));
            row["queue_length"] = Value::Null;
            if at_ms.is_some() {
                row["run_status"] = row["status"].clone();
                row["run_utilisation"] = row["utilisation"].clone();
                match sample {
                    Some(i) => {
                        let s = series.at(i)[n];
                        let (status, util) = self.status[i * nn + n];
                        row["queue_length"] = json!(s.queue);
                        row["busy"] = json!(s.busy);
                        row["capacity_now"] = json!(s.capacity);
                        row["utilisation"] = json!(util);
                        row["status"] = json!(status.name());
                    }
                    None => {
                        row["utilisation"] = Value::Null;
                        row["status"] = Value::Null;
                    }
                }
            }
        }
        let edges: Vec<Value> = self
            .edges
            .iter()
            .enumerate()
            .map(|(i, e)| {
                let outages: Vec<Value> = self
                    .outages
                    .iter()
                    .filter(|o| matches!(o.target, Target::Edge(x) if x == i))
                    .map(|o| json!({ "start_ms": o.start_s as u64 * 1000, "end_ms": o.end_s as u64 * 1000 }))
                    .collect();
                let down = at_ms.is_some_and(|t| {
                    self.outages.iter().any(|o| {
                        matches!(o.target, Target::Edge(x) if x == i) && t >= o.start_s as u64 * 1000 && t < o.end_s as u64 * 1000
                    })
                });
                json!({
                    "id": edge_id(e),
                    "source": e.from,
                    "target": e.to,
                    "travel_time_ms": e.travel_ms,
                    "capacity": Value::Null, // the engine does not enforce edge capacity
                    "traffic_total": self.collected.edge_traffic[i],
                    "available": e.online && !down,
                    "outages": outages,
                })
            })
            .collect();
        let node_outages: Vec<Value> = self
            .outages
            .iter()
            .filter_map(|o| match o.target {
                Target::Node(x) => Some(json!({
                    "node": x, "start_ms": o.start_s as u64 * 1000, "end_ms": o.end_s as u64 * 1000, "capacity_factor": o.factor,
                })),
                Target::Edge(_) => None,
            })
            .collect();
        let per_node: Vec<Value> = (0..nn)
            .map(|n| {
                let col = |f: &dyn Fn(usize) -> u64| -> Vec<u64> { (0..series.len()).map(f).collect() };
                json!({
                    "node": n,
                    "queue": col(&|i| series.at(i)[n].queue as u64),
                    "busy": col(&|i| series.at(i)[n].busy as u64),
                    "capacity": col(&|i| series.at(i)[n].capacity as u64),
                    "arrivals": col(&|i| series.at(i)[n].arrivals as u64),
                    "completions": col(&|i| series.at(i)[n].completions as u64),
                    "status": (0..series.len()).map(|i| self.status[i * nn + n].0.name()).collect::<Vec<_>>(),
                })
            })
            .collect();
        json!({
            "at_ms": at_ms,
            "sample_ms": sample.map(|i| series.times_ms[i]),
            "nodes": nodes,
            "edges": edges,
            "node_outages": node_outages,
            "series": { "interval_ms": series.interval_ms, "times_ms": series.times_ms, "nodes": per_node },
            "status_rule": status_rule(),
        })
    }
}
