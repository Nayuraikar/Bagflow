use bagflow_core::generator::{generate, generate_par, GenConfig};
use bagflow_core::soa::BagSoA;
use bagflow_core::types::*;
use std::env;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::Instant;

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
}
fn arg_u64(args: &[String], name: &str, default: u64) -> u64 {
    arg(args, name).and_then(|v| v.parse().ok()).unwrap_or(default)
}

fn report(flights: &[Flight], soa: &BagSoA, secs: f64) {
    let n = soa.len();
    let transfer = soa.flags.iter().filter(|f| **f & FLAG_TRANSFER != 0).count();
    let special = soa.flags.iter().filter(|f| **f & FLAG_SPECIAL != 0).count();
    let prio = soa.priority.iter().filter(|p| **p == PRIO_PRIORITY).count();
    let tight = soa.priority.iter().filter(|p| **p == PRIO_TIGHT).count();
    let mean_kg = soa.weight_dg.iter().map(|w| *w as f64).sum::<f64>() / n as f64 / 10.0;
    println!("{n} bags, {} flights, generated in {secs:.3}s ({:.1} M bags/s)", flights.len(), n as f64 / secs / 1e6);
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
        println!("  {h:02}:00 {c:>9} {}", "#".repeat(c * 40 / peak.max(1)));
    }
    println!("checksum: {:016x}", soa.checksum());
}

fn save(out: &str, seed: u64, flights: &[Flight], soa: &BagSoA) {
    fs::create_dir_all(out).unwrap();
    soa.write_bin(&Path::new(out).join(format!("bags_seed{seed}.bin"))).unwrap();
    soa.write_csv(&Path::new(out).join(format!("bags_seed{seed}_sample.csv")), 2000).unwrap();
    let mut f = fs::File::create(Path::new(out).join(format!("flights_seed{seed}.csv"))).unwrap();
    writeln!(f, "id,departure_s,seats").unwrap();
    for fl in flights {
        writeln!(f, "{},{},{}", fl.id, fl.departure_s, fl.seats).unwrap();
    }
    println!("wrote files to {out}/");
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.get(1).map(|s| s.as_str()) != Some("gen") {
        eprintln!("usage: bagflow-sim gen [--seed 42] [--bags 250000] [--mode seq|par|bench] [--threads N] [--out results]");
        return;
    }
    let seed = arg_u64(&args, "--seed", 42);
    let bags = arg_u64(&args, "--bags", 250_000) as usize;
    let max_threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let threads = arg_u64(&args, "--threads", max_threads as u64) as usize;
    let mode = arg(&args, "--mode").unwrap_or_else(|| "par".to_string());
    let out = arg(&args, "--out").unwrap_or_else(|| "results".to_string());
    let cfg = GenConfig { seed, target_bags: bags };

    match mode.as_str() {
        "seq" => {
            let t = Instant::now();
            let (f, s) = generate(&cfg);
            let secs = t.elapsed().as_secs_f64();
            report(&f, &s, secs);
            save(&out, seed, &f, &s);
        }
        "par" => {
            println!("rayon threads: {threads}");
            let t = Instant::now();
            let (f, s) = generate_par(&cfg, threads);
            let secs = t.elapsed().as_secs_f64();
            report(&f, &s, secs);
            save(&out, seed, &f, &s);
        }
        "bench" => {
            let mut counts = vec![];
            let mut t = 1;
            while t < max_threads {
                counts.push(t);
                t *= 2;
            }
            counts.push(max_threads);

            println!("benchmark: {bags} bags, seed {seed}, {max_threads} logical cores\n");
            let t0 = Instant::now();
            let (_, s) = generate(&cfg);
            let seq = t0.elapsed().as_secs_f64();
            let reference = s.checksum();
            drop(s);
            println!("{:<10}{:>10}{:>14}{:>10}{:>12}  {}", "backend", "time (s)", "bags/s", "speedup", "efficiency", "output");
            println!("{:<10}{:>10.3}{:>14.0}{:>10}{:>12}  checksum {:016x}", "seq", seq, bags as f64 / seq, "1.00x", "-", reference);
            for t in counts {
                let t0 = Instant::now();
                let (_, s) = generate_par(&cfg, t);
                let secs = t0.elapsed().as_secs_f64();
                let same = if s.checksum() == reference { "identical" } else { "MISMATCH" };
                let speedup = seq / secs;
                println!("{:<10}{:>10.3}{:>14.0}{:>9.2}x{:>11.0}%  {}",
                    format!("rayon-{t}"), secs, bags as f64 / secs, speedup, 100.0 * speedup / t as f64, same);
            }
        }
        _ => eprintln!("unknown --mode (use seq, par or bench)"),
    }
}
