//! HTTP API over `engine2` and the batch kernels. JSON in snake_case; times are
//! simulation milliseconds; unavailable values are `null`.

pub mod bench;
pub mod error;
pub mod jobs;
mod legacy;
pub mod sim;
pub mod static_results;

use axum::extract::rejection::{JsonRejection, QueryRejection};
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use bagflow_core::soa::BagSoA;
use bench::BenchConfig;
use error::{ApiError, ApiResult};
use jobs::{Jobs, Kind, Progress, Record, Status, Work};
use serde::Deserialize;
use serde_json::{json, Value};
use sim::SimConfig;
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use tower_http::cors::CorsLayer;

/// Simulation runs whose full data stays in memory.
pub const DEFAULT_RETAIN: usize = 3;

pub struct Config {
    pub data_dir: PathBuf,
    pub results_dir: PathBuf,
    pub retain: usize,
    /// Dataset size for the old `/api/run`, built on first use.
    pub legacy_bag_count: usize,
}

impl Config {
    /// Paths relative to the repository this crate was built from.
    pub fn repo_default() -> Config {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        Config {
            data_dir: root.join("data"),
            results_dir: root.join("results"),
            retain: DEFAULT_RETAIN,
            legacy_bag_count: 250_000,
        }
    }
}

pub struct AppState {
    pub jobs: Jobs,
    results_dir: PathBuf,
    pub(crate) legacy_bags: OnceLock<BagSoA>,
    pub(crate) legacy_bag_count: usize,
    backends: OnceLock<Value>,
}

pub fn app(cfg: Config) -> std::io::Result<Router> {
    let state = Arc::new(AppState {
        jobs: Jobs::start(cfg.data_dir, cfg.retain)?,
        results_dir: cfg.results_dir,
        legacy_bags: OnceLock::new(),
        legacy_bag_count: cfg.legacy_bag_count,
        backends: OnceLock::new(),
    });
    Ok(Router::new()
        .route("/api/health", get(health))
        .route("/api/simulations", post(create_simulation))
        .route("/api/simulations/:id", get(simulation))
        .route("/api/simulations/:id/events", get(simulation_events))
        .route("/api/simulations/:id/metrics", get(simulation_metrics))
        .route("/api/simulations/:id/network", get(network))
        .route("/api/simulations/:id/baggage", get(baggage))
        .route("/api/simulations/:id/baggage/:bag_id", get(bag))
        .route("/api/benchmarks", post(create_benchmark))
        .route("/api/benchmarks/:id", get(benchmark))
        .route("/api/benchmarks/:id/events", get(benchmark_events))
        .route("/api/benchmarks/:id/metrics", get(benchmark_metrics))
        .route("/api/static-results", get(static_rows))
        .route("/api/history", get(history))
        .route("/api/info", get(legacy::info))
        .route("/api/run", get(legacy::run))
        .fallback(|| async { ApiError::not_found("no such endpoint") })
        .layer(CorsLayer::permissive())
        .with_state(state))
}

type App = State<Arc<AppState>>;

/// Run a CPU-heavy closure off the async threads.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> ApiResult<T> + Send + 'static) -> ApiResult<T> {
    tokio::task::spawn_blocking(f).await.map_err(|e| ApiError::internal(e.to_string()))?
}

fn body<T>(r: Result<Json<T>, JsonRejection>) -> ApiResult<T> {
    r.map(|Json(v)| v).map_err(|e| ApiError::invalid(e.body_text()))
}

fn params<T>(r: Result<Query<T>, QueryRejection>) -> ApiResult<T> {
    r.map(|Query(v)| v).map_err(|e| ApiError::invalid(e.body_text()))
}

async fn health(State(s): App) -> ApiResult<Json<Value>> {
    let state = s.clone();
    // probing GPU devices is slow, so do it once
    let backends = blocking(move || {
        Ok(state
            .backends
            .get_or_init(|| {
                bagflow_kernels::runner::Backend::ALL
                    .iter()
                    .map(|b| {
                        let a = b.availability();
                        json!({
                            "id": b.id(),
                            "available": a.is_ok(),
                            "detail": a.as_ref().ok().filter(|d| !d.is_empty()),
                            "reason": a.as_ref().err(),
                            "takes_threads": b.takes_threads(),
                            "gpu": b.is_gpu(),
                        })
                    })
                    .collect()
            })
            .clone())
    })
    .await?;
    let records = s.jobs.history();
    let last_simulation = records
        .iter()
        .find(|r| r.kind == Kind::Simulation && r.status == Status::Done)
        .map(|r| json!({ "id": r.id, "finished_at_ms": r.finished_at_ms }));
    Ok(Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "engine": "engine2 (sequential discrete-event simulation)",
        "debug_build": cfg!(debug_assertions),
        "machine": { "os": std::env::consts::OS, "arch": std::env::consts::ARCH, "logical_cores": bench::logical_cores() },
        "backends": backends,
        "queue": {
            "running": records.iter().find(|r| r.status == Status::Running).map(|r| &r.id),
            "queued": records.iter().filter(|r| r.status == Status::Queued).count(),
            "max_queued": jobs::MAX_QUEUED,
        },
        "last_simulation": last_simulation,
        "options": {
            "scenarios": bagflow_core::scenarios::ALL.iter().map(|x| format!("{x:?}")).collect::<Vec<_>>(),
            "routings": bagflow_core::engine2::Strategy::ALL.iter().map(|x| x.name()).collect::<Vec<_>>(),
            "policies": bagflow_core::engine2::Policy::ALL.iter().map(|x| x.name()).collect::<Vec<_>>(),
            "simulation_defaults": SimConfig::default(),
            "simulation_limits": {
                "bag_count": sim::BAG_COUNT_RANGE,
                "capacity_pct": sim::CAPACITY_PCT_RANGE,
                "server_multiplier": sim::MULTIPLIER_RANGE,
            },
            "benchmark_limits": {
                "bag_count": bench::BAG_COUNT_RANGE,
                "repetitions": bench::REPETITIONS_RANGE,
                "warmup": bench::WARMUP_RANGE,
                "threads": bench::THREADS_RANGE,
            },
        },
    })))
}

async fn create_simulation(State(s): App, req: Result<Json<SimConfig>, JsonRejection>) -> ApiResult<(StatusCode, Json<Value>)> {
    let cfg = body(req)?;
    cfg.validate()?;
    let id = s.jobs.submit(Work::Simulation(cfg))?;
    Ok((StatusCode::ACCEPTED, Json(json!({ "id": id, "status": "queued" }))))
}

async fn create_benchmark(State(s): App, req: Result<Json<BenchConfig>, JsonRejection>) -> ApiResult<(StatusCode, Json<Value>)> {
    let cfg = body(req)?;
    // availability checks can create a GPU context
    let cfg = blocking(move || cfg.validate()).await?;
    let id = s.jobs.submit(Work::Benchmark(cfg))?;
    Ok((StatusCode::ACCEPTED, Json(json!({ "id": id, "status": "queued" }))))
}

/// A record without its result.
fn job_json(s: &AppState, r: &Record) -> Value {
    json!({
        "id": r.id,
        "kind": r.kind,
        "status": r.status,
        "created_at_ms": r.created_at_ms,
        "started_at_ms": r.started_at_ms,
        "finished_at_ms": r.finished_at_ms,
        "config": r.config,
        "config_hash": r.config_hash,
        "error": r.error,
        "progress": s.jobs.progress(&r.id),
    })
}

async fn simulation(State(s): App, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let r = s.jobs.record(&id, Kind::Simulation)?;
    let mut out = job_json(&s, &r);
    for key in ["dataset", "engine_checksum", "sim_wall_s", "summary"] {
        out[key] = r.result.as_ref().map_or(Value::Null, |x| x[key].clone());
    }
    out["retained"] = json!(s.jobs.retained(&id).is_some());
    Ok(Json(out))
}

async fn simulation_metrics(State(s): App, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let r = s.jobs.finished(&id, Kind::Simulation)?;
    let mut out = r.result.ok_or_else(|| ApiError::internal("finished run has no result"))?;
    out["id"] = json!(r.id);
    out["config"] = r.config;
    out["retained"] = json!(s.jobs.retained(&id).is_some());
    Ok(Json(out))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct At {
    at_ms: Option<u64>,
}

async fn network(State(s): App, Path(id): Path<String>, q: Result<Query<At>, QueryRejection>) -> ApiResult<Json<Value>> {
    let at = params(q)?.at_ms;
    let data = s.jobs.data(&id)?;
    blocking(move || Ok(Json(data.network(at)))).await
}

async fn baggage(
    State(s): App,
    Path(id): Path<String>,
    q: Result<Query<sim::BaggageQuery>, QueryRejection>,
) -> ApiResult<Json<Value>> {
    let q = params(q)?;
    let data = s.jobs.data(&id)?;
    blocking(move || data.baggage_page(&q).map(Json)).await
}

async fn bag(State(s): App, Path((id, bag_id)): Path<(String, String)>, q: Result<Query<At>, QueryRejection>) -> ApiResult<Json<Value>> {
    let at = params(q)?.at_ms;
    let bag_id: usize = bag_id.parse().map_err(|_| ApiError::invalid("bag id must be a whole number"))?;
    s.jobs.data(&id)?.bag_detail(bag_id, at).map(Json)
}

async fn benchmark(State(s): App, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let r = s.jobs.record(&id, Kind::Benchmark)?;
    Ok(Json(job_json(&s, &r)))
}

async fn benchmark_metrics(State(s): App, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let r = s.jobs.finished(&id, Kind::Benchmark)?;
    let mut out = r.result.ok_or_else(|| ApiError::internal("finished benchmark has no result"))?;
    out["id"] = json!(r.id);
    out["config"] = r.config;
    Ok(Json(out))
}

async fn static_rows(State(s): App) -> ApiResult<Json<Value>> {
    let rows = static_results::load(&s.results_dir).map_err(ApiError::internal)?;
    Ok(Json(json!({
        "static": true,
        "note": "saved measurements from earlier runs; not measured by this server",
        "rows": rows,
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct HistoryQuery {
    kind: Option<Kind>,
}

async fn history(State(s): App, q: Result<Query<HistoryQuery>, QueryRejection>) -> ApiResult<Json<Value>> {
    let kind = params(q)?.kind;
    let items: Vec<Value> = s
        .jobs
        .history()
        .into_iter()
        .filter(|r| kind.is_none_or(|k| r.kind == k))
        .map(|r| {
            let mut out = job_json(&s, &r);
            let result = r.result.as_ref();
            out["summary"] = match r.kind {
                Kind::Simulation => result.map_or(Value::Null, |x| x["summary"].clone()),
                Kind::Benchmark => result.map_or(Value::Null, |x| {
                    let rows: Vec<Value> = x["results"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .map(|row| {
                            json!({
                                "backend": row["backend"],
                                "threads": row["threads"],
                                "median_ms": row["time_ms"]["median"],
                                "speedup": row["speedup"],
                                "output_identical_to_scalar": row["output_identical_to_scalar"],
                            })
                        })
                        .collect();
                    json!({ "workload_size": x["workload_size"], "results": rows })
                }),
            };
            out["retained"] = json!(s.jobs.retained(&r.id).is_some());
            out
        })
        .collect();
    Ok(Json(json!({ "items": items })))
}

fn sse(s: &AppState, id: &str, kind: Kind) -> ApiResult<Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>>> {
    // subscribe before reading the record, so a job that finishes in between is not missed
    let rx = s.jobs.subscribe(id);
    let record = s.jobs.record(id, kind)?;
    let first = match &rx {
        Some(rx) => rx.borrow().clone(),
        None => Progress {
            status: record.status,
            phase: if record.status == Status::Done { "done" } else { "failed" },
            done: 0,
            total: 0,
            error: record.error,
        },
    };
    let event = |p: &Progress| {
        let name = match p.status {
            Status::Done => "done",
            Status::Failed => "failed",
            _ => "progress",
        };
        Ok(Event::default().event(name).data(json!(p).to_string()))
    };
    // state: (value to send next, receiver while more may follow)
    let stream = futures_util::stream::unfold((Some(first), rx), move |(next, rx)| async move {
        if let Some(p) = next {
            let rx = if p.finished() { None } else { rx };
            return Some((event(&p), (None, rx)));
        }
        let mut rx = rx?;
        rx.changed().await.ok()?;
        let p = rx.borrow_and_update().clone();
        let rest = (!p.finished()).then_some(rx);
        Some((event(&p), (None, rest)))
    });
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

async fn simulation_events(State(s): App, Path(id): Path<String>) -> ApiResult<impl axum::response::IntoResponse> {
    sse(&s, &id, Kind::Simulation)
}

async fn benchmark_events(State(s): App, Path(id): Path<String>) -> ApiResult<impl axum::response::IntoResponse> {
    sse(&s, &id, Kind::Benchmark)
}
