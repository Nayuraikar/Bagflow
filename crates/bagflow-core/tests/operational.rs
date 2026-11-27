//! Operational parallel mode must reproduce the pinned results exactly for any worker count.
use bagflow_core::engine2::{run_with, run_with_pre, Policy, Strategy};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::airport_network;
use bagflow_core::operational::{precompute, TaskKind, TASKS_PER_WORKER};
use bagflow_core::scenarios::{build, Setup};
use bagflow_core::soa::BagSoA;
use bagflow_core::types::Scenario;

const SEED: u64 = 42;

fn setup(sc: Scenario, base: &BagSoA, pct: u32) -> Setup {
    let (mut nodes, edges) = airport_network(1);
    for nd in nodes.iter_mut() {
        nd.servers = ((nd.servers as u32 * pct / 100).max(1)) as u16;
    }
    build(sc, base, &nodes, &edges, SEED)
}

#[test]
fn pinned_results_for_workers_1_2_4_8() {
    let base = generate_par(&GenConfig { seed: SEED, target_bags: 250_000 }, 4).1;
    let cases = [
        (Scenario::Normal, Strategy::Dijkstra, 100, 9_245u64, "3.697", 0x61aa19cce7723683u64, true),
        (Scenario::SorterOverload, Strategy::Ecmp, 100, 28_606, "11.438", 0x144494908f029748, true),
        (Scenario::Normal, Strategy::Congestion, 70, 134_427, "53.752", 0x29e8786b1e8e3fae, false),
    ];
    for (sc, st, pct, delayed, rate, checksum, routes) in cases {
        let s = setup(sc, &base, pct);
        let seq = precompute(&s.bags, &s.nodes, &s.edges, st, SEED, &s.outages, 1, None);
        for w in [1, 2, 4, 8] {
            let pool = rayon::ThreadPoolBuilder::new().num_threads(w).build().unwrap();
            let pre = precompute(&s.bags, &s.nodes, &s.edges, st, SEED, &s.outages, w, Some(&pool));
            assert_eq!(pre, seq, "{sc:?}/{st:?} w={w}: precompute differs from sequential");
            assert_eq!(pre.routes.is_some(), routes);
            let kinds = if routes { 3 } else { 2 };
            assert_eq!(pre.tasks.len(), kinds * w * TASKS_PER_WORKER);
            assert!(pre.tasks.iter().all(|t| t.worker < w && t.end_ms >= t.start_ms));
            for k in [TaskKind::Checkin, TaskKind::FlightGrouping] {
                assert_eq!(pre.tasks.iter().filter(|t| t.kind == k).map(|t| t.size).sum::<usize>(), s.bags.len());
            }
            let r = run_with_pre(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, SEED, &s.outages, &pre);
            assert_eq!(r.checksum, checksum, "{sc:?}/{st:?}/{pct}% w={w}: {:016x}", r.checksum);
            assert_eq!(r.delayed, delayed);
            assert_eq!(format!("{:.3}", 100.0 * r.delayed as f64 / r.n as f64), rate);
        }
    }
}

/// Every bag is loaded, delayed or unfinished exactly once, and each bag enters check-in
/// once, in every scenario (including outages) with and without the precompute.
#[test]
fn bags_are_conserved() {
    let base = generate_par(&GenConfig { seed: SEED, target_bags: 30_000 }, 4).1;
    let pool = rayon::ThreadPoolBuilder::new().num_threads(4).build().unwrap();
    for sc in bagflow_core::scenarios::ALL {
        let s = setup(sc, &base, 40);
        for st in Strategy::ALL {
            let pre = precompute(&s.bags, &s.nodes, &s.edges, st, SEED, &s.outages, 4, Some(&pool));
            let a = run_with(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, SEED, &s.outages);
            let b = run_with_pre(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, SEED, &s.outages, &pre);
            for r in [&a, &b] {
                assert_eq!(r.loaded + r.delayed + r.unfinished, s.bags.len() as u64, "{sc:?}/{st:?}");
                assert_eq!(r.arrivals[0], s.bags.len() as u64);
            }
            assert_eq!((a.checksum, a.delayed, &a.arrivals), (b.checksum, b.delayed, &b.arrivals), "{sc:?}/{st:?}");
            if let Some(routes) = &pre.routes {
                // one service per hop: the precomputed hops are exactly the node visits
                assert_eq!(routes.total_hops() as u64, b.arrivals.iter().sum::<u64>(), "{sc:?}/{st:?}");
            }
        }
    }
}
