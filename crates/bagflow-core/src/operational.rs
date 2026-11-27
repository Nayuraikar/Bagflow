//! Operational parallel mode: the independent per-bag work that engine2 needs before its
//! event loop, computed over index ranges either sequentially or on a Rayon pool.
//!
//! Three task kinds, run one after the other (route+service needs the flight grouping):
//! - check-in registration: each bag's arrival time in ms;
//! - flight grouping: each bag's loading area (index into the loaders);
//! - route+service (dijkstra and ecmp only, without edge outages): each bag's full route
//!   and its service time at every node on it.
//!
//! Every value is a pure function of (bag table, network, seed): the engine's randomness
//! is a stateless hash of (seed, bag, stage), so the result does not depend on how the bags
//! are split or which worker computes them. Workers only read shared data and return
//! their own chunk. The event loop, queues, server allocation and event order stay
//! sequential in engine2.
//!
//! Congestion-aware routing reads the live queues at the moment a bag leaves a node, and
//! deadline-aware routing reads the current time and then the queues. Their routes depend
//! on event order, so they keep the existing in-loop path and only check-in registration and
//! flight grouping are precomputed. The same goes for any routing during an edge outage,
//! because which edges are up then depends on time.
use crate::engine2::{adjacency, candidates, dijkstra_table, service_ms, static_pick, Outage, Strategy, Target};
use crate::soa::BagSoA;
use crate::types::*;
use rayon::prelude::*;
use std::ops::Range;
use std::time::Instant;

/// Tasks per worker for each kind, so work stealing can balance uneven ranges.
pub const TASKS_PER_WORKER: usize = 4;
/// Longest route the precompute accepts; the hop cursor is a u8.
const MAX_HOPS: usize = 255;
pub const NO_NEXT: u16 = u16::MAX;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskKind {
    Checkin,
    FlightGrouping,
    RouteService,
}

/// What one task did, measured while it ran.
#[derive(Clone, Copy, Debug, serde::Serialize)]
pub struct TaskRecord {
    pub id: usize,
    pub kind: TaskKind,
    /// Rayon worker index (0 in the sequential version).
    pub worker: usize,
    /// Wall time relative to the start of the precompute job.
    pub start_ms: f64,
    pub end_ms: f64,
    /// Bags in the task's range.
    pub size: usize,
}

/// One visit: service time at `node`, then the hop to `next` (`NO_NEXT` at the loader).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Hop {
    pub node: u16,
    pub next: u16,
    pub dur: u32,
    pub travel: u32,
}

/// Routes of one contiguous range of bags.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RouteChunk {
    /// `off[i]..off[i + 1]` are the hops of bag `start + i`.
    off: Vec<u32>,
    hops: Vec<Hop>,
}

#[derive(Clone, Debug)]
pub struct Routes {
    n: usize,
    /// Bags per chunk; every chunk but the last has exactly this many.
    chunk: usize,
    chunks: Vec<RouteChunk>,
}

impl Routes {
    #[inline]
    pub fn hop(&self, bag: u32, k: u8) -> Hop {
        let b = bag as usize;
        let c = &self.chunks[b / self.chunk];
        c.hops[c.off[b % self.chunk] as usize + k as usize]
    }

    /// All hops of one bag, in visiting order.
    pub fn bag_hops(&self, bag: usize) -> &[Hop] {
        let c = &self.chunks[bag / self.chunk];
        let i = bag % self.chunk;
        &c.hops[c.off[i] as usize..c.off[i + 1] as usize]
    }

    pub fn total_hops(&self) -> usize {
        self.chunks.iter().map(|c| c.hops.len()).sum()
    }
}

/// The precomputed per-bag values. Equality ignores nothing but the telemetry.
#[derive(Clone, Debug)]
pub struct Precomputed {
    pub seed: u64,
    pub strategy: Strategy,
    pub arrival_ms: Vec<u64>,
    pub loader: Vec<u16>,
    /// `None` when routes cannot be fixed in advance; `routes_note` says why.
    pub routes: Option<Routes>,
    pub routes_note: &'static str,
    pub tasks: Vec<TaskRecord>,
    pub workers: usize,
    pub parallel: bool,
}

/// Same route and service times for every bag, however the bags were split into tasks.
impl PartialEq for Routes {
    fn eq(&self, o: &Self) -> bool {
        self.n == o.n && (0..self.n).all(|b| self.bag_hops(b) == o.bag_hops(b))
    }
}

impl PartialEq for Precomputed {
    fn eq(&self, o: &Self) -> bool {
        (self.seed, self.strategy, &self.arrival_ms, &self.loader, &self.routes)
            == (o.seed, o.strategy, &o.arrival_ms, &o.loader, &o.routes)
    }
}

/// Whether routes and service times can be fixed per bag before the loop, and why not.
pub fn route_precompute(strat: Strategy, outages: &[Outage]) -> Result<(), &'static str> {
    match strat {
        Strategy::Congestion => Err("congestion-aware routing reads live queue lengths, so routes depend on event order"),
        Strategy::Deadline => Err("deadline-aware routing reads the current time and live queues, so routes depend on event order"),
        _ if outages.iter().any(|o| matches!(o.target, Target::Edge(_))) => {
            Err("an edge outage changes which edges are up over time, so routes depend on event time")
        }
        _ => Ok(()),
    }
}

/// Equal contiguous ranges, at least `TASKS_PER_WORKER` per worker.
pub fn plan(n: usize, workers: usize) -> Vec<Range<usize>> {
    let tasks = (workers.max(1) * TASKS_PER_WORKER).max(1);
    let size = n.div_ceil(tasks).max(1);
    (0..n).step_by(size).map(|s| s..(s + size).min(n)).collect()
}

/// Read-only inputs shared by every task.
struct Ctx<'a> {
    bags: &'a BagSoA,
    nodes: &'a [Node],
    out: Vec<Vec<(u16, u32)>>,
    eidx: Vec<Vec<usize>>,
    edge_up: Vec<bool>,
    dist: Vec<Vec<u64>>,
    nloaders: usize,
    strat: Strategy,
    seed: u64,
}

// ---- the pure per-range functions, shared by the sequential and the parallel version ----

fn checkin(cx: &Ctx, r: Range<usize>) -> Vec<u64> {
    cx.bags.arrival_s[r].iter().map(|&a| a as u64 * 1000).collect()
}

fn flight_grouping(cx: &Ctx, r: Range<usize>) -> Vec<u16> {
    cx.bags.flight[r].iter().map(|&f| (f as usize % cx.nloaders) as u16).collect()
}

fn route_service(cx: &Ctx, loader: &[u16], r: Range<usize>) -> RouteChunk {
    let mut off = Vec::with_capacity(r.len() + 1);
    let mut hops = Vec::with_capacity(r.len() * 8);
    off.push(0);
    for b in r {
        let bag = b as u32;
        let row = &cx.dist[loader[b] as usize];
        let start = hops.len();
        let mut u = 0usize; // every bag enters at check-in, node 0
        loop {
            let nd = &cx.nodes[u];
            let dur = service_ms(cx.seed, bag, nd);
            if nd.kind == NodeKind::Loading {
                hops.push(Hop { node: u as u16, next: NO_NEXT, dur, travel: 0 });
                break;
            }
            let c = candidates(&cx.out[u], &cx.eidx[u], &cx.edge_up, row);
            let (v, travel) = static_pick(cx.strat, &c, bag).expect("route precompute is only used for static routing");
            hops.push(Hop { node: u as u16, next: v, dur, travel });
            assert!(hops.len() - start < MAX_HOPS, "route of bag {b} exceeds {MAX_HOPS} hops");
            u = v as usize;
        }
        off.push(hops.len() as u32);
    }
    RouteChunk { off, hops }
}

/// Runs one kind's tasks over `ranges`, sequentially or on `pool`, recording each task.
fn run_kind<T: Send>(
    pool: Option<&rayon::ThreadPool>,
    ranges: &[Range<usize>],
    kind: TaskKind,
    first_id: usize,
    t0: Instant,
    f: &(dyn Fn(Range<usize>) -> T + Sync),
) -> Vec<(T, TaskRecord)> {
    let task = |(i, r): (usize, &Range<usize>)| {
        let start_ms = t0.elapsed().as_secs_f64() * 1e3;
        let out = f(r.clone());
        let end_ms = t0.elapsed().as_secs_f64() * 1e3;
        let worker = rayon::current_thread_index().unwrap_or(0);
        (out, TaskRecord { id: first_id + i, kind, worker, start_ms, end_ms, size: r.len() })
    };
    match pool {
        None => ranges.iter().enumerate().map(task).collect(),
        Some(p) => p.install(|| ranges.par_iter().enumerate().map(task).collect()),
    }
}

/// The precompute. `pool: None` runs every task on the calling thread; `Some` spreads the
/// same tasks over the pool. `workers` sets the task plan in both cases, so the two
/// versions run identical ranges.
pub fn precompute(
    bags: &BagSoA,
    nodes: &[Node],
    edges: &[Edge],
    strat: Strategy,
    seed: u64,
    outages: &[Outage],
    workers: usize,
    pool: Option<&rayon::ThreadPool>,
) -> Precomputed {
    let t0 = Instant::now();
    let (out, _) = adjacency(nodes.len(), edges);
    let (loaders, dist) = dijkstra_table(nodes, edges);
    let mut eidx: Vec<Vec<usize>> = vec![Vec::new(); nodes.len()];
    for (i, e) in edges.iter().enumerate() {
        if e.online {
            eidx[e.from as usize].push(i);
        }
    }
    let cx = Ctx { bags, nodes, out, eidx, edge_up: vec![true; edges.len()], dist, nloaders: loaders.len(), strat, seed };
    let ranges = plan(bags.len(), workers);
    let mut tasks = Vec::new();

    let mut arrival_ms = Vec::with_capacity(bags.len());
    for (v, rec) in run_kind(pool, &ranges, TaskKind::Checkin, tasks.len(), t0, &|r| checkin(&cx, r)) {
        arrival_ms.extend_from_slice(&v);
        tasks.push(rec);
    }
    let mut loader = Vec::with_capacity(bags.len());
    for (v, rec) in run_kind(pool, &ranges, TaskKind::FlightGrouping, tasks.len(), t0, &|r| flight_grouping(&cx, r)) {
        loader.extend_from_slice(&v);
        tasks.push(rec);
    }
    let (routes, routes_note) = match route_precompute(strat, outages) {
        Ok(()) => {
            let chunk = ranges.first().map_or(1, |r| r.len());
            let mut chunks = Vec::with_capacity(ranges.len());
            for (c, rec) in run_kind(pool, &ranges, TaskKind::RouteService, tasks.len(), t0, &|r| route_service(&cx, &loader, r)) {
                chunks.push(c);
                tasks.push(rec);
            }
            (Some(Routes { n: bags.len(), chunk, chunks }), "routes and service times precomputed per bag")
        }
        Err(why) => (None, why),
    };
    Precomputed { seed, strategy: strat, arrival_ms, loader, routes, routes_note, tasks, workers, parallel: pool.is_some() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine2::{run_with, run_with_pre, Policy};
    use crate::generator::{generate, GenConfig};
    use crate::network::airport_network;

    #[test]
    fn plan_covers_every_bag_once_with_enough_tasks() {
        for (n, w) in [(0, 1), (1, 8), (10, 4), (250_086, 8), (1000, 3)] {
            let p = plan(n, w);
            assert!(p.len() >= (w * TASKS_PER_WORKER).min(n));
            assert_eq!(p.iter().map(|r| r.len()).sum::<usize>(), n);
            assert!(p.windows(2).all(|x| x[0].end == x[1].start));
        }
    }

    #[test]
    fn small_runs_match_for_every_routing_and_policy() {
        let (_, bags) = generate(&GenConfig { seed: 3, target_bags: 15_000 });
        let (nodes, edges) = airport_network(1);
        let pool = rayon::ThreadPoolBuilder::new().num_threads(3).build().unwrap();
        for st in Strategy::ALL {
            let seq = precompute(&bags, &nodes, &edges, st, 9, &[], 3, None);
            let par = precompute(&bags, &nodes, &edges, st, 9, &[], 3, Some(&pool));
            assert_eq!(seq, par);
            assert_eq!(seq.routes.is_some(), matches!(st, Strategy::Dijkstra | Strategy::Ecmp));
            for po in Policy::ALL {
                let a = run_with(&bags, &nodes, &edges, st, po, 9, &[]);
                let b = run_with_pre(&bags, &nodes, &edges, st, po, 9, &[], &par);
                assert_eq!((a.checksum, a.delayed, &a.arrivals), (b.checksum, b.delayed, &b.arrivals), "{st:?}/{po:?}");
            }
        }
    }
}
