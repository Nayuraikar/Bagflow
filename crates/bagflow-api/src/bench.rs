//! Benchmark jobs: the real kernels from `bagflow-kernels`, timed on this machine.

use crate::error::{ApiError, ApiResult};
use crate::sim::{check_range, SEED};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_kernels::runner::{measure, Backend, Input, Sample};
use bagflow_kernels::{omp_threads, scalar};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const BAG_COUNT_RANGE: (u64, u64) = (1_000, 10_000_000);
pub const REPETITIONS_RANGE: (u32, u32) = (1, 50);
pub const WARMUP_RANGE: (u32, u32) = (0, 10);
pub const THREADS_RANGE: (usize, usize) = (1, 64);
const MAX_THREAD_COUNTS: usize = 8;
/// Bytes of bag columns the kernel reads and writes per bag: two u32 inputs, one u8 input, one u8 output.
const BYTES_PER_BAG: u64 = 10;

/// A backend by id, if it can run on this machine. May probe a GPU.
pub fn available_backend(name: &str) -> ApiResult<Backend> {
    let b = Backend::parse(name).ok_or_else(|| ApiError::invalid(format!("unknown backend '{name}'")))?;
    match b.availability() {
        Ok(_) => Ok(b),
        Err(reason) => Err(ApiError::new(axum::http::StatusCode::BAD_REQUEST, "backend_unavailable", format!("{name}: {reason}"))),
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct BenchConfig {
    pub bag_count: u64,
    pub backends: Vec<String>,
    /// Thread counts for the Rayon backends. Empty means all logical cores.
    pub threads: Vec<usize>,
    pub repetitions: u32,
    pub warmup: u32,
}

impl Default for BenchConfig {
    fn default() -> Self {
        BenchConfig { bag_count: 1_000_000, backends: Vec::new(), threads: Vec::new(), repetitions: 10, warmup: 1 }
    }
}

pub fn logical_cores() -> usize {
    std::thread::available_parallelism().map(|x| x.get()).unwrap_or(1)
}

impl BenchConfig {
    /// Check the request and fill in the default thread list.
    pub fn validate(mut self) -> ApiResult<BenchConfig> {
        check_range("bag_count", self.bag_count, BAG_COUNT_RANGE)?;
        check_range("repetitions", self.repetitions, REPETITIONS_RANGE)?;
        check_range("warmup", self.warmup, WARMUP_RANGE)?;
        if self.backends.is_empty() {
            return Err(ApiError::invalid("backends must name at least one backend"));
        }
        let mut seen = Vec::new();
        for name in &self.backends {
            available_backend(name)?;
            if !seen.contains(name) {
                seen.push(name.clone());
            }
        }
        self.backends = seen;
        if self.threads.is_empty() {
            self.threads = vec![logical_cores()];
        }
        for &t in &self.threads {
            check_range("threads", t, THREADS_RANGE)?;
        }
        self.threads.sort_unstable();
        self.threads.dedup();
        check_range("number of thread counts", self.threads.len(), (1, MAX_THREAD_COUNTS))?;
        Ok(self)
    }

    /// (backend, threads, requested) in run order. Scalar comes first, and every one-thread
    /// baseline needed for speedup or efficiency is added.
    fn plan(&self) -> Vec<(Backend, usize, bool)> {
        let requested: Vec<Backend> = self.backends.iter().filter_map(|s| Backend::parse(s)).collect();
        let mut baselines = vec![Backend::Scalar];
        for b in &requested {
            if let Some(base) = b.efficiency_baseline() {
                if !baselines.contains(&base) {
                    baselines.push(base);
                }
            }
        }
        let mut plan: Vec<(Backend, usize, bool)> = baselines.iter().map(|b| (*b, 1, requested.contains(b))).collect();
        for b in requested.into_iter().filter(|b| !baselines.contains(b)) {
            if b.takes_threads() {
                plan.extend(self.threads.iter().map(|&t| (b, t, true)));
            } else if b == Backend::OpenMp {
                plan.push((b, omp_threads(), true));
            } else {
                plan.push((b, 1, true));
            }
        }
        plan
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Stats {
    pub mean: f64,
    pub median: f64,
    /// Sample standard deviation; `None` with a single repetition.
    pub std: Option<f64>,
    pub min: f64,
    pub max: f64,
}

pub fn stats(values: &[f64]) -> Stats {
    assert!(!values.is_empty());
    let mut v = values.to_vec();
    v.sort_by(f64::total_cmp);
    let n = v.len();
    let mean = v.iter().sum::<f64>() / n as f64;
    let median = if n % 2 == 1 { v[n / 2] } else { (v[n / 2 - 1] + v[n / 2]) / 2.0 };
    let std = (n > 1).then(|| (v.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1) as f64).sqrt());
    Stats { mean, median, std, min: v[0], max: v[n - 1] }
}

fn stats_ms(samples: &[Sample], f: impl Fn(&Sample) -> f64) -> (Stats, Value) {
    let s = stats(&samples.iter().map(|x| f(x) * 1e3).collect::<Vec<_>>());
    (s, json!({ "mean": s.mean, "median": s.median, "std": s.std, "min": s.min, "max": s.max }))
}

/// Run a validated config. `progress` receives (phase, repetitions done, repetitions total).
pub fn execute(cfg: &BenchConfig, progress: &mut dyn FnMut(&'static str, u64, u64)) -> Result<Value, String> {
    let plan = cfg.plan();
    let total = plan.len() as u64 * (cfg.warmup + cfg.repetitions) as u64;
    progress("generating", 0, total);
    let (_, bags) = generate_par(&GenConfig { seed: SEED, target_bags: cfg.bag_count as usize }, logical_cores());
    let n = bags.len();
    let input = Input { arrival: &bags.arrival_s, deadline: &bags.deadline_s, flags: &bags.flags };
    let mut ref_classes = vec![0u8; n];
    let reference = scalar(input.arrival, input.deadline, input.flags, &mut ref_classes);

    let mut done = 0u64;
    // (backend, threads, median total ms)
    let mut medians: Vec<(Backend, usize, f64)> = Vec::new();
    let mut rows = Vec::new();
    for (backend, threads, requested) in plan {
        let mut tick = || {
            done += 1;
            progress("running", done, total);
        };
        let m = measure(
            backend,
            threads,
            input,
            (&reference, &ref_classes),
            cfg.warmup as usize,
            cfg.repetitions as usize,
            &mut tick,
        )?;
        let (time, time_json) = stats_ms(&m.samples, |s| s.total);
        medians.push((backend, threads, time.median));
        let median_of = |b: Backend| medians.iter().find(|x| x.0 == b && x.1 == 1).map(|x| x.2);
        let scalar_ms = medians[0].2;

        let efficiency = backend.efficiency_baseline().and_then(|base| {
            median_of(base).map(|t1| (base, 100.0 * (t1 / time.median) / threads as f64))
        });
        let gpu = m.samples.iter().all(|s| s.gpu.is_some()).then(|| {
            let phase = |s: &Sample| s.gpu.expect("checked above");
            let (kernel, kernel_json) = stats_ms(&m.samples, |s| phase(s).kernel);
            json!({
                "device": backend.availability().ok(),
                "copy_in_ms": stats_ms(&m.samples, |s| phase(s).copy_in).1,
                "kernel_ms": kernel_json,
                "launch_overhead_ms": stats_ms(&m.samples, |s| (phase(s).wall - phase(s).kernel).max(0.0)).1,
                "copy_out_ms": stats_ms(&m.samples, |s| phase(s).copy_out).1,
                "kernel_only_speedup": scalar_ms / kernel.median,
                "note": if backend == Backend::Metal {
                    "shared memory: copy in is a memcpy; copy out includes summing the partial results on the CPU"
                } else {
                    "copies cross PCIe from pageable host memory"
                },
            })
        });
        rows.push(json!({
            "backend": backend.id(),
            "threads": (!backend.is_gpu()).then_some(threads),
            "requested": requested,
            "output_identical_to_scalar": m.identical,
            "time_ms": time_json,
            "samples_ms": m.samples.iter().map(|s| s.total * 1e3).collect::<Vec<_>>(),
            "throughput_bags_per_s": n as f64 / (time.median / 1e3),
            "speedup": scalar_ms / time.median,
            "parallel_efficiency_pct": efficiency.map(|e| e.1),
            "efficiency_baseline": efficiency.map(|e| e.0.id()),
            "gpu": gpu,
            "memory_usage_bytes": Value::Null, // not measured
        }));
    }
    Ok(json!({
        "static": false,
        "workload_size": n,
        "bags_requested": cfg.bag_count,
        "seed": SEED,
        "repetitions": cfg.repetitions,
        "warmup": cfg.warmup,
        "machine": { "os": std::env::consts::OS, "arch": std::env::consts::ARCH, "logical_cores": logical_cores() },
        "debug_build": cfg!(debug_assertions),
        "definitions": {
            "time_ms": "end-to-end time of one repetition; GPU backends include both copies",
            "speedup": "median scalar time / median backend time, same dataset; the scalar loop may be auto-vectorised by the compiler",
            "parallel_efficiency_pct": "100 * (median one-thread time of efficiency_baseline / median backend time) / threads; thread backends only",
            "throughput_bags_per_s": "workload_size / median time",
        },
        "data_footprint_bytes_computed": n as u64 * BYTES_PER_BAG,
        "results": rows,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statistics() {
        let s = stats(&[4.0, 1.0, 3.0, 2.0]);
        assert_eq!((s.mean, s.median, s.min, s.max), (2.5, 2.5, 1.0, 4.0));
        assert!((s.std.unwrap() - (5.0f64 / 3.0).sqrt()).abs() < 1e-12);
        let one = stats(&[7.0]);
        assert_eq!((one.median, one.std), (7.0, None));
    }

    #[test]
    fn plan_adds_baselines_once_and_expands_thread_counts() {
        let cfg = BenchConfig {
            backends: vec!["rayon-ilp".into(), "scalar".into()],
            threads: vec![1, 2],
            ..Default::default()
        };
        assert_eq!(
            cfg.plan(),
            vec![
                (Backend::Scalar, 1, true),
                (Backend::Ilp, 1, false),
                (Backend::RayonIlp, 1, true),
                (Backend::RayonIlp, 2, true),
            ]
        );
    }
}
