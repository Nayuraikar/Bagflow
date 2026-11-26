//! Parallel sweeps: many independent simulations on one Rayon pool. Each simulation is
//! sequential inside and runs with collection off. The sweep is repeated on one thread
//! and every result is compared.

use crate::bench::{self, logical_cores};
use crate::error::{ApiError, ApiResult};
use crate::jobs::lock;
use crate::pipeline::build_pool;
use crate::sim::{self, check_range, parse_policy, parse_routing, parse_scenario, scale_servers, SEED};
use bagflow_core::engine2::{run_with, Policy, RunStats, Strategy};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::airport_network;
use bagflow_core::scenarios::{build, Setup, ALL};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Mutex;
use std::time::Instant;

pub const BAG_COUNT_RANGE: (u64, u64) = (1_000, 500_000);
pub const MAX_EXPERIMENTS: usize = 384;
pub const MAX_THREAD_COUNTS: usize = 8;
/// Requested bags x experiments x passes, to bound how long one sweep can hold the queue.
pub const MAX_SIMULATED_BAGS: u64 = 500_000_000;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct SweepConfig {
    pub scenarios: Vec<String>,
    pub routings: Vec<String>,
    pub policies: Vec<String>,
    pub capacity_pcts: Vec<u32>,
    pub server_multiplier: u32,
    pub bag_count: u64,
    /// Thread counts to measure. Empty means all logical cores. A one-thread pass is
    /// always run first as the baseline.
    pub threads: Vec<usize>,
}

impl Default for SweepConfig {
    fn default() -> Self {
        SweepConfig {
            scenarios: ALL.iter().map(|x| format!("{x:?}")).collect(),
            routings: Strategy::ALL.iter().map(|x| x.name().into()).collect(),
            policies: Policy::ALL.iter().map(|x| x.name().into()).collect(),
            capacity_pcts: vec![100],
            server_multiplier: 1,
            bag_count: 100_000,
            threads: Vec::new(),
        }
    }
}

fn dedup<T: PartialEq + Clone>(v: &[T]) -> Vec<T> {
    v.iter().enumerate().filter(|(i, x)| !v[..*i].contains(x)).map(|(_, x)| x.clone()).collect()
}

fn names(label: &str, v: &[String], known: impl Fn(&str) -> bool) -> ApiResult<Vec<String>> {
    if v.is_empty() {
        return Err(ApiError::invalid(format!("{label} must not be empty")));
    }
    match v.iter().find(|x| !known(x)) {
        Some(bad) => Err(ApiError::invalid(format!("unknown value '{bad}' in {label}"))),
        None => Ok(dedup(v)),
    }
}

#[derive(Clone, Copy)]
struct Experiment {
    scenario: usize,
    routing: Strategy,
    policy: Policy,
    capacity_pct: u32,
}

impl SweepConfig {
    /// Check the request, drop repeated values and fill in the default thread count.
    pub fn validate(mut self) -> ApiResult<SweepConfig> {
        self.scenarios = names("scenarios", &self.scenarios, |s| parse_scenario(s).is_some())?;
        self.routings = names("routings", &self.routings, |s| parse_routing(s).is_some())?;
        self.policies = names("policies", &self.policies, |s| parse_policy(s).is_some())?;
        if self.capacity_pcts.is_empty() {
            return Err(ApiError::invalid("capacity_pcts must not be empty"));
        }
        for &p in &self.capacity_pcts {
            check_range("capacity_pcts", p, sim::CAPACITY_PCT_RANGE)?;
        }
        self.capacity_pcts = dedup(&self.capacity_pcts);
        check_range("server_multiplier", self.server_multiplier, sim::MULTIPLIER_RANGE)?;
        check_range("bag_count", self.bag_count, BAG_COUNT_RANGE)?;
        if self.threads.is_empty() {
            self.threads = vec![logical_cores()];
        }
        for &t in &self.threads {
            check_range("threads", t, bench::THREADS_RANGE)?;
        }
        self.threads.sort_unstable();
        self.threads.dedup();
        check_range("number of thread counts", self.threads.len(), (1, MAX_THREAD_COUNTS))?;
        let experiments = self.experiment_count();
        check_range("number of experiments", experiments, (1, MAX_EXPERIMENTS))?;
        let work = self.bag_count * experiments as u64 * self.passes().len() as u64;
        if work > MAX_SIMULATED_BAGS {
            return Err(ApiError::invalid(format!(
                "the sweep would simulate {work} bags over all passes; the limit is {MAX_SIMULATED_BAGS}. Use fewer experiments, bags or thread counts"
            )));
        }
        Ok(self)
    }

    pub fn experiment_count(&self) -> usize {
        // saturating: the lists are bounded by validation, but not yet when this is first checked
        [self.routings.len(), self.policies.len(), self.capacity_pcts.len()]
            .into_iter()
            .fold(self.scenarios.len(), usize::saturating_mul)
    }

    /// Thread counts in run order: one thread first.
    fn passes(&self) -> Vec<usize> {
        let mut p = vec![1];
        p.extend(self.threads.iter().copied().filter(|&t| t != 1));
        p
    }

    fn grid(&self) -> Vec<Experiment> {
        let mut out = Vec::with_capacity(self.experiment_count());
        for scenario in 0..self.scenarios.len() {
            for r in &self.routings {
                for p in &self.policies {
                    for &capacity_pct in &self.capacity_pcts {
                        out.push(Experiment {
                            scenario,
                            routing: parse_routing(r).expect("validated"),
                            policy: parse_policy(p).expect("validated"),
                            capacity_pct,
                        });
                    }
                }
            }
        }
        out
    }
}

/// Everything the engine returns. Two runs of one experiment must be equal in all of it.
#[derive(Clone, Debug, PartialEq)]
struct Outcome {
    counts: [u64; 6],
    times_s: [f64; 2],
    arrivals: Vec<u64>,
    max_queue: Vec<u32>,
    avg_wait_s: Vec<f64>,
    util: Vec<f64>,
    checksum: u64,
}

impl From<RunStats> for Outcome {
    fn from(s: RunStats) -> Outcome {
        Outcome {
            counts: [s.n as u64, s.loaded, s.delayed, s.unfinished, s.tight_total, s.tight_delayed],
            times_s: [s.mean_sojourn_s, s.p95_sojourn_s],
            arrivals: s.arrivals,
            max_queue: s.max_queue,
            avg_wait_s: s.avg_wait_s,
            util: s.util,
            checksum: s.checksum,
        }
    }
}

impl Outcome {
    fn json(&self) -> Value {
        let [n, loaded, delayed, unfinished, tight, tight_delayed] = self.counts;
        json!({
            "bags_simulated": n,
            "loaded_on_time": loaded,
            "delayed_bags": delayed,
            "unfinished_bags": unfinished,
            "delayed_pct": 100.0 * delayed as f64 / n.max(1) as f64,
            "tight_delayed_pct": 100.0 * tight_delayed as f64 / tight.max(1) as f64,
            "mean_sojourn_s": self.times_s[0],
            "p95_sojourn_s": self.times_s[1],
            "max_queue": self.max_queue.iter().max().copied().unwrap_or(0),
            "max_utilisation": self.util.iter().copied().fold(0.0f64, f64::max),
            "engine_checksum": format!("{:016x}", self.checksum),
        })
    }
}

fn simulate(setup: &Setup, e: Experiment) -> Outcome {
    let mut nodes = setup.nodes.clone();
    scale_servers(&mut nodes, e.capacity_pct);
    run_with(&setup.bags, &nodes, &setup.edges, e.routing, e.policy, SEED, &setup.outages).into()
}

struct Ran {
    worker: usize,
    start_ms: f64,
    end_ms: f64,
    outcome: Result<Outcome, String>,
}

/// The state of the pass that is running, for progress events.
#[derive(Default)]
struct Live {
    /// Experiment index -> (worker, start ms).
    active: BTreeMap<usize, (usize, f64)>,
    finished: Vec<Value>,
    failed: u64,
}

/// What a progress event reports: (phase, experiments finished over all passes,
/// total over all passes, detail of the current pass).
pub type Report<'a> = &'a (dyn Fn(&'static str, u64, u64, Option<Value>) + Sync);

struct Pass<'a> {
    index: usize,
    count: usize,
    threads: usize,
    experiments: usize,
    report: Report<'a>,
}

impl Pass<'_> {
    /// Call with the lock on `live` held, so events leave in order.
    fn publish(&self, live: &Live) {
        let finished = live.finished.len() as u64;
        let n = self.experiments as u64;
        let detail = json!({
            "pass_index": self.index,
            "passes": self.count,
            "pass_threads": self.threads,
            "experiments": n,
            "completed": finished - live.failed,
            "running": live.active.len(),
            "failed": live.failed,
            "active": live.active.iter().map(|(&i, &(w, s))| json!({ "index": i, "worker": w, "start_ms": s })).collect::<Vec<_>>(),
            "finished": live.finished,
        });
        (self.report)("sweeping", self.index as u64 * n + finished, self.count as u64 * n, Some(detail));
    }

    /// Run the whole grid on a pool of `threads`. Returns the wall time in ms and one
    /// record per experiment, in grid order.
    fn run(&self, pool: &rayon::ThreadPool, grid: &[Experiment], setups: &[Setup]) -> (f64, Vec<Ran>) {
        let live = Mutex::new(Live::default());
        self.publish(&lock(&live));
        let t0 = Instant::now();
        let now = || t0.elapsed().as_secs_f64() * 1e3;
        let runs = pool.install(|| {
            grid.par_iter()
                .with_max_len(1)
                .enumerate()
                .map(|(i, &e)| {
                    let worker = rayon::current_thread_index().unwrap_or(0);
                    let start_ms = now();
                    {
                        let mut l = lock(&live);
                        l.active.insert(i, (worker, start_ms));
                        self.publish(&l);
                    }
                    let start_ms = now();
                    let outcome = catch_unwind(AssertUnwindSafe(|| simulate(&setups[e.scenario], e))).map_err(|panic| {
                        let text = panic.downcast_ref::<&str>().map(|s| s.to_string());
                        text.or_else(|| panic.downcast_ref::<String>().cloned()).unwrap_or_else(|| "the simulation panicked".into())
                    });
                    let end_ms = now();
                    let mut l = lock(&live);
                    l.active.remove(&i);
                    l.failed += outcome.is_err() as u64;
                    let status = if outcome.is_ok() { "completed" } else { "failed" };
                    l.finished.push(json!({ "index": i, "worker": worker, "start_ms": start_ms, "end_ms": end_ms, "status": status }));
                    self.publish(&l);
                    Ran { worker, start_ms, end_ms, outcome }
                })
                .collect()
        });
        (now(), runs)
    }
}

/// Per worker: experiments run and time spent in them.
fn distribution(runs: &[Ran], threads: usize) -> Vec<Value> {
    let mut rows = vec![(0u64, 0.0f64); threads];
    for r in runs {
        rows[r.worker].0 += 1;
        rows[r.worker].1 += r.end_ms - r.start_ms;
    }
    rows.into_iter().enumerate().map(|(w, (n, busy))| json!({ "worker": w, "experiments": n, "busy_ms": busy })).collect()
}

/// Experiments that did not finish with exactly the one-thread result.
fn mismatches(baseline: &[Ran], runs: &[Ran]) -> Vec<usize> {
    baseline
        .iter()
        .zip(runs)
        .enumerate()
        .filter(|(_, (a, b))| !matches!((&a.outcome, &b.outcome), (Ok(x), Ok(y)) if x == y))
        .map(|(i, _)| i)
        .collect()
}

/// Run a validated config.
pub fn execute(cfg: &SweepConfig, report: Report) -> Result<Value, String> {
    let grid = cfg.grid();
    let passes = cfg.passes();
    let total = (grid.len() * passes.len()) as u64;
    report("generating", 0, total, None);
    let (_, base) = generate_par(&GenConfig { seed: SEED, target_bags: cfg.bag_count as usize }, logical_cores());
    let dataset_checksum = base.checksum();

    // one read-only workload per scenario, shared by every experiment that uses it
    report("preparing", 0, total, None);
    let t = Instant::now();
    let (nodes, edges) = airport_network(cfg.server_multiplier as u16);
    let setups: Vec<Setup> = cfg
        .scenarios
        .iter()
        .map(|s| build(parse_scenario(s).expect("validated"), &base, &nodes, &edges, SEED))
        .collect();
    let prepare_ms = t.elapsed().as_secs_f64() * 1e3;
    let bags_generated = base.len();
    drop(base);

    // untimed, so the first timed pass does not pay for warming up memory and caches
    report("warming_up", 0, total, None);
    simulate(&setups[grid[0].scenario], grid[0]);

    let mut baseline: Option<(f64, Vec<Ran>)> = None;
    let mut rows = Vec::new();
    let mut all_identical = true;
    for (index, &threads) in passes.iter().enumerate() {
        let pool = build_pool(threads)?;
        let pass = Pass { index, count: passes.len(), threads, experiments: grid.len(), report };
        let (wall_ms, runs) = pass.run(&pool, &grid, &setups);
        let (base_wall, base_runs) = match &baseline {
            Some((w, r)) => (*w, r.as_slice()),
            None => (wall_ms, runs.as_slice()),
        };
        let compared = index > 0;
        let different = if compared { mismatches(base_runs, &runs) } else { Vec::new() };
        all_identical &= different.is_empty();
        let failed = runs.iter().filter(|r| r.outcome.is_err()).count();
        let speedup = base_wall / wall_ms;
        rows.push(json!({
            "threads": threads,
            "is_baseline": !compared,
            "requested": cfg.threads.contains(&threads),
            "wall_ms": wall_ms,
            "speedup": speedup,
            "efficiency_pct": 100.0 * speedup / threads as f64,
            "time_saved_ms": base_wall - wall_ms,
            "completed": runs.len() - failed,
            "running": 0,
            "failed": failed,
            "identical_to_one_thread": compared.then_some(different.is_empty()),
            "mismatches": different,
            "workers": distribution(&runs, threads),
            "runs": runs.iter().enumerate().map(|(i, r)| json!({
                "index": i,
                "worker": r.worker,
                "start_ms": r.start_ms,
                "end_ms": r.end_ms,
                "status": if r.outcome.is_ok() { "completed" } else { "failed" },
                "error": r.outcome.as_ref().err(),
                "engine_checksum": r.outcome.as_ref().ok().map(|o| format!("{:016x}", o.checksum)),
            })).collect::<Vec<_>>(),
        }));
        if baseline.is_none() {
            baseline = Some((wall_ms, runs));
        }
    }

    let (_, base_runs) = baseline.expect("there is always a one-thread pass");
    let experiments: Vec<Value> = grid
        .iter()
        .zip(&base_runs)
        .enumerate()
        .map(|(i, (e, r))| {
            json!({
                "index": i,
                "scenario": cfg.scenarios[e.scenario],
                "routing": e.routing.name(),
                "policy": e.policy.name(),
                "capacity_pct": e.capacity_pct,
                "result": r.outcome.as_ref().ok().map(Outcome::json),
                "error": r.outcome.as_ref().err(),
            })
        })
        .collect();
    let compared_passes = passes.len() - 1;
    let failed_baseline = base_runs.iter().any(|r| r.outcome.is_err());
    Ok(json!({
        "dataset": {
            "seed": SEED,
            "bags_requested": cfg.bag_count,
            "bags_generated": bags_generated,
            "checksum": format!("{dataset_checksum:016x}"),
        },
        "experiment_count": grid.len(),
        "experiments": experiments,
        "passes": rows,
        "consistency": {
            // with a one-thread pass only, there is nothing to compare against
            "checked": compared_passes > 0,
            "compared_runs": compared_passes * grid.len(),
            "all_identical": (compared_passes > 0).then_some(all_identical && !failed_baseline),
        },
        "prepare_ms": prepare_ms,
        "machine": { "os": std::env::consts::OS, "arch": std::env::consts::ARCH, "logical_cores": logical_cores() },
        "debug_build": cfg!(debug_assertions),
        "definitions": {
            "wall_ms": "from starting the grid on the pool until the last experiment ends. Dataset generation, scenario preparation (prepare_ms) and one warm-up simulation happen before",
            "speedup": "one-thread wall_ms / wall_ms, same grid in this job",
            "efficiency_pct": "100 * speedup / threads. Cores need not be equal in speed",
            "run times": "milliseconds since the start of their pass",
            "identical_to_one_thread": "every engine output, including the checksum over all bag finish times, equals the one-thread pass",
            "simulation": "each experiment is one sequential engine2 run with collection off; scenario workloads are shared read-only",
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ran(outcome: Result<Outcome, String>) -> Ran {
        Ran { worker: 0, start_ms: 0.0, end_ms: 1.0, outcome }
    }

    #[test]
    fn grid_covers_every_combination_once() {
        let cfg = SweepConfig::default().validate().unwrap();
        assert_eq!(cfg.grid().len(), 6 * 4 * 4);
        assert_eq!(cfg.experiment_count(), 96);
        let one = SweepConfig { threads: vec![4, 1, 4, 2], ..Default::default() }.validate().unwrap();
        assert_eq!(one.passes(), [1, 2, 4]);
    }

    #[test]
    fn a_different_or_failed_result_is_a_mismatch() {
        let o = Outcome { counts: [1; 6], times_s: [1.0, 2.0], arrivals: vec![1], max_queue: vec![0], avg_wait_s: vec![0.0], util: vec![0.5], checksum: 7 };
        let mut other = o.clone();
        other.util[0] = 0.25;
        let base = [ran(Ok(o.clone())), ran(Ok(o.clone())), ran(Ok(o.clone())), ran(Err("x".into()))];
        let runs = [ran(Ok(o.clone())), ran(Ok(other)), ran(Err("boom".into())), ran(Err("x".into()))];
        assert_eq!(mismatches(&base, &runs), [1, 2, 3]);
    }
}
