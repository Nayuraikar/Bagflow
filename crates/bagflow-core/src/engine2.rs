//! Phase 4 engine: general layered graph, routing strategies, queue policies.
use crate::events::{EventKind, ScheduledEvent};
use crate::soa::BagSoA;
use crate::types::*;
use std::cmp::Reverse;
use std::collections::BinaryHeap;

const INF: u64 = u64::MAX / 4;
const SIGMA: f64 = 0.4;
const HOLD_PROB: f64 = 0.05;
const HOLD_MEAN_MS: f64 = 20_000.0;
const URGENT_MS: i64 = 20 * 60 * 1000; // Deadline strategy: urgent if under 20 min of slack

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Strategy { Dijkstra, Ecmp, Congestion, Deadline }
impl Strategy {
    pub const ALL: [Strategy; 4] = [Strategy::Dijkstra, Strategy::Ecmp, Strategy::Congestion, Strategy::Deadline];
    pub fn name(self) -> &'static str {
        match self { Strategy::Dijkstra => "dijkstra", Strategy::Ecmp => "ecmp", Strategy::Congestion => "congestion", Strategy::Deadline => "deadline" }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Policy { Fcfs, Priority, Edf, Spt }
impl Policy {
    pub const ALL: [Policy; 4] = [Policy::Fcfs, Policy::Priority, Policy::Edf, Policy::Spt];
    pub fn name(self) -> &'static str {
        match self { Policy::Fcfs => "fcfs", Policy::Priority => "priority", Policy::Edf => "edf", Policy::Spt => "spt" }
    }
}

// ---- stateless per-(bag, stage) randomness, so every strategy sees the same service times ----
fn mix(x: u64) -> u64 {
    let mut z = x.wrapping_add(0x9E3779B97F4A7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}
fn u01(seed: u64, bag: u32, stage: u8, k: u8) -> f64 {
    let key = ((bag as u64) << 16) | ((stage as u64) << 8) | k as u64;
    let x = mix(seed ^ mix(key));
    ((x >> 11) as f64 + 0.5) / 9007199254740992.0
}
fn lognormal(seed: u64, bag: u32, stage: u8, k: u8, mean: f64) -> f64 {
    let u1 = u01(seed, bag, stage, k);
    let u2 = u01(seed, bag, stage, k + 1);
    let z = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
    (mean.ln() - SIGMA * SIGMA / 2.0 + SIGMA * z).exp()
}
fn stage(kind: NodeKind) -> u8 {
    match kind {
        NodeKind::CheckIn => 0,
        NodeKind::Identification => 1,
        NodeKind::Screening => 2,
        NodeKind::Conveyor | NodeKind::Sorter | NodeKind::Transfer => 3,
        NodeKind::Loading => 4,
    }
}

type Adj = Vec<Vec<(u16, u32)>>;

fn adjacency(nn: usize, edges: &[Edge]) -> (Adj, Adj) {
    let mut out: Adj = vec![Vec::new(); nn];
    let mut inc: Adj = vec![Vec::new(); nn];
    for e in edges.iter().filter(|e| e.online) {
        out[e.from as usize].push((e.to, e.travel_ms));
        inc[e.to as usize].push((e.from, e.travel_ms));
    }
    (out, inc)
}

/// Dijkstra on the reversed graph: time from arriving at a node until finishing at `dest`
/// (mean service at every node on the way + travel). Free-flow, ignores queues.
fn dijkstra_to(dest: usize, nodes: &[Node], inc: &Adj) -> Vec<u64> {
    let mut d = vec![INF; nodes.len()];
    d[dest] = nodes[dest].mean_service_ms as u64;
    let mut h = BinaryHeap::new();
    h.push(Reverse((d[dest], dest)));
    while let Some(Reverse((dv, v))) = h.pop() {
        if dv > d[v] {
            continue;
        }
        for &(u, tr) in &inc[v] {
            let nd = dv + tr as u64 + nodes[u as usize].mean_service_ms as u64;
            if nd < d[u as usize] {
                d[u as usize] = nd;
                h.push(Reverse((nd, u as usize)));
            }
        }
    }
    d
}

/// (loading node ids, dist[loader index][node])
pub fn dijkstra_table(nodes: &[Node], edges: &[Edge]) -> (Vec<u16>, Vec<Vec<u64>>) {
    let (_, inc) = adjacency(nodes.len(), edges);
    let loaders: Vec<u16> = nodes.iter().filter(|n| n.kind == NodeKind::Loading).map(|n| n.id).collect();
    let dist = loaders.iter().map(|l| dijkstra_to(*l as usize, nodes, &inc)).collect();
    (loaders, dist)
}

fn first_min(c: &[(u16, u32, u64)]) -> (u16, u32) {
    let x = c.iter().min_by_key(|x| x.2).unwrap();
    (x.0, x.1)
}
fn ecmp(c: &[(u16, u32, u64)], bag: u32) -> (u16, u32) {
    let m = c.iter().map(|x| x.2).min().unwrap();
    let eq: Vec<&(u16, u32, u64)> = c.iter().filter(|x| x.2 * 1000 <= m * 1001).collect();
    let x = eq[bag as usize % eq.len()];
    (x.0, x.1)
}

#[derive(Clone, Copy, Debug)]
pub enum Target { Node(u16), Edge(usize) }

/// Timed outage. Node: capacity drops to servers * factor. Edge: goes down (factor ignored).
#[derive(Clone, Copy, Debug)]
pub struct Outage { pub target: Target, pub start_s: u32, pub end_s: u32, pub factor: f64 }

// queue item: (policy key, seq, bag, service ms, enqueued at ms). Min-heap via Reverse.
type QItem = (u64, u64, u32, u32, u64);

struct G<'a> {
    bags: &'a BagSoA,
    nodes: &'a [Node],
    out: Adj,
    dist: Vec<Vec<u64>>,
    loaders: Vec<u16>,
    strat: Strategy,
    policy: Policy,
    seed: u64,
    heap: BinaryHeap<Reverse<ScheduledEvent>>,
    seq: u64,
    queues: Vec<BinaryHeap<Reverse<QItem>>>,
    busy: Vec<u16>,
    arrivals: Vec<u64>,
    wait_ms: Vec<u64>,
    busy_ms: Vec<u64>,
    max_q: Vec<u32>,
    finish: Vec<u64>,
    cap: Vec<u16>,
    edge_up: Vec<bool>,
    eidx: Vec<Vec<usize>>,
}

impl<'a> G<'a> {
    fn push(&mut self, time_ms: u64, kind: EventKind, bag_id: u32, node: u16) {
        self.seq += 1;
        self.heap.push(Reverse(ScheduledEvent { time_ms, kind, bag_id, seq: self.seq, node }));
    }

    fn dur_ms(&self, bag: u32, node: usize) -> u32 {
        let nd = &self.nodes[node];
        let st = stage(nd.kind);
        let mut d = lognormal(self.seed, bag, st, 0, nd.mean_service_ms as f64);
        if nd.kind == NodeKind::Screening && u01(self.seed, bag, st, 2) < HOLD_PROB {
            d += lognormal(self.seed, bag, st, 3, HOLD_MEAN_MS); // extra inspection time
        }
        (d as u64).max(1).min(u32::MAX as u64) as u32
    }

    fn key(&self, bag: u32, dur: u32) -> u64 {
        let b = bag as usize;
        match self.policy {
            Policy::Fcfs => 0,
            Policy::Priority => match self.bags.priority[b] {
                PRIO_TIGHT => 0,
                PRIO_PRIORITY => 1,
                _ => 2,
            },
            Policy::Edf => self.bags.deadline_s[b] as u64 * 1000,
            Policy::Spt => dur as u64,
        }
    }

    fn wait_est(&self, v: u16) -> f64 {
        let n = v as usize;
        let s = self.cap[n].max(1) as f64;
        let load = self.queues[n].len() as f64 + self.busy[n] as f64 + 1.0;
        ((load - s).max(0.0) / s) * self.nodes[n].mean_service_ms as f64
    }

    fn dynamic(&self, c: &[(u16, u32, u64)]) -> (u16, u32) {
        let mut best = (c[0].0, c[0].1);
        let mut bc = f64::MAX;
        for x in c {
            let cost = x.2 as f64 + self.wait_est(x.0);
            if cost < bc {
                bc = cost;
                best = (x.0, x.1);
            }
        }
        best
    }

    fn next_hop(&self, t: u64, bag: u32, u: usize) -> (u16, u32) {
        let b = bag as usize;
        let li = self.bags.flight[b] as usize % self.loaders.len();
        let row = &self.dist[li];
        let all: Vec<(u16, u32, u64, bool)> = self.out[u]
            .iter()
            .enumerate()
            .filter(|(_, (v, _))| row[*v as usize] < INF)
            .map(|(i, (v, tr))| (*v, *tr, *tr as u64 + row[*v as usize], self.edge_up[self.eidx[u][i]]))
            .collect();
        let mut c: Vec<(u16, u32, u64)> = all.iter().filter(|x| x.3).map(|x| (x.0, x.1, x.2)).collect();
        if c.is_empty() {
            c = all.iter().map(|x| (x.0, x.1, x.2)).collect(); // no live alternative: use the edge anyway
        }
        debug_assert!(!c.is_empty());
        match self.strat {
            Strategy::Dijkstra => first_min(&c),
            Strategy::Ecmp => ecmp(&c, bag),
            Strategy::Congestion => self.dynamic(&c),
            Strategy::Deadline => {
                let slack = self.bags.deadline_s[b] as i64 * 1000 - t as i64;
                if slack < URGENT_MS { self.dynamic(&c) } else { ecmp(&c, bag) }
            }
        }
    }

    fn outage(&mut self, t: u64, i: usize, start: bool, outs: &[Outage]) {
        let o = outs[i];
        match o.target {
            Target::Node(x) => {
                let n = x as usize;
                if start {
                    self.cap[n] = (self.nodes[n].servers as f64 * o.factor).floor() as u16;
                } else {
                    self.cap[n] = self.nodes[n].servers;
                    while self.busy[n] < self.cap[n] {
                        match self.queues[n].pop() {
                            Some(Reverse((_, _, nb, nd, enq))) => self.start(t, nb, x, nd, enq),
                            None => break,
                        }
                    }
                }
            }
            Target::Edge(e) => self.edge_up[e] = !start,
        }
    }

    fn arrive(&mut self, t: u64, bag: u32, node: u16) {
        let n = node as usize;
        self.arrivals[n] += 1;
        let dur = self.dur_ms(bag, n);
        if self.busy[n] < self.cap[n] {
            self.start(t, bag, node, dur, t);
        } else {
            let k = self.key(bag, dur);
            self.seq += 1;
            self.queues[n].push(Reverse((k, self.seq, bag, dur, t)));
            let q = self.queues[n].len() as u32;
            if q > self.max_q[n] {
                self.max_q[n] = q;
            }
        }
    }

    fn start(&mut self, t: u64, bag: u32, node: u16, dur: u32, enq: u64) {
        let n = node as usize;
        self.busy[n] += 1;
        self.wait_ms[n] += t - enq;
        self.busy_ms[n] += dur as u64;
        self.push(t + dur as u64, EventKind::ServiceComplete, bag, node);
    }

    fn complete(&mut self, t: u64, bag: u32, node: u16) {
        let n = node as usize;
        self.busy[n] -= 1;
        if self.busy[n] < self.cap[n] {
            if let Some(Reverse((_, _, nb, ndur, enq))) = self.queues[n].pop() {
                self.start(t, nb, node, ndur, enq);
            }
        }
        if self.nodes[n].kind == NodeKind::Loading {
            self.finish[bag as usize] = t;
            return;
        }
        let (to, travel) = self.next_hop(t, bag, n);
        self.push(t + travel as u64, EventKind::TransitComplete, bag, to);
    }
}

pub struct RunStats {
    pub n: usize,
    pub loaded: u64,
    pub delayed: u64,
    pub unfinished: u64,
    pub tight_total: u64,
    pub tight_delayed: u64,
    pub mean_sojourn_s: f64,
    pub p95_sojourn_s: f64,
    pub arrivals: Vec<u64>,
    pub max_queue: Vec<u32>,
    pub avg_wait_s: Vec<f64>,
    pub util: Vec<f64>,
    pub checksum: u64,
}

pub fn run(bags: &BagSoA, nodes: &[Node], edges: &[Edge], strat: Strategy, policy: Policy, seed: u64) -> RunStats {
    run_with(bags, nodes, edges, strat, policy, seed, &[])
}

pub fn run_with(bags: &BagSoA, nodes: &[Node], edges: &[Edge], strat: Strategy, policy: Policy, seed: u64, outages: &[Outage]) -> RunStats {
    let nn = nodes.len();
    let (out, _) = adjacency(nn, edges);
    let (loaders, dist) = dijkstra_table(nodes, edges);
    let mut eidx: Vec<Vec<usize>> = vec![Vec::new(); nn];
    for (i, e) in edges.iter().enumerate() {
        if e.online {
            eidx[e.from as usize].push(i);
        }
    }
    let mut g = G {
        bags,
        nodes,
        out,
        dist,
        loaders,
        strat,
        policy,
        seed,
        heap: BinaryHeap::new(),
        seq: 0,
        queues: (0..nn).map(|_| BinaryHeap::new()).collect(),
        busy: vec![0; nn],
        arrivals: vec![0; nn],
        wait_ms: vec![0; nn],
        busy_ms: vec![0; nn],
        max_q: vec![0; nn],
        finish: vec![0; bags.len()],
        cap: nodes.iter().map(|x| x.servers).collect(),
        edge_up: vec![true; edges.len()],
        eidx,
    };
    for i in 0..bags.len() {
        g.push(bags.arrival_s[i] as u64 * 1000, EventKind::Arrival, i as u32, 0);
    }
    for (i, o) in outages.iter().enumerate() {
        let nd = match o.target { Target::Node(x) => x, Target::Edge(_) => 0 };
        g.push(o.start_s as u64 * 1000, EventKind::Failure, i as u32, nd);
        g.push(o.end_s as u64 * 1000, EventKind::Repair, i as u32, nd);
    }
    let mut end_ms = 0;
    while let Some(Reverse(ev)) = g.heap.pop() {
        end_ms = ev.time_ms;
        match ev.kind {
            EventKind::Arrival => g.arrive(ev.time_ms, ev.bag_id, 0),
            EventKind::TransitComplete => g.arrive(ev.time_ms, ev.bag_id, ev.node),
            EventKind::ServiceComplete => g.complete(ev.time_ms, ev.bag_id, ev.node),
            EventKind::Failure => g.outage(ev.time_ms, ev.bag_id as usize, true, outages),
            EventKind::Repair => g.outage(ev.time_ms, ev.bag_id as usize, false, outages),
        }
    }

    let (mut loaded, mut delayed, mut unfinished, mut tight_total, mut tight_delayed) = (0u64, 0u64, 0u64, 0u64, 0u64);
    let mut sojourn: Vec<u32> = Vec::with_capacity(bags.len());
    let mut sum = 0.0f64;
    for i in 0..bags.len() {
        let f = g.finish[i];
        let tight = bags.priority[i] == PRIO_TIGHT;
        if tight {
            tight_total += 1;
        }
        if f == 0 {
            unfinished += 1;
            continue;
        }
        if f <= bags.deadline_s[i] as u64 * 1000 {
            loaded += 1;
        } else {
            delayed += 1;
            if tight {
                tight_delayed += 1;
            }
        }
        let s = ((f - bags.arrival_s[i] as u64 * 1000) / 1000) as u32;
        sum += s as f64;
        sojourn.push(s);
    }
    let m = sojourn.len().max(1);
    let p95 = if sojourn.is_empty() { 0.0 } else {
        let idx = (m as f64 * 0.95) as usize;
        let idx = idx.min(m - 1);
        *sojourn.select_nth_unstable(idx).1 as f64
    };

    let first_ms = bags.arrival_s.first().copied().unwrap_or(0) as f64 * 1000.0;
    let span = (end_ms as f64 - first_ms).max(1.0);
    let mut h: u64 = 0xcbf29ce484222325;
    for f in &g.finish {
        for b in f.to_le_bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
    }
    RunStats {
        n: bags.len(),
        loaded,
        delayed,
        unfinished,
        tight_total,
        tight_delayed,
        mean_sojourn_s: sum / m as f64,
        p95_sojourn_s: p95,
        avg_wait_s: (0..nn).map(|i| g.wait_ms[i] as f64 / g.arrivals[i].max(1) as f64 / 1000.0).collect(),
        util: (0..nn).map(|i| g.busy_ms[i] as f64 / (nodes[i].servers as f64 * span)).collect(),
        arrivals: g.arrivals,
        max_queue: g.max_q,
        checksum: h,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::slice_bags;
    use crate::generator::{generate, GenConfig};
    use crate::network::airport_network;

    fn bags() -> BagSoA {
        let (_, all) = generate(&GenConfig { seed: 5, target_bags: 20_000 });
        slice_bags(&all, 17 * 3600, 3000)
    }

    #[test]
    fn dijkstra_reaches_only_the_bags_own_loader() {
        let (nodes, edges) = airport_network(1);
        let (loaders, dist) = dijkstra_table(&nodes, &edges);
        assert_eq!(loaders.len(), 3);
        for (li, row) in dist.iter().enumerate() {
            for (i, d) in row.iter().enumerate() {
                if nodes[i].kind == NodeKind::Loading {
                    assert_eq!(*d < INF, i as u16 == loaders[li]);
                } else {
                    assert!(*d < INF, "node {i} cannot reach loader {li}");
                }
            }
        }
    }

    #[test]
    fn all_sixteen_combinations_conserve_bags() {
        let b = bags();
        let n = b.len() as u64;
        assert!(n > 1000);
        let (nodes, edges) = airport_network(1);
        for s in Strategy::ALL {
            for p in Policy::ALL {
                let r = run(&b, &nodes, &edges, s, p, 1);
                assert_eq!(r.unfinished, 0, "{:?}/{:?}", s, p);
                assert_eq!(r.loaded + r.delayed, n);
                assert_eq!(r.arrivals[0], n);
                let at_loaders: u64 = nodes.iter().filter(|x| x.kind == NodeKind::Loading).map(|x| r.arrivals[x.id as usize]).sum();
                assert_eq!(at_loaders, n);
            }
        }
    }

    #[test]
    fn same_inputs_same_result() {
        let b = bags();
        let (nodes, edges) = airport_network(1);
        let a = run(&b, &nodes, &edges, Strategy::Congestion, Policy::Edf, 7);
        let c = run(&b, &nodes, &edges, Strategy::Congestion, Policy::Edf, 7);
        assert_eq!(a.checksum, c.checksum);
    }
}
