//! Parallel execution telemetry: one workload on one backend, with the record of every
//! task, next to the same workload run sequentially in the same chunks.

use crate::bench::{self, available_backend, logical_cores};
use crate::error::{ApiError, ApiResult};
use crate::pipeline::{build_pool, default_classify_backend, median};
use crate::sim::{check_range, SimData, SEED};
use bagflow_core::aggregate;
use bagflow_core::collect::CollectOptions;
use bagflow_core::engine2::{run_collected, Policy, Strategy};
use bagflow_core::generator::{generate_on, generate_par, generate_traced, GenConfig};
use bagflow_core::network::airport_network;
use bagflow_core::soa::BagSoA;
use bagflow_core::trace::{self, Stage, Task};
use bagflow_kernels::runner::{gpu_session, Backend, GpuPhases, GpuSession, Input};
use bagflow_kernels::{ilp, scalar, simd_kernel, traced, Kernel, Out};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::time::Instant;

pub const WORKLOADS: [&str; 3] = ["generate", "classify", "aggregate"];
pub const BAG_COUNT_RANGE: (u64, u64) = (1_000, 10_000_000);
/// Aggregation reads the bag histories of a simulation run, which limits its size.
pub const AGGREGATE_BAG_COUNT_RANGE: (u64, u64) = (1_000, 1_000_000);
pub const REPETITIONS_RANGE: (u32, u32) = (1, 10);
pub const MAX_TASKS: u64 = 4_096;
/// Default chunk sizes aim for about this many tasks.
const DEFAULT_TASKS: u64 = 64;
const MIN_BAG_CHUNK: u64 = 1_024;
/// Only used to estimate a task count before the flights exist.
const BAGS_PER_FLIGHT_ESTIMATE: u64 = 150;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ParallelConfig {
    pub workload: String,
    /// `None` picks the parallel default for the workload.
    pub backend: Option<String>,
    /// `None` means all logical cores. Single-threaded backends always report 1.
    pub threads: Option<usize>,
    pub bag_count: u64,
    /// Flights per task for `generate`, bags per task otherwise.
    pub chunk_size: Option<u64>,
    pub repetitions: u32,
    /// `aggregate` only: reuse a retained simulation run instead of preparing one.
    pub simulation_id: Option<String>,
}

impl Default for ParallelConfig {
    fn default() -> Self {
        ParallelConfig {
            workload: "classify".into(),
            backend: None,
            threads: None,
            bag_count: 250_000,
            chunk_size: None,
            repetitions: 3,
            simulation_id: None,
        }
    }
}

fn kernel_backends() -> impl Iterator<Item = Backend> {
    Backend::ALL.into_iter().filter(|&b| b != Backend::Mpi)
}

/// The backends of a workload that can run on this machine. May probe a GPU.
pub fn backends(workload: &str) -> Vec<&'static str> {
    match workload {
        "classify" => kernel_backends().filter(|b| b.availability().is_ok()).map(|b| b.id()).collect(),
        _ => vec!["sequential", "rayon"],
    }
}

fn takes_threads(workload: &str, backend: &str) -> bool {
    match workload {
        "classify" => Backend::parse(backend).is_some_and(|b| b.takes_threads() || b == Backend::OpenMp),
        _ => backend == "rayon",
    }
}

pub fn chunk_unit(workload: &str) -> &'static str {
    if workload == "generate" {
        "flights"
    } else {
        "bags"
    }
}

impl ParallelConfig {
    /// Check the request and fill in the defaults. `aggregate_bags` is the size of the
    /// run named by `simulation_id`.
    pub fn validate(mut self, aggregate_bags: Option<u64>) -> ApiResult<ParallelConfig> {
        if !WORKLOADS.contains(&self.workload.as_str()) {
            return Err(ApiError::invalid(format!("unknown workload '{}'", self.workload)));
        }
        let aggregate = self.workload == "aggregate";
        if self.simulation_id.is_some() && !aggregate {
            return Err(ApiError::invalid("simulation_id only applies to the aggregate workload"));
        }
        let backend = self.backend.take().unwrap_or_else(|| match self.workload.as_str() {
            "classify" => default_classify_backend(),
            _ => "rayon".into(),
        });
        if self.workload == "classify" {
            if available_backend(&backend)? == Backend::Mpi {
                return Err(ApiError::invalid("MPI has no live runner"));
            }
        } else if !backends(&self.workload).contains(&backend.as_str()) {
            return Err(ApiError::invalid(format!("the {} workload runs on sequential or rayon, not '{backend}'", self.workload)));
        }
        let requested = self.threads.unwrap_or_else(logical_cores);
        check_range("threads", requested, bench::THREADS_RANGE)?;
        self.threads = Some(if takes_threads(&self.workload, &backend) { requested } else { 1 });
        self.backend = Some(backend);
        check_range("repetitions", self.repetitions, REPETITIONS_RANGE)?;
        match aggregate_bags {
            Some(n) => self.bag_count = n,
            None => check_range("bag_count", self.bag_count, if aggregate { AGGREGATE_BAG_COUNT_RANGE } else { BAG_COUNT_RANGE })?,
        }
        let units = if self.workload == "generate" { self.bag_count.div_ceil(BAGS_PER_FLIGHT_ESTIMATE) } else { self.bag_count };
        let floor = if self.workload == "generate" { 1 } else { MIN_BAG_CHUNK };
        let chunk = self.chunk_size.unwrap_or_else(|| units.div_ceil(DEFAULT_TASKS).max(floor));
        if chunk == 0 || units.div_ceil(chunk) > MAX_TASKS {
            return Err(ApiError::invalid(format!(
                "chunk_size must be at least {} for this workload (at most {MAX_TASKS} tasks)",
                units.div_ceil(MAX_TASKS)
            )));
        }
        self.chunk_size = Some(chunk);
        Ok(self)
    }
}

/// One timed execution of a workload.
struct Run {
    wall_ns: u64,
    tasks: Vec<Task>,
    stages: Vec<Stage>,
    checksum: u64,
    gpu: Option<GpuPhases>,
}

/// One untimed warm-up of each, then `reps` timed runs of each, alternating so that
/// both are measured under the same conditions. Returns (sequential, selected).
fn alternate(
    reps: u32,
    tick: &mut dyn FnMut(),
    mut sequential: impl FnMut() -> Run,
    mut selected: impl FnMut() -> Run,
) -> (Vec<Run>, Vec<Run>) {
    let (mut a, mut b) = (Vec::new(), Vec::new());
    for i in 0..=reps {
        let x = sequential();
        tick();
        let y = selected();
        tick();
        if i > 0 {
            a.push(x);
            b.push(y);
        }
    }
    (a, b)
}

/// The run whose wall time is the median (the lower middle one for an even count).
fn median_run(runs: &[Run]) -> &Run {
    let mut order: Vec<&Run> = runs.iter().collect();
    order.sort_by_key(|r| r.wall_ns);
    order[(order.len() - 1) / 2]
}

fn class_checksum(out: &Out, classes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    let totals = out.counts.iter().map(|&c| c as i64).chain([out.slack_sum]);
    for b in classes.iter().copied().chain(totals.flat_map(i64::to_le_bytes)) {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

struct Executed {
    bags: usize,
    sequential: Vec<Run>,
    selected: Vec<Run>,
    output: Value,
}

fn generate_workload(cfg: &ParallelConfig, backend: &str, threads: usize, tick: &mut dyn FnMut()) -> Result<Executed, String> {
    let gen = GenConfig { seed: SEED, target_bags: cfg.bag_count as usize };
    let chunk = cfg.chunk_size.expect("validated") as usize;
    let pool = if backend == "rayon" { Some(build_pool(threads)?) } else { None };
    let (mut bags, mut flights, mut computed) = (0, 0, 0);
    // the timed part covers generation only, not the checksum or freeing the dataset
    let run = |pool: Option<&rayon::ThreadPool>| {
        let t0 = Instant::now();
        let (f, data, t) = match pool {
            Some(pool) => generate_on(pool, &gen, chunk, t0),
            None => generate_traced(&gen, chunk, t0),
        };
        let wall_ns = trace::since(t0);
        let sizes = (data.len(), f.len(), t.flights_computed);
        (Run { wall_ns, tasks: t.tasks, stages: t.stages, checksum: data.checksum(), gpu: None }, sizes)
    };
    let (sequential, selected) = alternate(
        cfg.repetitions,
        tick,
        || run(None).0,
        || {
            let (r, sizes) = run(pool.as_ref());
            (bags, flights, computed) = sizes;
            r
        },
    );
    let output = json!({ "bags": bags, "flights": flights, "flights_computed": computed });
    Ok(Executed { bags, sequential, selected, output })
}

fn simd_info(backend: Backend) -> Option<Value> {
    let lanes: u32 = match backend {
        Backend::Neon | Backend::RayonNeon => 4,
        Backend::Avx2 | Backend::RayonAvx2 => 8,
        _ => return None,
    };
    Some(json!({
        "register_bits": lanes * 32,
        "lanes": lanes,
        "lane_type": "32-bit integer",
        "bags_per_iteration": 8,
        "note": "lanes are values processed by one instruction on one thread; they are not separate workers",
    }))
}

/// One traced CPU kernel run writing into `out`.
fn kernel_run(out: &mut [u8], f: &mut dyn FnMut(&mut [u8], Instant) -> traced::Traced) -> (Run, Out) {
    out.fill(0); // outside the timed part, and no leftover answers
    let t0 = Instant::now();
    let t = f(out, t0);
    let wall_ns = trace::since(t0);
    let checksum = class_checksum(&t.result, out);
    let stages = t.merge.into_iter().collect();
    (Run { wall_ns, tasks: t.tasks, stages, checksum, gpu: None }, t.result)
}

type TracedKernel<'a> = Box<dyn FnMut(&mut [u8], Instant) -> traced::Traced + 'a>;

/// A CPU backend ready to be timed (its pool already built).
fn traced_kernel<'a>(bags: &'a BagSoA, backend: Backend, threads: usize, chunk: usize) -> Result<TracedKernel<'a>, String> {
    let (a, d, f) = (&bags.arrival_s, &bags.deadline_s, &bags.flags);
    let simd = || simd_kernel().map(|k| k.1).ok_or_else(|| "no SIMD kernel".to_string());
    Ok(match backend {
        Backend::Scalar | Backend::Ilp | Backend::Neon | Backend::Avx2 => {
            let kernel: Kernel = match backend {
                Backend::Scalar => scalar,
                Backend::Ilp => ilp,
                _ => simd()?,
            };
            Box::new(move |o, t0| traced::single(kernel, a, d, f, o, chunk, t0))
        }
        Backend::OpenMp => Box::new(move |o, t0| traced::openmp(threads, a, d, f, o, chunk, t0)),
        Backend::RayonIlp | Backend::RayonNeon | Backend::RayonAvx2 => {
            let kernel: Kernel = if backend == Backend::RayonIlp { ilp } else { simd()? };
            let pool = build_pool(threads)?;
            Box::new(move |o, t0| traced::rayon(&pool, kernel, a, d, f, o, chunk, t0))
        }
        _ => return Err(format!("{} has no traced CPU kernel", backend.id())),
    })
}

/// A GPU run: phase times only, since the device reports no per-task times.
fn gpu_run(gpu: &mut GpuSession, bags: &BagSoA, out: &mut [u8]) -> Run {
    let input = Input { arrival: &bags.arrival_s, deadline: &bags.deadline_s, flags: &bags.flags };
    out.fill(0);
    let t0 = Instant::now();
    let (result, phases) = gpu(input, out);
    let wall_ns = trace::since(t0);
    let checksum = class_checksum(&result, out);
    Run { wall_ns, tasks: Vec::new(), stages: Vec::new(), checksum, gpu: Some(phases) }
}

fn classify_workload(cfg: &ParallelConfig, bags: &BagSoA, backend: Backend, threads: usize, tick: &mut dyn FnMut()) -> Result<Executed, String> {
    let chunk = cfg.chunk_size.expect("validated") as usize;
    let (mut seq_out, mut out) = (vec![0u8; bags.len()], vec![0u8; bags.len()]);
    let mut totals = Out::default();
    let mut baseline = traced_kernel(bags, Backend::Scalar, 1, chunk)?;
    let mut sequential = || {
        let (run, result) = kernel_run(&mut seq_out, &mut *baseline);
        totals = result;
        run
    };
    let (sequential, selected) = if backend.is_gpu() {
        let mut gpu = gpu_session(backend, bags.len())?;
        alternate(cfg.repetitions, tick, &mut sequential, || gpu_run(&mut gpu, bags, &mut out))
    } else {
        let mut kernel = traced_kernel(bags, backend, threads, chunk)?;
        alternate(cfg.repetitions, tick, &mut sequential, || kernel_run(&mut out, &mut *kernel).0)
    };
    let output = json!({
        "on_track": totals.counts[0],
        "at_risk": totals.counts[1],
        "critical": totals.counts[2],
        "slack_sum_s": totals.slack_sum,
    });
    Ok(Executed { bags: bags.len(), sequential, selected, output })
}

fn aggregate_workload(cfg: &ParallelConfig, input: aggregate::Input, backend: &str, threads: usize, tick: &mut dyn FnMut()) -> Result<Executed, String> {
    let chunk = cfg.chunk_size.expect("validated") as usize;
    let pool = if backend == "rayon" { Some(build_pool(threads)?) } else { None };
    let run_sequential = || {
        let t0 = Instant::now();
        let (result, tasks) = aggregate::sequential_traced(input, chunk, t0);
        let wall_ns = trace::since(t0);
        (Run { wall_ns, tasks, stages: Vec::new(), checksum: result.checksum(), gpu: None }, result)
    };
    let mut totals = None;
    let (sequential, selected) = alternate(
        cfg.repetitions,
        tick,
        || {
            let (run, a) = run_sequential();
            totals = Some((a.loaded_on_time, a.delayed, a.unfinished, a.nodes.iter().map(|n| n.visits).sum::<u64>()));
            run
        },
        || match &pool {
            None => run_sequential().0,
            Some(pool) => {
                let t0 = Instant::now();
                let run = aggregate::parallel(pool, input, chunk, t0);
                let wall_ns = trace::since(t0);
                Run { wall_ns, tasks: run.tasks, stages: vec![run.merge], checksum: run.result.checksum(), gpu: None }
            }
        },
    );
    let (loaded, delayed, unfinished, visits) = totals.expect("the sequential run happened");
    let output = json!({ "loaded_on_time": loaded, "delayed": delayed, "unfinished": unfinished, "node_visits": visits });
    Ok(Executed { bags: input.history.bags(), sequential, selected, output })
}

fn ms(ns: u64) -> f64 {
    ns as f64 / 1e6
}

fn tasks_json(tasks: &[Task]) -> Vec<Value> {
    tasks
        .iter()
        .map(|t| json!({ "id": t.id, "worker": t.worker, "start_ms": ms(t.start_ns), "end_ms": ms(t.end_ns), "size": t.size }))
        .collect()
}

fn stages_json(stages: &[Stage]) -> Vec<Value> {
    stages
        .iter()
        .map(|s| json!({ "name": s.name, "parallel": s.parallel, "start_ms": ms(s.start_ns), "end_ms": ms(s.end_ns) }))
        .collect()
}

/// Per worker that ran at least one task.
fn workers_json(tasks: &[Task]) -> Vec<Value> {
    let mut by_worker: BTreeMap<u32, (u64, u64, u64)> = BTreeMap::new();
    for t in tasks {
        let w = by_worker.entry(t.worker).or_default();
        w.0 += 1;
        w.1 += t.end_ns - t.start_ns;
        w.2 += t.size;
    }
    by_worker
        .into_iter()
        .map(|(worker, (tasks, busy_ns, size))| json!({ "worker": worker, "tasks": tasks, "busy_ms": ms(busy_ns), "size": size }))
        .collect()
}

/// Time spent combining per-chunk results into one. `None` when there is no separate step.
fn merge_ms(run: &Run) -> Option<f64> {
    let merging = |s: &&Stage| s.name == "merge" || s.name == "append";
    run.stages.iter().any(|s| merging(&s)).then(|| run.stages.iter().filter(merging).map(|s| ms(s.end_ns - s.start_ns)).sum())
}

fn run_json(runs: &[Run]) -> Value {
    let shown = median_run(runs);
    json!({
        "wall_ms": ms(shown.wall_ns),
        "samples_ms": runs.iter().map(|r| ms(r.wall_ns)).collect::<Vec<_>>(),
        "tasks": tasks_json(&shown.tasks),
        "stages": stages_json(&shown.stages),
        "merge_ms": merge_ms(shown),
        "workers": workers_json(&shown.tasks),
        "checksum": format!("{:016x}", shown.checksum),
    })
}

fn gpu_json(runs: &[Run], backend: Backend) -> Option<Value> {
    let phases = median_run(runs).gpu?;
    Some(json!({
        "device": backend.availability().ok(),
        "copy_in_ms": phases.copy_in * 1e3,
        "kernel_ms": phases.kernel * 1e3,
        "launch_overhead_ms": (phases.wall - phases.kernel).max(0.0) * 1e3,
        "copy_out_ms": phases.copy_out * 1e3,
        "median_kernel_ms": median(&runs.iter().filter_map(|r| r.gpu).map(|g| g.kernel * 1e3).collect::<Vec<_>>()),
        "note": if backend == Backend::Metal {
            "shared memory: copy in is a memcpy; copy out includes summing the partial results on the CPU"
        } else {
            "copies cross PCIe from pageable host memory"
        },
    }))
}

fn task_note(workload: &str, backend: &str) -> &'static str {
    match (workload, backend) {
        (_, "metal" | "cuda-naive" | "cuda-warp" | "cuda-ptx") => {
            "no per-task records: the GPU does not report times for its threadgroups or blocks, only the phases in 'gpu'"
        }
        ("generate", "rayon") => {
            "one Rayon task per chunk of flights (work stealing); task sizes are bags produced, including surplus flights that are dropped. Flight drawing and appending are serial stages; sorting and column building are parallel stages without per-task records"
        }
        ("generate", _) => "one thread; a record per chunk of flights, followed by the sort and column-building stages",
        (_, "openmp") => "OpenMP schedule(static) over the chunks: each thread gets a contiguous block",
        ("classify", "rayon-ilp" | "rayon-neon" | "rayon-avx2") | ("aggregate", "rayon") => {
            "one Rayon task per chunk (work stealing), then the partial results are merged on one thread"
        }
        _ => "one thread processes the chunks in order; the chunks only provide progress records",
    }
}

/// Run a validated config. `retained` is the run named by `simulation_id`.
/// `progress` receives (phase, repetitions done, repetitions total).
pub fn execute(cfg: &ParallelConfig, retained: Option<&SimData>, progress: &mut dyn FnMut(&'static str, u64, u64)) -> Result<Value, String> {
    let backend = cfg.backend.as_deref().expect("validated");
    let threads = cfg.threads.expect("validated");
    // sequential and selected, each with one warm-up
    let total = 2 * (cfg.repetitions as u64 + 1);
    let mut done = 0;
    progress("preparing", 0, total);
    let dataset = || generate_par(&GenConfig { seed: SEED, target_bags: cfg.bag_count as usize }, logical_cores()).1;

    let executed = match cfg.workload.as_str() {
        "generate" => {
            let mut tick = || {
                done += 1;
                progress("running", done, total);
            };
            generate_workload(cfg, backend, threads, &mut tick)?
        }
        "classify" => {
            let bags = dataset();
            let mut tick = || {
                done += 1;
                progress("running", done, total);
            };
            let backend = Backend::parse(backend).expect("validated");
            classify_workload(cfg, &bags, backend, threads, &mut tick)?
        }
        _ => {
            // the histories to aggregate: from a retained run, or a Normal run made now
            let prepared;
            let input = match retained {
                Some(run) => run.aggregate_input(),
                None => {
                    let bags = dataset();
                    let (nodes, edges) = airport_network(1);
                    let options = CollectOptions { history: true, sample_interval_ms: None };
                    let (_, collected) =
                        run_collected(&bags, &nodes, &edges, Strategy::Dijkstra, Policy::Fcfs, SEED, &[], options, None);
                    prepared = (bags, nodes, collected);
                    let (bags, nodes, collected) = &prepared;
                    aggregate::Input { history: collected.history.as_ref().expect("history collection is on"), bags, nodes }
                }
            };
            let mut tick = || {
                done += 1;
                progress("running", done, total);
            };
            aggregate_workload(cfg, input, backend, threads, &mut tick)?
        }
    };

    let expected = executed.sequential[0].checksum;
    let matches = executed.sequential.iter().chain(&executed.selected).all(|r| r.checksum == expected);
    let (sequential, selected) = (median_run(&executed.sequential), median_run(&executed.selected));
    let kernel = Backend::parse(backend).filter(|_| cfg.workload == "classify");
    let sequential_backend = if cfg.workload == "classify" { "scalar" } else { "sequential" };
    let mut sequential_json = run_json(&executed.sequential);
    sequential_json["backend"] = json!(sequential_backend);
    let mut parallel_json = run_json(&executed.selected);
    parallel_json["backend"] = json!(backend);
    Ok(json!({
        "workload": cfg.workload,
        "backend": backend,
        "threads": (!kernel.is_some_and(Backend::is_gpu)).then_some(threads),
        "bags": executed.bags,
        "chunk": { "unit": chunk_unit(&cfg.workload), "size": cfg.chunk_size },
        "repetitions": cfg.repetitions,
        "selected": parallel_json,
        "sequential": sequential_json,
        "speedup": sequential.wall_ns as f64 / selected.wall_ns as f64,
        "result_checksum": format!("{:016x}", selected.checksum),
        "sequential_checksum": format!("{:016x}", sequential.checksum),
        // every timed repetition on both sides, not only the ones shown
        "matches_sequential": matches,
        "simd": kernel.and_then(simd_info),
        "gpu": kernel.and_then(|k| gpu_json(&executed.selected, k)),
        "task_note": task_note(&cfg.workload, backend),
        "output": executed.output,
        "machine": { "os": std::env::consts::OS, "arch": std::env::consts::ARCH, "logical_cores": logical_cores() },
        "debug_build": cfg!(debug_assertions),
        "definitions": {
            "times": "milliseconds since the start of the timed execution; thread pools, GPU buffers and the input data are created before it",
            "shown_run": "on each side the repetition with the median wall time, after one untimed warm-up; sequential and selected repetitions alternate. Its tasks and stages are the ones returned",
            "speedup": "sequential wall_ms / selected wall_ms, same input and chunk size",
            "merge_ms": "combining per-chunk results: the merge stage, or appending per-chunk bags for generate",
        },
    }))
}
