use bagflow_core::engine2::{run_with, Policy, Strategy};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::airport_network;
use bagflow_core::scenarios::{build, ALL};
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();
    let n: usize = args.get(1).and_then(|a| a.parse().ok()).unwrap_or(250_000);
    let pct: u32 = args.get(2).and_then(|a| a.parse().ok()).unwrap_or(100);
    let threads = std::thread::available_parallelism().map(|x| x.get()).unwrap_or(1);
    let (_, bags) = generate_par(&GenConfig { seed: 42, target_bags: n }, threads);
    let (mut nodes, edges) = airport_network(1);
    for nd in nodes.iter_mut() {
        nd.servers = ((nd.servers as u32 * pct / 100).max(1)) as u16;
    }

    println!("scenario comparison: {} base bags, servers {}%, seed 42, window 17:00-19:00\n", bags.len(), pct);
    println!("{:<16}{:<12}{:<6}{:>9}{:>10}{:>15}{:>9}{:>9}{:>11}", "scenario", "routing", "queue", "bags", "delayed", "tight delayed", "mean s", "p95 s", "max queue");
    for sc in ALL {
        let s = build(sc, &bags, &nodes, &edges, 42);
        for st in Strategy::ALL {
            for po in [Policy::Fcfs, Policy::Edf] {
                let r = run_with(&s.bags, &s.nodes, &s.edges, st, po, 42, &s.outages);
                assert_eq!(r.unfinished, 0);
                println!("{:<16}{:<12}{:<6}{:>9}{:>9.2}%{:>14.2}%{:>9.0}{:>9.0}{:>11}",
                    format!("{:?}", sc), st.name(), po.name(), r.n,
                    100.0 * r.delayed as f64 / r.n as f64,
                    100.0 * r.tight_delayed as f64 / r.tight_total.max(1) as f64,
                    r.mean_sojourn_s, r.p95_sojourn_s, r.max_queue.iter().max().unwrap());
            }
        }
        println!();
    }
}
