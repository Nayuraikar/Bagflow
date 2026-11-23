use bagflow_core::engine2::{run, Policy, RunStats, Strategy};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::airport_network;
use std::env;
use std::time::Instant;

fn detail(label: &str, r: &RunStats, kinds: &[String]) {
    println!("\nnode detail: {label}");
    println!("{:<14}{:>10}{:>12}{:>11}{:>7}", "node", "arrivals", "avg wait s", "max queue", "util");
    for i in 0..kinds.len() {
        println!("{:<14}{:>10}{:>12.1}{:>11}{:>6.0}%", kinds[i], r.arrivals[i], r.avg_wait_s[i], r.max_queue[i], r.util[i] * 100.0);
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let n: usize = args.get(1).and_then(|a| a.parse().ok()).unwrap_or(250_000);
    let threads = std::thread::available_parallelism().map(|x| x.get()).unwrap_or(1);
    let (_, bags) = generate_par(&GenConfig { seed: 42, target_bags: n }, threads);
    let k = (bags.len() as f64 / 250_000.0).ceil().max(1.0) as u16;
    let (nodes, edges) = airport_network(k);
    let kinds: Vec<String> = nodes.iter().map(|x| format!("{:?} #{}", x.kind, x.id)).collect();

    println!("strategy comparison: {} bags, seed 42, servers x{k}\n", bags.len());
    println!("{:<12}{:<10}{:>9}{:>15}{:>10}{:>10}{:>11}{:>8}", "routing", "queue", "delayed", "tight delayed", "mean s", "p95 s", "max queue", "sim s");
    let mut keep: Vec<(String, RunStats)> = vec![];
    for s in Strategy::ALL {
        for p in Policy::ALL {
            let t = Instant::now();
            let r = run(&bags, &nodes, &edges, s, p, 42);
            let secs = t.elapsed().as_secs_f64();
            assert_eq!(r.unfinished, 0);
            println!("{:<12}{:<10}{:>8.2}%{:>14.2}%{:>10.0}{:>10.0}{:>11}{:>8.2}",
                s.name(), p.name(),
                100.0 * r.delayed as f64 / r.n as f64,
                100.0 * r.tight_delayed as f64 / r.tight_total.max(1) as f64,
                r.mean_sojourn_s, r.p95_sojourn_s,
                r.max_queue.iter().max().unwrap(), secs);
            if p == Policy::Fcfs && (s == Strategy::Dijkstra || s == Strategy::Congestion) {
                keep.push((format!("{} + fcfs", s.name()), r));
            }
        }
    }
    for (label, r) in &keep {
        detail(label, r, &kinds);
    }
}
