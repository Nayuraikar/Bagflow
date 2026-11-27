//! Measures operational parallel mode: Normal / dijkstra / fcfs / 100%, stats only (no
//! history collection). Per bag count and worker count, three repetitions, alternating:
//! the plain sequential run, the sequential precompute, the parallel precompute, and the
//! event loop using the precompute. Prints medians as TSV. Usage: operational_bench [bags...]
use bagflow_core::engine2::{run_with, run_with_pre, Policy, Strategy};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::airport_network;
use bagflow_core::operational::precompute;
use bagflow_core::scenarios::build;
use bagflow_core::types::Scenario;
use std::time::Instant;

const SEED: u64 = 42;
const REPS: usize = 3;

fn med(mut v: Vec<f64>) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    v[v.len() / 2]
}

fn main() {
    let sizes: Vec<usize> = std::env::args().skip(1).map(|a| a.parse().expect("bag count")).collect();
    let sizes = if sizes.is_empty() { vec![250_000, 1_000_000] } else { sizes };
    println!("bags\tworkers\tplain_ms\tpre_seq_ms\tpre_par_ms\tdes_ms\ttotal_ms\tpre_speedup\trun_speedup\tpre_fraction\tchecksum");
    for n in sizes {
        let base = generate_par(&GenConfig { seed: SEED, target_bags: n }, 8).1;
        let (nodes, edges) = airport_network(1);
        let s = build(Scenario::Normal, &base, &nodes, &edges, SEED);
        let st = Strategy::Dijkstra;
        // warm-up, untimed
        let reference = run_with(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, SEED, &s.outages).checksum;
        for w in [1usize, 2, 4, 8] {
            let pool = rayon::ThreadPoolBuilder::new().num_threads(w).build().unwrap();
            drop(precompute(&s.bags, &s.nodes, &s.edges, st, SEED, &s.outages, w, Some(&pool)));
            let (mut plain, mut pseq, mut ppar, mut des) = (vec![], vec![], vec![], vec![]);
            for _ in 0..REPS {
                let t = Instant::now();
                let r = run_with(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, SEED, &s.outages);
                plain.push(t.elapsed().as_secs_f64() * 1e3);
                assert_eq!(r.checksum, reference);
                let t = Instant::now();
                let a = precompute(&s.bags, &s.nodes, &s.edges, st, SEED, &s.outages, w, None);
                pseq.push(t.elapsed().as_secs_f64() * 1e3);
                drop(a);
                let t = Instant::now();
                let p = precompute(&s.bags, &s.nodes, &s.edges, st, SEED, &s.outages, w, Some(&pool));
                ppar.push(t.elapsed().as_secs_f64() * 1e3);
                let t = Instant::now();
                let r = run_with_pre(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, SEED, &s.outages, &p);
                des.push(t.elapsed().as_secs_f64() * 1e3);
                assert_eq!(r.checksum, reference);
            }
            let (plain, pseq, ppar, des) = (med(plain), med(pseq), med(ppar), med(des));
            let total = ppar + des;
            println!(
                "{}\t{w}\t{plain:.1}\t{pseq:.1}\t{ppar:.1}\t{des:.1}\t{total:.1}\t{:.3}\t{:.3}\t{:.4}\t{reference:016x}",
                s.bags.len(), pseq / ppar, plain / total, pseq / (pseq + des)
            );
        }
    }
}
