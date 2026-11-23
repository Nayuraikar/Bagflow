use bagflow_core::engine::{log_checksum, simulate, slice_bags, write_log_bin};
use bagflow_core::generator::{generate, GenConfig};
use bagflow_core::network::slice_network;
use bagflow_core::state::BagState;
use std::path::Path;
use std::{env, fs};

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let seed: u64 = arg(&args, "--seed").and_then(|v| v.parse().ok()).unwrap_or(42);
    let n: usize = arg(&args, "--bags").and_then(|v| v.parse().ok()).unwrap_or(1000);
    let start_h: u32 = arg(&args, "--start-hour").and_then(|v| v.parse().ok()).unwrap_or(17);
    let out = arg(&args, "--out").unwrap_or_else(|| "web/public".to_string());
    fs::create_dir_all(&out).unwrap();

    let (_, all) = generate(&GenConfig { seed, target_bags: 250_000 });
    let bags = slice_bags(&all, start_h * 3600, n);
    let (nodes, edges) = slice_network();
    let r = simulate(&bags, &nodes, &edges, seed);

    let first_ms = bags.arrival_s[0] as u64 * 1000;
    let span_ms = (r.end_ms - first_ms) as f64;
    let loaded = r.final_state.iter().filter(|s| **s == BagState::Loaded).count();
    let delayed = r.final_state.iter().filter(|s| **s == BagState::Delayed).count();

    println!("{} bags from {:02}:00, seed {seed}, {} log events, simulated span {:.0} s", bags.len(), start_h, r.log.len(), span_ms / 1000.0);
    println!("loaded {loaded}, delayed {delayed}, log checksum {:016x}\n", log_checksum(&r.log));
    println!("{:<4}{:<16}{:>8}{:>10}{:>12}{:>10}{:>8}", "id", "node", "servers", "arrivals", "avg wait s", "max queue", "util");

    let mut rows = vec![];
    for (i, nd) in nodes.iter().enumerate() {
        let st = &r.stats[i];
        let avg_wait = st.total_wait_ms as f64 / st.arrivals.max(1) as f64 / 1000.0;
        let util = st.busy_ms as f64 / (nd.servers as f64 * span_ms);
        println!("{:<4}{:<16}{:>8}{:>10}{:>12.1}{:>10}{:>7.0}%", i, format!("{:?}", nd.kind), nd.servers, st.arrivals, avg_wait, st.max_queue, util * 100.0);
        rows.push(serde_json::json!({
            "id": i, "kind": format!("{:?}", nd.kind), "servers": nd.servers,
            "arrivals": st.arrivals, "avg_wait_s": avg_wait,
            "max_queue": st.max_queue, "utilisation": util
        }));
    }

    let o = Path::new(&out);
    fs::write(o.join("network.json"), serde_json::to_string(&serde_json::json!({ "nodes": nodes, "edges": edges })).unwrap()).unwrap();
    write_log_bin(&r.log, &o.join("events.bin")).unwrap();
    fs::write(
        o.join("summary.json"),
        serde_json::to_string(&serde_json::json!({
            "bags": bags.len(), "loaded": loaded, "delayed": delayed,
            "checksum": format!("{:016x}", log_checksum(&r.log)), "nodes": rows
        })).unwrap(),
    ).unwrap();
    println!("\nwrote network.json, events.bin, summary.json to {out}/");
}
