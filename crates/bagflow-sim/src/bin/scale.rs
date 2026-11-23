use bagflow_core::engine::{log_checksum, simulate};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::slice_network;
use bagflow_core::state::BagState;
use std::env;
use std::time::Instant;

fn main() {
    let args: Vec<String> = env::args().collect();
    let sizes: Vec<usize> = if args.len() > 1 {
        args[1..].iter().filter_map(|a| a.parse().ok()).collect()
    } else {
        vec![250_000, 1_000_000]
    };
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);

    println!("sequential engine scaling, seed 42\n");
    println!("{:>11}{:>11}{:>12}{:>14}{:>12}{:>9}{:>9}  {}", "bags", "gen (s)", "sim (s)", "bags/s", "events", "loaded", "delayed", "checksum");
    for n in sizes {
        let t = Instant::now();
        let (_, bags) = generate_par(&GenConfig { seed: 42, target_bags: n }, threads);
        let gen = t.elapsed().as_secs_f64();

        let (mut nodes, edges) = slice_network();
        let k = (n as f64 / 250_000.0).ceil().max(1.0) as u16;
        for nd in nodes.iter_mut() { nd.servers *= k; }

        let t = Instant::now();
        let r = simulate(&bags, &nodes, &edges, 42);
        let sim = t.elapsed().as_secs_f64();

        let loaded = r.final_state.iter().filter(|s| **s == BagState::Loaded).count();
        let delayed = r.final_state.iter().filter(|s| **s == BagState::Delayed).count();
        println!("{:>11}{:>11.2}{:>12.2}{:>14.0}{:>12}{:>9}{:>9}  {:016x}",
            bags.len(), gen, sim, bags.len() as f64 / sim, r.log.len(), loaded, delayed, log_checksum(&r.log));
    }
}
