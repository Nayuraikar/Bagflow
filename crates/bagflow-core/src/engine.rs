use crate::events::{EventKind, LogEvent, ScheduledEvent};
use crate::network::*;
use crate::rng::{stream_rng, Stream};
use crate::soa::BagSoA;
use crate::state::BagState;
use crate::types::*;
use rand::Rng;
use rand_chacha::ChaCha8Rng;
use rand_distr::{Distribution, LogNormal};
use std::cmp::Reverse;
use std::collections::{BinaryHeap, VecDeque};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

const SERVICE_SIGMA: f64 = 0.4; // lognormal spread of service times
const HOLD_PROB: f64 = 0.05; // share of bags escalated to inspection
const HOLD_MEAN_MS: f64 = 20_000.0;

#[derive(Debug, Clone, Default)]
pub struct NodeStats {
    pub arrivals: u64,
    pub completed: u64,
    pub total_wait_ms: u64,
    pub max_queue: u32,
    pub busy_ms: u64,
}

pub struct SimResult {
    pub log: Vec<LogEvent>,
    pub stats: Vec<NodeStats>,
    pub final_state: Vec<BagState>,
    pub end_ms: u64,
}

struct NodeRt {
    queue: VecDeque<(u32, u64)>, // (bag, time it joined the queue)
    busy: u16,
}

struct Sim<'a> {
    bags: &'a BagSoA,
    nodes: &'a [Node],
    edges: &'a [Edge],
    rng: ChaCha8Rng,
    heap: BinaryHeap<Reverse<ScheduledEvent>>,
    seq: u64,
    rt: Vec<NodeRt>,
    stats: Vec<NodeStats>,
    state: Vec<BagState>,
    log: Vec<LogEvent>,
}

impl<'a> Sim<'a> {
    fn push(&mut self, time_ms: u64, kind: EventKind, bag_id: u32, node: u16) {
        self.seq += 1;
        self.heap.push(Reverse(ScheduledEvent { time_ms, kind, bag_id, seq: self.seq, node }));
    }

    fn transition(&mut self, t: u64, bag: u32, to: BagState, node: u16) {
        let from = self.state[bag as usize];
        debug_assert!(from.can_transition_to(to), "illegal {:?} -> {:?}", from, to);
        self.log.push(LogEvent { time_ms: t, bag_id: bag, from, to, node });
        self.state[bag as usize] = to;
    }

    fn lognormal_ms(&mut self, mean_ms: f64) -> u64 {
        let mu = mean_ms.ln() - SERVICE_SIGMA * SERVICE_SIGMA / 2.0;
        let d = LogNormal::new(mu, SERVICE_SIGMA).unwrap();
        (d.sample(&mut self.rng) as u64).max(1)
    }

    fn spawn(&mut self, t: u64, bag: u32) {
        // from == to marks the creation event in the log
        self.log.push(LogEvent {
            time_ms: t,
            bag_id: bag,
            from: BagState::CheckedIn,
            to: BagState::CheckedIn,
            node: N_CHECKIN,
        });
        self.arrive(t, bag, N_CHECKIN);
    }

    fn arrive(&mut self, t: u64, bag: u32, node: u16) {
        match node {
            N_IDENT => self.transition(t, bag, BagState::Identified, node),
            N_SCREEN => self.transition(t, bag, BagState::Screening, node),
            N_CONVEYOR => self.transition(t, bag, BagState::InTransit, node),
            N_SORTER => self.transition(t, bag, BagState::Sorted, node),
            N_LOADING => self.transition(t, bag, BagState::Loading, node),
            _ => {}
        }
        let n = node as usize;
        self.stats[n].arrivals += 1;
        if self.rt[n].busy < self.nodes[n].servers {
            self.start_service(t, bag, node, t);
        } else {
            self.rt[n].queue.push_back((bag, t));
            let q = self.rt[n].queue.len() as u32;
            if q > self.stats[n].max_queue {
                self.stats[n].max_queue = q;
            }
        }
    }

    fn start_service(&mut self, t: u64, bag: u32, node: u16, enqueued: u64) {
        let n = node as usize;
        self.rt[n].busy += 1;
        self.stats[n].total_wait_ms += t - enqueued;
        let mean = self.nodes[n].mean_service_ms as f64;
        let dur = self.lognormal_ms(mean);
        self.stats[n].busy_ms += dur;
        self.push(t + dur, EventKind::ServiceComplete, bag, node);
    }

    fn complete(&mut self, t: u64, bag: u32, node: u16) {
        let b = bag as usize;
        if node == N_SCREEN {
            if self.state[b] == BagState::Screening && self.rng.gen_bool(HOLD_PROB) {
                // escalate: the bag keeps its server for an extra inspection time
                self.transition(t, bag, BagState::HeldForInspection, node);
                let extra = self.lognormal_ms(HOLD_MEAN_MS);
                self.stats[node as usize].busy_ms += extra;
                self.push(t + extra, EventKind::ServiceComplete, bag, node);
                return;
            }
            self.transition(t, bag, BagState::Cleared, node);
        } else if node == N_SORTER {
            if self.bags.flags[b] & FLAG_TRANSFER != 0 {
                self.transition(t, bag, BagState::TransferPending, node);
            }
        } else if node == N_LOADING {
            let deadline_ms = self.bags.deadline_s[b] as u64 * 1000;
            let to = if t <= deadline_ms { BagState::Loaded } else { BagState::Delayed };
            self.transition(t, bag, to, node);
        }

        let n = node as usize;
        self.stats[n].completed += 1;
        self.rt[n].busy -= 1;
        if let Some((next, enq)) = self.rt[n].queue.pop_front() {
            self.start_service(t, next, node, enq); // FCFS
        }
        if node != N_LOADING {
            let (travel, to) = {
                let e = &self.edges[n];
                debug_assert_eq!(e.from, node);
                (e.travel_ms as u64, e.to)
            };
            self.push(t + travel, EventKind::TransitComplete, bag, to);
        }
    }
}

pub fn simulate(bags: &BagSoA, nodes: &[Node], edges: &[Edge], seed: u64) -> SimResult {
    let mut sim = Sim {
        bags,
        nodes,
        edges,
        rng: stream_rng(seed, Stream::Screening),
        heap: BinaryHeap::new(),
        seq: 0,
        rt: (0..nodes.len()).map(|_| NodeRt { queue: VecDeque::new(), busy: 0 }).collect(),
        stats: vec![NodeStats::default(); nodes.len()],
        state: vec![BagState::CheckedIn; bags.len()],
        log: Vec::with_capacity(bags.len() * 10),
    };
    for i in 0..bags.len() {
        sim.push(bags.arrival_s[i] as u64 * 1000, EventKind::Arrival, i as u32, N_CHECKIN);
    }
    let mut end_ms = 0;
    while let Some(Reverse(ev)) = sim.heap.pop() {
        end_ms = ev.time_ms;
        match ev.kind {
            EventKind::Arrival => sim.spawn(ev.time_ms, ev.bag_id),
            EventKind::TransitComplete => sim.arrive(ev.time_ms, ev.bag_id, ev.node),
            EventKind::ServiceComplete => sim.complete(ev.time_ms, ev.bag_id, ev.node),
            EventKind::Repair | EventKind::Failure => {} // Phase 7
        }
    }
    SimResult { log: sim.log, stats: sim.stats, final_state: sim.state, end_ms }
}

/// Take `n` bags starting at the first arrival >= start_s (input must be sorted by arrival).
pub fn slice_bags(all: &BagSoA, start_s: u32, n: usize) -> BagSoA {
    let start = all.arrival_s.partition_point(|a| *a < start_s);
    let mut out = BagSoA::default();
    for i in start..(start + n).min(all.len()) {
        out.push(all.pax[i], all.flight[i], all.weight_dg[i], all.priority[i], all.flags[i], all.arrival_s[i], all.deadline_s[i]);
    }
    out
}

pub fn log_checksum(log: &[LogEvent]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for e in log {
        for v in [e.time_ms, e.bag_id as u64, e.from as u64, e.to as u64, e.node as u64] {
            for b in v.to_le_bytes() {
                h ^= b as u64;
                h = h.wrapping_mul(0x100000001b3);
            }
        }
    }
    h
}

/// Binary event log for the frontend. Header: "BFEV0001" + n (u64 LE).
/// Then n records of 12 bytes: time_ms u32, bag u32, from u8, to u8, node u8, 0.
pub fn write_log_bin(log: &[LogEvent], path: &Path) -> std::io::Result<()> {
    let mut w = BufWriter::new(File::create(path)?);
    w.write_all(b"BFEV0001")?;
    w.write_all(&(log.len() as u64).to_le_bytes())?;
    for e in log {
        w.write_all(&(e.time_ms as u32).to_le_bytes())?;
        w.write_all(&e.bag_id.to_le_bytes())?;
        w.write_all(&[e.from as u8, e.to as u8, e.node as u8, 0])?;
    }
    w.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generator::{generate, GenConfig};

    fn small() -> BagSoA {
        let (_, all) = generate(&GenConfig { seed: 5, target_bags: 20_000 });
        slice_bags(&all, 0, 1000)
    }

    #[test]
    fn conservation_no_bag_lost_or_created() {
        let bags = small();
        let (nodes, edges) = slice_network();
        let r = simulate(&bags, &nodes, &edges, 1);
        assert_eq!(bags.len(), 1000);
        for s in &r.final_state {
            assert!(s.is_terminal(), "bag stuck in {:?}", s);
        }
        let spawns = r.log.iter().filter(|e| e.from == e.to).count();
        assert_eq!(spawns, bags.len());
        for st in &r.stats {
            assert_eq!(st.arrivals as usize, bags.len());
            assert_eq!(st.completed as usize, bags.len());
        }
    }

    #[test]
    fn every_transition_is_legal_and_chained_and_time_ordered() {
        let bags = small();
        let (nodes, edges) = slice_network();
        let r = simulate(&bags, &nodes, &edges, 1);
        let mut last = vec![BagState::CheckedIn; bags.len()];
        let mut t_prev = 0;
        for e in &r.log {
            assert!(e.time_ms >= t_prev);
            t_prev = e.time_ms;
            if e.from != e.to {
                assert_eq!(last[e.bag_id as usize], e.from);
                assert!(e.from.can_transition_to(e.to));
                last[e.bag_id as usize] = e.to;
            }
        }
    }

    #[test]
    fn same_seed_same_log_different_seed_differs() {
        let bags = small();
        let (nodes, edges) = slice_network();
        let a = simulate(&bags, &nodes, &edges, 1);
        let b = simulate(&bags, &nodes, &edges, 1);
        let c = simulate(&bags, &nodes, &edges, 2);
        assert_eq!(log_checksum(&a.log), log_checksum(&b.log));
        assert_ne!(log_checksum(&a.log), log_checksum(&c.log));
    }
}
