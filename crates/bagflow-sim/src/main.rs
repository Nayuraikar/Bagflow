use bagflow_core::generator::{generate, GenConfig};
use bagflow_core::types::*;
use std::env;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::Instant;

fn arg_u64(args: &[String], name: &str, default: u64) -> u64 {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.get(1).map(|s| s.as_str()) != Some("gen") {
        eprintln!("usage: bagflow-sim gen [--seed 42] [--bags 250000] [--out results]");
        return;
    }
    let seed = arg_u64(&args, "--seed", 42);
    let bags = arg_u64(&args, "--bags", 250_000) as usize;
    let out = args
        .iter()
        .position(|a| a == "--out")
        .and_then(|i| args.get(i + 1))
        .cloned()
        .unwrap_or_else(|| "results".to_string());
    fs::create_dir_all(&out).unwrap();

    let t = Instant::now();
    let (flights, soa) = generate(&GenConfig { seed, target_bags: bags });
    let secs = t.elapsed().as_secs_f64();

    let n = soa.len();
    let transfer = soa.flags.iter().filter(|f| **f & FLAG_TRANSFER != 0).count();
    let special = soa.flags.iter().filter(|f| **f & FLAG_SPECIAL != 0).count();
    let prio = soa.priority.iter().filter(|p| **p == PRIO_PRIORITY).count();
    let tight = soa.priority.iter().filter(|p| **p == PRIO_TIGHT).count();
    let mean_kg = soa.weight_dg.iter().map(|w| *w as f64).sum::<f64>() / n as f64 / 10.0;

    println!("seed {seed}: {n} bags, {} flights, generated in {secs:.3}s", flights.len());
    println!("bags per flight: {:.1}", n as f64 / flights.len() as f64);
    println!("transfer {:.1}%  special {:.1}%  priority {:.1}%  tight {:.1}%  mean weight {:.1} kg",
        100.0 * transfer as f64 / n as f64, 100.0 * special as f64 / n as f64,
        100.0 * prio as f64 / n as f64, 100.0 * tight as f64 / n as f64, mean_kg);

    let mut hours = [0usize; 24];
    for a in &soa.arrival_s {
        hours[(*a as usize / 3600).min(23)] += 1;
    }
    let peak = *hours.iter().max().unwrap();
    println!("bag arrivals per hour:");
    for (h, c) in hours.iter().enumerate() {
        println!("  {h:02}:00 {c:>7} {}", "#".repeat(c * 40 / peak.max(1)));
    }
    println!("checksum: {:016x}", soa.checksum());

    soa.write_bin(&Path::new(&out).join(format!("bags_seed{seed}.bin"))).unwrap();
    soa.write_csv(&Path::new(&out).join(format!("bags_seed{seed}_sample.csv")), 2000).unwrap();
    let mut f = fs::File::create(Path::new(&out).join(format!("flights_seed{seed}.csv"))).unwrap();
    writeln!(f, "id,departure_s,seats").unwrap();
    for fl in &flights {
        writeln!(f, "{},{},{}", fl.id, fl.departure_s, fl.seats).unwrap();
    }
    println!("wrote files to {out}/");
}
