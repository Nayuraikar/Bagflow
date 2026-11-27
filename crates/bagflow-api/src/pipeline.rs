//! The four measured phases of a simulation run. Each phase that has a parallel
//! implementation is also run with its sequential baseline on the same input, and the
//! outputs are compared.

use crate::bench::{logical_cores, stats};
use crate::sim::SEED;
use bagflow_core::aggregate::{self, Aggregate};
use bagflow_core::collect::Collected;
use bagflow_core::engine2::{Outage, RunStats, Strategy};
use bagflow_core::operational::{precompute, Precomputed};
use bagflow_core::types::{Edge, Node};
use bagflow_core::generator::{generate, generate_on, GenConfig, CHUNK_FLIGHTS};
use bagflow_core::soa::BagSoA;
use bagflow_core::types::Flight;
use bagflow_kernels::runner::{measure_alternating, Backend, Input, Measurement};
use bagflow_kernels::{omp_threads, scalar, Out};
use serde_json::{json, Value};
use std::time::Instant;

/// Timed repetitions per phase; the median is reported. One untimed warm-up precedes them.
const GENERATE_REPS: usize = 3;
const CLASSIFY_REPS: usize = 9;
const AGGREGATE_REPS: usize = 5;
const PRECOMPUTE_REPS: usize = 3;

/// The fastest CPU kernel family this machine has, spread over Rayon.
pub fn default_classify_backend() -> String {
    [Backend::RayonNeon, Backend::RayonAvx2]
        .into_iter()
        .find(|b| b.availability().is_ok())
        .unwrap_or(Backend::RayonIlp)
        .id()
        .into()
}

pub fn build_pool(threads: usize) -> Result<rayon::ThreadPool, String> {
    rayon::ThreadPoolBuilder::new().num_threads(threads).build().map_err(|e| e.to_string())
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1e3
}

pub fn median(v: &[f64]) -> f64 {
    stats(v).median
}

/// One phase that has both a baseline and a parallel implementation.
pub struct Compared {
    pub baseline_ms: Vec<f64>,
    pub parallel_ms: Vec<f64>,
    pub identical: bool,
}

impl Compared {
    fn json(&self, id: &str, name: &str, baseline: &str, backend: &str, threads: Option<usize>) -> Value {
        let (base, par) = (median(&self.baseline_ms), median(&self.parallel_ms));
        json!({
            "id": id,
            "name": name,
            "has_parallel_implementation": true,
            "backend": backend,
            "threads": threads,
            "time_ms": par,
            "samples_ms": self.parallel_ms,
            "baseline": { "backend": baseline, "threads": 1, "time_ms": base, "samples_ms": self.baseline_ms },
            "speedup": base / par,
            "identical_to_baseline": self.identical,
        })
    }
}

/// Generate the dataset with the sequential and the Rayon generator, alternating so
/// both see the same conditions. Returns the last parallel output.
pub fn generate_phase(bags: usize, threads: usize) -> Result<(Vec<Flight>, BagSoA, u64, Compared), String> {
    let cfg = GenConfig { seed: SEED, target_bags: bags };
    let pool = build_pool(threads)?;
    let mut times = Compared { baseline_ms: Vec::new(), parallel_ms: Vec::new(), identical: true };
    let mut checksum = None;
    let mut last = None;
    for rep in 0..=GENERATE_REPS {
        // free the previous output first, so each repetition allocates under the same conditions
        drop(last.take());
        let t = Instant::now();
        let (_, base) = generate(&cfg);
        let base_ms = ms(t);
        let expected = *checksum.get_or_insert_with(|| base.checksum());
        times.identical &= base.checksum() == expected;
        drop(base);
        let t = Instant::now();
        let (flights, par, _) = generate_on(&pool, &cfg, CHUNK_FLIGHTS, Instant::now());
        let par_ms = ms(t);
        times.identical &= par.checksum() == expected;
        if rep > 0 {
            times.baseline_ms.push(base_ms);
            times.parallel_ms.push(par_ms);
        }
        last = Some((flights, par));
    }
    if !times.identical {
        return Err("the parallel generator did not reproduce the sequential dataset".into());
    }
    let (flights, data) = last.expect("at least one repetition ran");
    Ok((flights, data, checksum.expect("set in the first repetition"), times))
}

/// Operational parallel mode: the per-bag precompute, sequential and on `workers` Rayon
/// threads, alternating. Both use the same task plan; the outputs must be identical.
/// Returns the last parallel output, whose task telemetry is the one reported.
#[allow(clippy::too_many_arguments)]
pub fn precompute_phase(
    bags: &BagSoA,
    nodes: &[Node],
    edges: &[Edge],
    strat: Strategy,
    outages: &[Outage],
    workers: usize,
) -> Result<(Precomputed, Compared), String> {
    let pool = build_pool(workers)?;
    let mut times = Compared { baseline_ms: Vec::new(), parallel_ms: Vec::new(), identical: true };
    let mut last: Option<Precomputed> = None;
    for rep in 0..=PRECOMPUTE_REPS {
        drop(last.take());
        let t = Instant::now();
        let base = precompute(bags, nodes, edges, strat, SEED, outages, workers, None);
        let base_ms = ms(t);
        let t = Instant::now();
        let par = precompute(bags, nodes, edges, strat, SEED, outages, workers, Some(&pool));
        let par_ms = ms(t);
        times.identical &= par == base;
        drop(base);
        if rep > 0 {
            times.baseline_ms.push(base_ms);
            times.parallel_ms.push(par_ms);
        }
        last = Some(par);
    }
    if !times.identical {
        return Err("the parallel precompute did not reproduce the sequential one".into());
    }
    Ok((last.expect("at least one repetition ran"), times))
}

pub struct Classified {
    pub times: Compared,
    pub backend: Backend,
    pub threads: Option<usize>,
    pub result: Out,
}

fn totals_ms(m: &Measurement) -> Vec<f64> {
    m.samples.iter().map(|s| s.total * 1e3).collect()
}

/// The batch deadline-risk kernel over the simulated bag table. It is an analysis of
/// the table; the simulation does not read its output.
pub fn classify_phase(bags: &BagSoA, backend: Backend, threads: usize) -> Result<Classified, String> {
    let input = Input { arrival: &bags.arrival_s, deadline: &bags.deadline_s, flags: &bags.flags };
    let mut classes = vec![0u8; bags.len()];
    let reference = scalar(input.arrival, input.deadline, input.flags, &mut classes);
    let (base, chosen) =
        measure_alternating((Backend::Scalar, 1), (backend, threads), input, (&reference, &classes), 1, CLASSIFY_REPS)?;
    let identical = base.identical && chosen.identical;
    if !identical {
        return Err(format!("backend {} did not match the scalar kernel", backend.id()));
    }
    Ok(Classified {
        times: Compared { baseline_ms: totals_ms(&base), parallel_ms: totals_ms(&chosen), identical },
        backend,
        threads: if backend.is_gpu() {
            None
        } else if backend.takes_threads() {
            Some(threads)
        } else if backend == Backend::OpenMp {
            Some(omp_threads()) // this kernel uses OpenMP's own thread count
        } else {
            Some(1)
        },
        result: reference,
    })
}

/// Whether an aggregate of the bag histories reproduces what the engine counted itself.
pub fn matches_engine(a: &Aggregate, stats: &RunStats, collected: &Collected) -> bool {
    (a.loaded_on_time, a.delayed, a.unfinished) == (stats.loaded, stats.delayed, stats.unfinished)
        && a.nodes.iter().enumerate().all(|(n, x)| {
            x.visits == stats.arrivals[n]
                && x.wait_hist == collected.wait_hist[n]
                && x.wait_ms as f64 / x.visits.max(1) as f64 / 1000.0 == stats.avg_wait_s[n]
        })
}

/// Chunk size for a parallel aggregation: about eight chunks per thread.
pub fn aggregate_chunk(bags: usize, threads: usize) -> usize {
    bags.div_ceil(threads * 8).max(4096)
}

pub fn aggregate_phase(input: aggregate::Input, threads: usize) -> Result<(Aggregate, Compared), String> {
    let pool = build_pool(threads)?;
    let chunk = aggregate_chunk(input.history.bags(), threads);
    let mut times = Compared { baseline_ms: Vec::new(), parallel_ms: Vec::new(), identical: true };
    let mut result = None;
    for rep in 0..=AGGREGATE_REPS {
        let t = Instant::now();
        let base = aggregate::sequential(input);
        let base_ms = ms(t);
        let t = Instant::now();
        let par = aggregate::parallel(&pool, input, chunk, Instant::now()).result;
        let par_ms = ms(t);
        times.identical &= par == base;
        if rep > 0 {
            times.baseline_ms.push(base_ms);
            times.parallel_ms.push(par_ms);
        }
        result = Some(base);
    }
    if !times.identical {
        return Err("the parallel aggregation did not match the sequential one".into());
    }
    Ok((result.expect("at least one repetition ran"), times))
}

pub struct Report {
    pub threads: usize,
    pub bags_generated: usize,
    pub bags_simulated: usize,
    pub generate: Compared,
    pub classify: Classified,
    pub simulate_ms: f64,
    /// Operational parallel mode only: the precompute phase and its worker count.
    pub precompute: Option<(Compared, usize)>,
    pub aggregate: Compared,
    pub aggregate_matches_engine: bool,
    pub scenario_setup_ms: f64,
    pub summarise_ms: f64,
}

impl Report {
    pub fn json(&self) -> Value {
        let mut generate = self.generate.json("generate", "Dataset generation", "sequential", "rayon", Some(self.threads));
        generate["bags"] = json!(self.bags_generated);

        let c = &self.classify;
        let mut classify = c.times.json("classify", "Deadline-risk classification", "scalar", c.backend.id(), c.threads);
        classify["bags"] = json!(self.bags_simulated);
        classify["output"] = json!({
            "on_track": c.result.counts[0],
            "at_risk": c.result.counts[1],
            "critical": c.result.counts[2],
            "note": "a fixed-formula estimate over the bag table; the simulation does not use it",
        });

        let simulate = json!({
            "id": "simulate",
            "name": "Discrete-event simulation",
            "has_parallel_implementation": false,
            "backend": if self.precompute.is_some() { "engine2 (sequential, precomputed per-bag values)" } else { "engine2 (sequential)" },
            "threads": 1,
            "time_ms": self.simulate_ms,
            "samples_ms": [self.simulate_ms],
            "baseline": Value::Null,
            "speedup": Value::Null,
            "identical_to_baseline": Value::Null,
            "bags": self.bags_simulated,
            "why_sequential": "events must be processed in time order: each one can change the queues that later events see",
        });

        let aggregate_name = "Result aggregation";
        let mut aggregation = self.aggregate.json("aggregate", aggregate_name, "sequential", "rayon", Some(self.threads));
        aggregation["bags"] = json!(self.bags_simulated);
        aggregation["verified_against_engine"] = json!(self.aggregate_matches_engine);

        let precompute = self.precompute.as_ref().map(|(c, w)| {
            let mut v = c.json("precompute", "Operational precompute", "sequential", "rayon", Some(*w));
            v["bags"] = json!(self.bags_simulated);
            v
        });

        let other = self.scenario_setup_ms + self.summarise_ms;
        let mut eligible = vec![&self.generate, &self.classify.times, &self.aggregate];
        if let Some((c, _)) = &self.precompute {
            eligible.push(c);
        }
        let eligible_base: f64 = eligible.iter().map(|c| median(&c.baseline_ms)).sum();
        let eligible_par: f64 = eligible.iter().map(|c| median(&c.parallel_ms)).sum();
        let baseline_total = eligible_base + self.simulate_ms + other;
        let parallel_total = eligible_par + self.simulate_ms + other;
        let fraction = eligible_base / baseline_total;
        json!({
            "workload": { "bags_generated": self.bags_generated, "bags_simulated": self.bags_simulated },
            "threads": self.threads,
            "machine": { "os": std::env::consts::OS, "arch": std::env::consts::ARCH, "logical_cores": logical_cores() },
            "debug_build": cfg!(debug_assertions),
            "phases": match precompute {
                Some(p) => json!([generate, classify, p, simulate, aggregation]),
                None => json!([generate, classify, simulate, aggregation]),
            },
            "other_sequential": {
                "time_ms": other,
                "scenario_setup_ms": self.scenario_setup_ms,
                "summarise_ms": self.summarise_ms,
            },
            "full": {
                "baseline_ms": baseline_total,
                "parallel_ms": parallel_total,
                "speedup": baseline_total / parallel_total,
            },
            "amdahl": {
                "parallelisable_fraction": fraction,
                "sequential_fraction": 1.0 - fraction,
                "max_speedup": 1.0 / (1.0 - fraction),
                "eligible_phases_speedup": eligible_base / eligible_par,
            },
            "definitions": {
                "time_ms": "wall time; median of the repetitions after one warm-up, alternating between baseline and parallel. The simulation, scenario setup and summarising run once",
                "repetitions": { "generate": GENERATE_REPS, "classify": CLASSIFY_REPS, "aggregate": AGGREGATE_REPS, "precompute": PRECOMPUTE_REPS, "simulate": 1 },
                "speedup": "median baseline time / median parallel time on the same input in this run",
                "full": "sum of the four phases and the other sequential work, once with every baseline and once with every parallel phase. It is a composed total, not one end-to-end timing, and leaves out repetitions, output checks and saving",
                "simulate": "includes recording bag histories and node time-series",
                "parallelisable_fraction": "share of the baseline total spent in phases that have a parallel implementation. Generation keeps some serial steps, so this is an upper bound",
                "max_speedup": "Amdahl's law limit 1 / (1 - parallelisable_fraction), if those phases took no time at all",
                "pools": "thread pools and GPU buffers are created before timing starts",
            },
        })
    }
}
