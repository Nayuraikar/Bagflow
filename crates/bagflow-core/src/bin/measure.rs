//! Time one engine2 run, with collection off or on. One run per process, so
//! `/usr/bin/time -l` reports the peak memory of that run (dataset included).
//!
//! usage: measure <bags> <scenario> <routing> <capacity_pct> <off|on> [server_multiplier]
use bagflow_core::collect::CollectOptions;
use bagflow_core::engine2::{run_collected, run_with, Policy, Strategy};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::airport_network;
use bagflow_core::scenarios::{build, ALL};
use std::time::Instant;

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    assert!(a.len() >= 5, "usage: measure <bags> <scenario> <routing> <capacity_pct> <off|on> [server_multiplier]");
    let n: usize = a[0].parse().expect("bags");
    let sc = ALL.into_iter().find(|x| format!("{x:?}") == a[1]).expect("scenario");
    let st = Strategy::ALL.into_iter().find(|x| x.name() == a[2]).expect("routing");
    let pct: u32 = a[3].parse().expect("capacity_pct");
    let on = match a[4].as_str() {
        "on" => true,
        "off" => false,
        _ => panic!("collection must be off or on"),
    };
    let k: u16 = a.get(5).map_or(1, |x| x.parse().expect("server_multiplier"));

    let t = Instant::now();
    let threads = std::thread::available_parallelism().map_or(1, |x| x.get());
    let (_, base) = generate_par(&GenConfig { seed: 42, target_bags: n }, threads);
    let gen_s = t.elapsed().as_secs_f64();
    let (mut nodes, edges) = airport_network(k);
    for nd in nodes.iter_mut() {
        nd.servers = ((nd.servers as u32 * pct / 100).max(1)) as u16;
    }

    let t = Instant::now();
    let s = build(sc, &base, &nodes, &edges, 42);
    let (r, extra) = if on {
        let opts = CollectOptions { history: true, sample_interval_ms: Some(60_000) };
        let (r, c) = run_collected(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, 42, &s.outages, opts, None);
        (r, Some(c))
    } else {
        (run_with(&s.bags, &s.nodes, &s.edges, st, Policy::Fcfs, 42, &s.outages), None)
    };
    let run_s = t.elapsed().as_secs_f64();

    let history_mb = extra.as_ref().and_then(|c| c.history.as_ref()).map_or(0.0, |h| h.bytes() as f64 / 1e6);
    let samples = extra.as_ref().and_then(|c| c.series.as_ref()).map_or(0, |x| x.len());
    println!(
        "bags={} scenario={sc:?} routing={} pct={pct} x{k} collect={} gen_s={gen_s:.2} run_s={run_s:.2} delayed_pct={:.3} history_mb={history_mb:.1} samples={samples} checksum={:016x}",
        r.n, st.name(), a[4], 100.0 * r.delayed as f64 / r.n as f64, r.checksum
    );
}
