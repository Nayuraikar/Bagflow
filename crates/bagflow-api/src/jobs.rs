//! Job registry: one worker thread runs every kind of job one at a time.
//! Records (config and summary metrics) are saved to the data folder; full simulation
//! data stays in memory for the most recent runs only.

use crate::bench::{self, BenchConfig};
use crate::error::{ApiError, ApiResult};
use crate::parallel::{self, ParallelConfig};
use crate::sweep::{self, SweepConfig};
use crate::sim::{self, SimConfig, SimData};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::watch;

/// Jobs that may wait behind the running one.
pub const MAX_QUEUED: usize = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Simulation,
    Benchmark,
    Parallel,
    Sweep,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Queued,
    Running,
    Done,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Record {
    pub id: String,
    pub kind: Kind,
    pub status: Status,
    pub created_at_ms: u64,
    pub started_at_ms: Option<u64>,
    pub finished_at_ms: Option<u64>,
    pub config: Value,
    pub config_hash: String,
    pub error: Option<String>,
    /// Simulations: dataset, summary and node rows. Benchmarks: the metrics.
    pub result: Option<Value>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Progress {
    pub status: Status,
    pub phase: &'static str,
    pub done: u64,
    pub total: u64,
    pub error: Option<String>,
    /// Sweeps only: counts, running and finished experiments of the current pass.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<Value>,
}

impl Progress {
    pub fn finished(&self) -> bool {
        matches!(self.status, Status::Done | Status::Failed)
    }
}

pub enum Work {
    Simulation(SimConfig),
    Benchmark(BenchConfig),
    /// With the retained run named in the config, held so it cannot be evicted while queued.
    Parallel(ParallelConfig, Option<Arc<SimData>>),
    Sweep(SweepConfig),
}

#[derive(Default)]
struct Registry {
    /// Oldest first.
    order: Vec<String>,
    records: HashMap<String, Record>,
    live: HashMap<String, watch::Sender<Progress>>,
    retained: VecDeque<(String, Arc<SimData>)>,
}

pub struct Shared {
    registry: Mutex<Registry>,
    /// Held while anything is being computed, so timings never overlap.
    pub run_lock: Mutex<()>,
    data_dir: PathBuf,
    retain: usize,
}

pub struct Jobs {
    pub shared: Arc<Shared>,
    queue: Mutex<(Sender<(String, Work)>, u64)>,
}

/// A panicking job must not take the whole API down with a poisoned lock.
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// FNV-1a of the config JSON (keys are sorted by serde_json's map).
fn config_hash(config: &Value) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in config.to_string().bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

impl Jobs {
    pub fn start(data_dir: PathBuf, retain: usize) -> std::io::Result<Jobs> {
        let runs = data_dir.join("runs");
        std::fs::create_dir_all(&runs)?;
        let mut saved: Vec<Record> = Vec::new();
        for entry in std::fs::read_dir(&runs)? {
            let path = entry?.path();
            if path.extension().is_none_or(|e| e != "json") {
                continue;
            }
            let read = std::fs::read(&path).map_err(|e| e.to_string());
            match read.and_then(|b| serde_json::from_slice::<Record>(&b).map_err(|e| e.to_string())) {
                Ok(r) => saved.push(r),
                Err(e) => eprintln!("ignoring unreadable run record {}: {e}", path.display()),
            }
        }
        saved.sort_by(|a, b| (a.created_at_ms, &a.id).cmp(&(b.created_at_ms, &b.id)));
        let mut registry = Registry::default();
        for r in saved {
            registry.order.push(r.id.clone());
            registry.records.insert(r.id.clone(), r);
        }
        let shared = Arc::new(Shared { registry: Mutex::new(registry), run_lock: Mutex::new(()), data_dir, retain: retain.max(1) });
        let (tx, rx) = channel();
        let worker_shared = shared.clone();
        std::thread::Builder::new().name("bagflow-worker".into()).spawn(move || worker(worker_shared, rx))?;
        Ok(Jobs { shared, queue: Mutex::new((tx, 0)) })
    }

    /// Queue a validated job and return its id.
    pub fn submit(&self, work: Work) -> ApiResult<String> {
        let (kind, prefix, config) = match &work {
            Work::Simulation(c) => (Kind::Simulation, "sim", serde_json::to_value(c)),
            Work::Benchmark(c) => (Kind::Benchmark, "bench", serde_json::to_value(c)),
            Work::Parallel(c, _) => (Kind::Parallel, "par", serde_json::to_value(c)),
            Work::Sweep(c) => (Kind::Sweep, "sweep", serde_json::to_value(c)),
        };
        let config = config.map_err(|e| ApiError::internal(e.to_string()))?;
        // holding the queue lock keeps registry order equal to execution order
        let mut queue = lock(&self.queue);
        let mut reg = lock(&self.shared.registry);
        let waiting = reg.records.values().filter(|r| r.status == Status::Queued).count();
        if waiting >= MAX_QUEUED {
            return Err(ApiError::new(StatusCode::TOO_MANY_REQUESTS, "queue_full", format!("{waiting} jobs are already waiting")));
        }
        queue.1 += 1;
        let created = now_ms();
        let id = format!("{prefix}-{created}-{}", queue.1);
        let record = Record {
            id: id.clone(),
            kind,
            status: Status::Queued,
            created_at_ms: created,
            started_at_ms: None,
            finished_at_ms: None,
            config_hash: config_hash(&config),
            config,
            error: None,
            result: None,
        };
        reg.order.push(id.clone());
        reg.records.insert(id.clone(), record);
        let progress = Progress { status: Status::Queued, phase: "queued", done: 0, total: 0, error: None, detail: None };
        reg.live.insert(id.clone(), watch::channel(progress).0);
        drop(reg);
        queue.0.send((id.clone(), work)).map_err(|_| ApiError::internal("the worker thread has stopped"))?;
        Ok(id)
    }

    pub fn record(&self, id: &str, kind: Kind) -> ApiResult<Record> {
        lock(&self.shared.registry)
            .records
            .get(id)
            .filter(|r| r.kind == kind)
            .cloned()
            .ok_or_else(|| ApiError::not_found(format!("no {kind:?} with id '{id}'").to_lowercase()))
    }

    /// A finished record, or why its results are not available.
    pub fn finished(&self, id: &str, kind: Kind) -> ApiResult<Record> {
        let r = self.record(id, kind)?;
        match r.status {
            Status::Done => Ok(r),
            Status::Failed => Err(ApiError::new(StatusCode::CONFLICT, "job_failed", r.error.unwrap_or_default())),
            _ => Err(ApiError::new(StatusCode::CONFLICT, "not_finished", "the job has not finished yet")),
        }
    }

    /// The full data of a finished simulation, if it is still in memory.
    pub fn data(&self, id: &str) -> ApiResult<Arc<SimData>> {
        self.finished(id, Kind::Simulation)?;
        self.retained(id).ok_or_else(|| {
            ApiError::new(
                StatusCode::GONE,
                "run_not_retained",
                "only the most recent runs keep bag histories and time-series; submit the same config again to recompute them",
            )
        })
    }

    pub fn retained(&self, id: &str) -> Option<Arc<SimData>> {
        lock(&self.shared.registry).retained.iter().find(|x| x.0 == id).map(|x| x.1.clone())
    }

    /// Newest first.
    pub fn history(&self) -> Vec<Record> {
        let reg = lock(&self.shared.registry);
        reg.order.iter().rev().filter_map(|id| reg.records.get(id).cloned()).collect()
    }

    pub fn progress(&self, id: &str) -> Option<Progress> {
        lock(&self.shared.registry).live.get(id).map(|tx| tx.borrow().clone())
    }

    pub fn subscribe(&self, id: &str) -> Option<watch::Receiver<Progress>> {
        lock(&self.shared.registry).live.get(id).map(|tx| tx.subscribe())
    }
}

fn worker(shared: Arc<Shared>, rx: Receiver<(String, Work)>) {
    while let Ok((id, work)) = rx.recv() {
        let guard = lock(&shared.run_lock);
        let tx = {
            let mut reg = lock(&shared.registry);
            if let Some(r) = reg.records.get_mut(&id) {
                r.status = Status::Running;
                r.started_at_ms = Some(now_ms());
            }
            reg.live.get(&id).cloned()
        };
        let publish = |phase: &'static str, done: u64, total: u64, detail: Option<Value>| {
            if let Some(tx) = &tx {
                tx.send_replace(Progress { status: Status::Running, phase, done, total, error: None, detail });
            }
        };
        let mut report = |phase: &'static str, done: u64, total: u64| publish(phase, done, total, None);
        let outcome = catch_unwind(AssertUnwindSafe(|| match &work {
            Work::Simulation(cfg) => sim::execute(cfg, &mut report).map(|f| (f.result, Some(Arc::new(f.data)))),
            Work::Benchmark(cfg) => bench::execute(cfg, &mut report).map(|r| (r, None)),
            Work::Parallel(cfg, run) => parallel::execute(cfg, run.as_deref(), &mut report).map(|r| (r, None)),
            Work::Sweep(cfg) => sweep::execute(cfg, &publish).map(|r| (r, None)),
        }))
        .unwrap_or_else(|panic| {
            let text = panic.downcast_ref::<&str>().map(|s| s.to_string());
            Err(text.or_else(|| panic.downcast_ref::<String>().cloned()).unwrap_or_else(|| "the job panicked".into()))
        });
        drop(guard);

        let mut reg = lock(&shared.registry);
        let Some(mut record) = reg.records.get(&id).cloned() else { continue };
        record.finished_at_ms = Some(now_ms());
        match outcome {
            Ok((result, data)) => {
                record.status = Status::Done;
                record.result = Some(result);
                if let Some(data) = data {
                    reg.retained.push_back((id.clone(), data));
                    while reg.retained.len() > shared.retain {
                        reg.retained.pop_front();
                    }
                }
            }
            Err(e) => {
                record.status = Status::Failed;
                record.error = Some(e);
            }
        }
        // save before the record shows as finished, so a client that sees "done" can rely on it
        drop(reg);
        if let Err(e) = save(&shared.data_dir, &record) {
            eprintln!("could not save run record {id}: {e}");
        }
        let (status, error) = (record.status, record.error.clone());
        let mut reg = lock(&shared.registry);
        reg.records.insert(id.clone(), record);
        if let Some(tx) = reg.live.remove(&id) {
            let last = tx.borrow().clone();
            let phase = if status == Status::Done { "done" } else { "failed" };
            tx.send_replace(Progress { status, phase, error, ..last });
        }
    }
}

fn save(data_dir: &std::path::Path, record: &Record) -> std::io::Result<()> {
    let runs = data_dir.join("runs");
    let tmp = runs.join(format!("{}.tmp", record.id));
    std::fs::write(&tmp, serde_json::to_vec_pretty(record)?)?;
    std::fs::rename(tmp, runs.join(format!("{}.json", record.id)))
}
