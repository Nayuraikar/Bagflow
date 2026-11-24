//! The six operational scenarios. Each takes the base dataset and network and returns
//! the modified workload plus any timed outages.
use crate::engine2::{Outage, Target};
use crate::soa::BagSoA;
use crate::types::*;

pub const ALL: [Scenario; 6] = [
    Scenario::Normal,
    Scenario::PeakSurge,
    Scenario::ConveyorFailure,
    Scenario::ScreeningDelay,
    Scenario::ConnectingRush,
    Scenario::SorterOverload,
];

const W0: u32 = 17 * 3600; // 17:00, the evening peak
const W1: u32 = 19 * 3600;
const OUTAGE_S: u32 = 90 * 60; // 90 minutes

pub struct Setup {
    pub bags: BagSoA,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub outages: Vec<Outage>,
}

/// Stateless uniform [0,1) per (seed, item, salt): scenarios are reproducible and order-independent.
fn h01(seed: u64, i: usize, salt: u64) -> f64 {
    let mut z = seed ^ (i as u64).wrapping_mul(0x9E3779B97F4A7C15) ^ salt.wrapping_mul(0xD1B54A32D192ED03);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^= z >> 31;
    (z >> 11) as f64 / 9007199254740992.0
}

fn edge_index(edges: &[Edge], from: u16, to: u16) -> usize {
    edges.iter().position(|e| e.from == from && e.to == to).expect("edge not in network")
}

pub fn build(sc: Scenario, base: &BagSoA, nodes: &[Node], edges: &[Edge], seed: u64) -> Setup {
    let mut bags = base.clone();
    let mut outages = Vec::new();
    match sc {
        Scenario::Normal => {}
        Scenario::PeakSurge => {
            // 50% extra bags 17:00-18:00, arriving up to 10 min after their original
            for i in 0..base.len() {
                let a = base.arrival_s[i];
                if a >= W0 && a < W0 + 3600 && h01(seed, i, 1) < 0.5 {
                    let off = (h01(seed, i, 2) * 600.0) as u32;
                    let na = (a + off).min(base.deadline_s[i] - 1);
                    bags.push(base.pax[i], base.flight[i], base.weight_dg[i], base.priority[i], base.flags[i], na, base.deadline_s[i]);
                }
            }
        }
        Scenario::ConveyorFailure => {
            outages.push(Outage { target: Target::Edge(edge_index(edges, 2, 4)), start_s: W0, end_s: W0 + OUTAGE_S, factor: 0.0 });
        }
        Scenario::ScreeningDelay => {
            outages.push(Outage { target: Target::Node(2), start_s: W0, end_s: W0 + OUTAGE_S, factor: 0.4 });
        }
        Scenario::ConnectingRush => {
            for i in 0..bags.len() {
                let a = bags.arrival_s[i];
                if bags.flags[i] & FLAG_TRANSFER != 0 && a >= W0 && a < W0 + OUTAGE_S && h01(seed, i, 3) < 0.6 {
                    bags.priority[i] = PRIO_TIGHT;
                    bags.deadline_s[i] = bags.deadline_s[i].min(a + 30 * 60);
                }
            }
        }
        Scenario::SorterOverload => {
            // redirect 60% of bags in the window to loading area 7 (flight % 3 == 0)
            for i in 0..bags.len() {
                let a = bags.arrival_s[i];
                if a >= W0 && a < W1 && h01(seed, i, 4) < 0.6 {
                    bags.flight[i] -= bags.flight[i] % 3;
                }
            }
        }
    }
    Setup { bags, nodes: nodes.to_vec(), edges: edges.to_vec(), outages }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::slice_bags;
    use crate::engine2::{run_with, Policy, Strategy};
    use crate::generator::{generate, GenConfig};
    use crate::network::airport_network;

    fn base() -> BagSoA {
        let (_, all) = generate(&GenConfig { seed: 5, target_bags: 20_000 });
        slice_bags(&all, W0, 3000)
    }

    #[test]
    fn every_scenario_conserves_bags() {
        let b = base();
        let (nodes, edges) = airport_network(1);
        for sc in ALL {
            let s = build(sc, &b, &nodes, &edges, 1);
            for st in [Strategy::Dijkstra, Strategy::Congestion] {
                let r = run_with(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, 1, &s.outages);
                assert_eq!(r.unfinished, 0, "{:?}/{:?}", sc, st);
                assert_eq!(r.loaded + r.delayed, s.bags.len() as u64, "{:?}", sc);
            }
        }
    }

    #[test]
    fn surge_adds_bags() {
        let b = base();
        let (nodes, edges) = airport_network(1);
        assert!(build(Scenario::PeakSurge, &b, &nodes, &edges, 1).bags.len() > b.len());
    }

    #[test]
    fn screening_outage_raises_sojourn() {
        let b = base();
        let (nodes, edges) = airport_network(1);
        let n = build(Scenario::Normal, &b, &nodes, &edges, 1);
        let d = build(Scenario::ScreeningDelay, &b, &nodes, &edges, 1);
        let rn = run_with(&n.bags, &n.nodes, &n.edges, Strategy::Congestion, Policy::Fcfs, 1, &n.outages);
        let rd = run_with(&d.bags, &d.nodes, &d.edges, Strategy::Congestion, Policy::Fcfs, 1, &d.outages);
        assert!(rd.mean_sojourn_s > rn.mean_sojourn_s, "{} vs {}", rd.mean_sojourn_s, rn.mean_sojourn_s);
    }

    #[test]
    fn edge_outage_diverts_dijkstra_traffic() {
        let b = base();
        let (nodes, edges) = airport_network(1);
        let n = build(Scenario::Normal, &b, &nodes, &edges, 1);
        let c = build(Scenario::ConveyorFailure, &b, &nodes, &edges, 1);
        let rn = run_with(&n.bags, &n.nodes, &n.edges, Strategy::Dijkstra, Policy::Fcfs, 1, &n.outages);
        let rc = run_with(&c.bags, &c.nodes, &c.edges, Strategy::Dijkstra, Policy::Fcfs, 1, &c.outages);
        assert!(rc.arrivals[4] < rn.arrivals[4], "sorter 4: {} vs {}", rc.arrivals[4], rn.arrivals[4]);
    }
}
