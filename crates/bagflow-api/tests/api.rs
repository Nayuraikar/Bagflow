use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use axum::Router;
use bagflow_api::{app, Config};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tower::ServiceExt;

/// A fresh data folder, removed when dropped.
struct TempDir(PathBuf);

impl TempDir {
    fn new(name: &str) -> TempDir {
        let dir = std::env::temp_dir().join(format!("bagflow-api-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        TempDir(dir)
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn server(dir: &TempDir, retain: usize) -> Router {
    app(Config { data_dir: dir.0.clone(), retain, ..Config::repo_default() }).unwrap()
}

async fn send(app: &Router, method: &str, uri: &str, body: Option<&str>) -> (StatusCode, String) {
    let mut req = Request::builder().method(method).uri(uri);
    if body.is_some() {
        req = req.header("content-type", "application/json");
    }
    let res = app.clone().oneshot(req.body(Body::from(body.unwrap_or("").to_string())).unwrap()).await.unwrap();
    let status = res.status();
    let bytes = to_bytes(res.into_body(), usize::MAX).await.unwrap();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

async fn get(app: &Router, uri: &str) -> Value {
    let (status, text) = send(app, "GET", uri, None).await;
    assert_eq!(status, StatusCode::OK, "{uri}: {text}");
    serde_json::from_str(&text).unwrap()
}

async fn expect_error(app: &Router, method: &str, uri: &str, body: Option<&str>, status: StatusCode, code: &str) {
    let (got, text) = send(app, method, uri, body).await;
    assert_eq!(got, status, "{uri} {body:?}: {text}");
    let v: Value = serde_json::from_str(&text).unwrap_or_else(|_| panic!("{uri}: not JSON: {text}"));
    assert_eq!(v["error"]["code"], code, "{uri} {body:?}: {text}");
}

async fn submit(app: &Router, uri: &str, cfg: Value) -> String {
    let (status, text) = send(app, "POST", uri, Some(&cfg.to_string())).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{text}");
    serde_json::from_str::<Value>(&text).unwrap()["id"].as_str().unwrap().to_string()
}

async fn wait_done(app: &Router, uri: &str) -> Value {
    let started = Instant::now();
    loop {
        let v = get(app, uri).await;
        match v["status"].as_str().unwrap() {
            "done" => return v,
            "failed" => panic!("{uri} failed: {}", v["error"]),
            _ => {}
        }
        assert!(started.elapsed() < Duration::from_secs(600), "{uri} did not finish");
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

fn int(v: &Value) -> u64 {
    v.as_u64().unwrap_or_else(|| panic!("not an integer: {v}"))
}

#[tokio::test]
async fn health_lists_options_and_backends() {
    let dir = TempDir::new("health");
    let app = server(&dir, 1);
    let h = get(&app, "/api/health").await;
    assert_eq!(h["status"], "ok");
    assert_eq!(h["options"]["scenarios"].as_array().unwrap().len(), 6);
    assert_eq!(h["options"]["simulation_defaults"]["server_multiplier"], 1);
    assert_eq!(h["options"]["simulation_limits"]["bag_count"], json!([1000, 1000000]));
    let backend = |id: &str| h["backends"].as_array().unwrap().iter().find(|b| b["id"] == id).unwrap().clone();
    assert_eq!(backend("scalar")["available"], true);
    assert_eq!(backend("mpi")["available"], false);
    assert!(backend("mpi")["reason"].is_string());
    let workloads = h["options"]["parallel_workloads"].as_array().unwrap();
    assert_eq!(workloads.len(), 3);
    assert_eq!(workloads[0]["backends"], json!(["sequential", "rayon"]));
    assert!(workloads[1]["backends"].as_array().unwrap().iter().all(|id| backend(id.as_str().unwrap())["available"] == true));
    assert_eq!(h["options"]["sweep_defaults"]["scenarios"].as_array().unwrap().len(), 6);
    assert!(h["options"]["simulation_defaults"]["classify_backend"].is_string());
}

#[tokio::test]
async fn unavailable_backends_give_a_reason_and_are_refused() {
    let dir = TempDir::new("unavailable");
    let app = server(&dir, 1);
    let h = get(&app, "/api/health").await;
    for b in h["backends"].as_array().unwrap().iter().filter(|b| b["available"] == false) {
        let (id, reason) = (b["id"].as_str().unwrap(), b["reason"].as_str().unwrap_or(""));
        assert!(!reason.is_empty(), "{id} has no reason");
        println!("{id}: {reason}");
        let bench = json!({ "backends": [id] }).to_string();
        expect_error(&app, "POST", "/api/benchmarks", Some(&bench), StatusCode::BAD_REQUEST, "backend_unavailable").await;
        let parallel = json!({ "backend": id }).to_string();
        expect_error(&app, "POST", "/api/parallel-runs", Some(&parallel), StatusCode::BAD_REQUEST, "backend_unavailable").await;
        let run = json!({ "classify_backend": id }).to_string();
        expect_error(&app, "POST", "/api/simulations", Some(&run), StatusCode::BAD_REQUEST, "backend_unavailable").await;
    }
}

#[tokio::test]
async fn legacy_endpoints_are_gone() {
    let dir = TempDir::new("legacy");
    let app = server(&dir, 1);
    for uri in ["/api/info", "/api/run", "/api/run?scenario=Normal"] {
        expect_error(&app, "GET", uri, None, StatusCode::NOT_FOUND, "not_found").await;
    }
}

fn float(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("not a number: {v}"))
}

#[tokio::test]
async fn every_run_reports_a_measured_pipeline() {
    let dir = TempDir::new("pipeline");
    let app = server(&dir, 4);
    let mut checksums = Vec::new();
    // OpenMP is optional; ILP stands in where it was not built
    let health = get(&app, "/api/health").await;
    let openmp = health["backends"].as_array().unwrap().iter().any(|b| b["id"] == "openmp" && b["available"] == true);
    let middle = if openmp { "openmp" } else { "ilp" };
    for (threads, backend) in [(1, "scalar"), (3, middle), (2, "rayon-ilp")] {
        let id = submit(&app, "/api/simulations", json!({ "bag_count": 20000, "scenario": "PeakSurge", "threads": threads, "classify_backend": backend })).await;
        let r = wait_done(&app, &format!("/api/simulations/{id}")).await;
        checksums.push(r["engine_checksum"].clone());
        let p = &r["pipeline"];
        let phases = p["phases"].as_array().unwrap();
        let ids: Vec<&str> = phases.iter().map(|x| x["id"].as_str().unwrap()).collect();
        assert_eq!(ids, ["generate", "classify", "simulate", "aggregate"]);
        for x in phases {
            assert!(float(&x["time_ms"]) > 0.0, "{x}");
            if x["id"] == "simulate" {
                assert_eq!(x["has_parallel_implementation"], false);
                assert!(x["baseline"].is_null() && x["speedup"].is_null());
            } else {
                assert_eq!(x["identical_to_baseline"], true, "{x}");
                let ratio = float(&x["baseline"]["time_ms"]) / float(&x["time_ms"]);
                assert!((float(&x["speedup"]) - ratio).abs() < 1e-9);
            }
        }
        assert_eq!(phases[0]["threads"], threads);
        assert_eq!(phases[1]["backend"], backend);
        assert_eq!(phases[3]["verified_against_engine"], true);
        // PeakSurge adds bags after generation
        assert!(int(&phases[2]["bags"]) > int(&phases[0]["bags"]));
        let output = &phases[1]["output"];
        assert_eq!(["on_track", "at_risk", "critical"].iter().map(|k| int(&output[*k])).sum::<u64>(), int(&phases[1]["bags"]));

        let other = float(&p["other_sequential"]["time_ms"]);
        let total = |key: &str| {
            other + phases.iter().map(|x| float(if key == "baseline" && !x["baseline"].is_null() { &x["baseline"]["time_ms"] } else { &x["time_ms"] })).sum::<f64>()
        };
        assert!((float(&p["full"]["baseline_ms"]) - total("baseline")).abs() < 1e-6);
        assert!((float(&p["full"]["parallel_ms"]) - total("parallel")).abs() < 1e-6);
        let a = &p["amdahl"];
        assert!(float(&a["parallelisable_fraction"]) > 0.0 && float(&a["parallelisable_fraction"]) < 1.0);
        assert!(float(&a["max_speedup"]) >= float(&p["full"]["speedup"]), "{a}");
        let metrics = get(&app, &format!("/api/simulations/{id}/metrics")).await;
        assert_eq!(&metrics["pipeline"], p);
        assert!(metrics["nodes"][0]["max_wait_ms"].is_u64());
    }
    assert!(checksums.windows(2).all(|w| w[0] == w[1]), "threads and backend must not change the result: {checksums:?}");
    for body in [r#"{"threads": 0}"#, r#"{"threads": 65}"#, r#"{"classify_backend": "quantum"}"#] {
        expect_error(&app, "POST", "/api/simulations", Some(body), StatusCode::BAD_REQUEST, "invalid_request").await;
    }
    expect_error(&app, "POST", "/api/simulations", Some(r#"{"classify_backend": "mpi"}"#), StatusCode::BAD_REQUEST, "backend_unavailable").await;
}

/// Every task lies inside the job, and one worker never runs two tasks at once.
fn check_tasks(run: &Value, threads: u64) -> u64 {
    let wall = float(&run["wall_ms"]);
    let tasks = run["tasks"].as_array().unwrap();
    let mut by_worker: std::collections::BTreeMap<u64, Vec<(f64, f64)>> = Default::default();
    for (i, t) in tasks.iter().enumerate() {
        assert_eq!(int(&t["id"]), i as u64);
        let (a, b) = (float(&t["start_ms"]), float(&t["end_ms"]));
        assert!(0.0 <= a && a <= b && b <= wall, "{t} outside a job of {wall} ms");
        assert!(int(&t["worker"]) < threads, "{t}");
        by_worker.entry(int(&t["worker"])).or_default().push((a, b));
    }
    for spans in by_worker.values_mut() {
        spans.sort_by(|x, y| x.partial_cmp(y).unwrap());
        assert!(spans.windows(2).all(|w| w[0].1 <= w[1].0), "one worker overlaps itself: {spans:?}");
    }
    for s in run["stages"].as_array().unwrap() {
        assert!(float(&s["start_ms"]) <= float(&s["end_ms"]) && float(&s["end_ms"]) <= wall);
    }
    tasks.iter().map(|t| int(&t["size"])).sum()
}

#[tokio::test]
async fn parallel_runs_return_task_records_and_match_sequential() {
    let dir = TempDir::new("parallel");
    let app = server(&dir, 1);
    let h = get(&app, "/api/health").await;
    for w in h["options"]["parallel_workloads"].as_array().unwrap() {
        let workload = w["id"].as_str().unwrap();
        for backend in w["backends"].as_array().unwrap() {
            let backend = backend.as_str().unwrap();
            let tag = format!("{workload}/{backend}");
            let id = submit(&app, "/api/parallel-runs", json!({ "workload": workload, "backend": backend, "threads": 3, "bag_count": 100000, "repetitions": 2 })).await;
            let base = format!("/api/parallel-runs/{id}");
            wait_done(&app, &base).await;
            let m = get(&app, &format!("{base}/metrics")).await;
            assert_eq!(m["matches_sequential"], true, "{tag}");
            assert_eq!(m["result_checksum"], m["sequential_checksum"], "{tag}");
            let bags = int(&m["bags"]);
            let (seq, sel) = (&m["sequential"], &m["selected"]);
            assert_eq!(check_tasks(seq, 1), bags, "{tag} sequential");
            assert_eq!(sel["samples_ms"].as_array().unwrap().len(), 2);
            let gpu = backend == "metal" || backend.starts_with("cuda");
            let threaded = backend == "openmp" || backend.starts_with("rayon");
            if gpu {
                assert!(sel["tasks"].as_array().unwrap().is_empty() && m["threads"].is_null(), "{tag}");
                for k in ["copy_in_ms", "kernel_ms", "copy_out_ms"] {
                    assert!(float(&m["gpu"][k]) >= 0.0, "{tag} {k}");
                }
            } else {
                assert!(m["gpu"].is_null());
                assert_eq!(m["threads"], if threaded { 3 } else { 1 }, "{tag}");
                let covered = check_tasks(sel, int(&m["threads"]));
                // the parallel generator also reports the surplus flights it dropped
                assert!(if workload == "generate" { covered >= bags } else { covered == bags }, "{tag}: {covered} of {bags}");
                assert!(sel["tasks"].as_array().unwrap().len() > 1, "{tag}");
            }
            let merges = (workload == "aggregate" && backend == "rayon") || (workload == "classify" && threaded) || (workload == "generate" && backend == "rayon");
            assert_eq!(sel["merge_ms"].is_f64(), merges, "{tag}");
            let simd = ["neon", "avx2", "rayon-neon", "rayon-avx2"].contains(&backend);
            assert_eq!(m["simd"].is_object(), simd, "{tag}");
        }
    }
    let history = get(&app, "/api/history?kind=parallel").await;
    assert_eq!(history["items"][0]["summary"]["matches_sequential"], true);
    let id = history["items"][0]["id"].as_str().unwrap();
    let (_, events) = send(&app, "GET", &format!("/api/parallel-runs/{id}/events"), None).await;
    assert!(events.starts_with("event: done"), "{events}");
    expect_error(&app, "GET", &format!("/api/sweeps/{id}"), None, StatusCode::NOT_FOUND, "not_found").await;
}

#[tokio::test]
async fn aggregation_can_use_a_retained_run() {
    let dir = TempDir::new("agg");
    let app = server(&dir, 1);
    let sim = submit(&app, "/api/simulations", json!({ "bag_count": 20000, "capacity_pct": 20 })).await;
    let run = wait_done(&app, &format!("/api/simulations/{sim}")).await;
    let id = submit(&app, "/api/parallel-runs", json!({ "workload": "aggregate", "simulation_id": sim, "threads": 2 })).await;
    wait_done(&app, &format!("/api/parallel-runs/{id}")).await;
    let m = get(&app, &format!("/api/parallel-runs/{id}/metrics")).await;
    assert_eq!(m["bags"], run["summary"]["total_bags"]);
    assert_eq!(m["output"]["delayed"], run["summary"]["delayed_bags"]);
    assert_eq!(m["output"]["loaded_on_time"], run["summary"]["loaded_on_time"]);

    let bad = [
        r#"{"workload": "sort"}"#,
        r#"{"workload": "generate", "backend": "openmp"}"#,
        r#"{"workload": "classify", "backend": "sequential"}"#,
        r#"{"workload": "classify", "simulation_id": "x"}"#,
        r#"{"workload": "aggregate", "bag_count": 1000001}"#,
        r#"{"bag_count": 999}"#,
        r#"{"threads": 0}"#,
        r#"{"repetitions": 0}"#,
        r#"{"repetitions": 11}"#,
        r#"{"chunk_size": 0}"#,
        r#"{"bag_count": 10000000, "chunk_size": 1}"#,
    ];
    for body in bad {
        expect_error(&app, "POST", "/api/parallel-runs", Some(body), StatusCode::BAD_REQUEST, "invalid_request").await;
    }
    expect_error(&app, "POST", "/api/parallel-runs", Some(r#"{"backend": "mpi"}"#), StatusCode::BAD_REQUEST, "backend_unavailable").await;
    expect_error(&app, "POST", "/api/parallel-runs", Some(r#"{"workload": "aggregate", "simulation_id": "nope"}"#), StatusCode::NOT_FOUND, "not_found").await;
}

#[tokio::test]
async fn sweep_runs_every_experiment_and_matches_one_thread() {
    let dir = TempDir::new("sweep");
    let app = server(&dir, 1);
    let (status, text) = send(&app, "POST", "/api/sweeps", Some(&json!({
        "scenarios": ["Normal", "SorterOverload", "ConveyorFailure"], "routings": ["dijkstra", "congestion"],
        "policies": ["fcfs", "edf"], "capacity_pcts": [100, 70], "bag_count": 5000, "threads": [3, 2]
    }).to_string())).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{text}");
    let accepted: Value = serde_json::from_str(&text).unwrap();
    assert_eq!(accepted["experiment_count"], 24);
    let base = format!("/api/sweeps/{}", accepted["id"].as_str().unwrap());
    let (_, events) = send(&app, "GET", &format!("{base}/events"), None).await;
    assert!(events.contains("event: done"), "{events}");
    let status = wait_done(&app, &base).await;
    assert_eq!((int(&status["config"]["bag_count"]), &status["config"]["threads"]), (5000, &json!([2, 3])));

    let m = get(&app, &format!("{base}/metrics")).await;
    let experiments = m["experiments"].as_array().unwrap();
    assert_eq!(experiments.len(), 24);
    assert_eq!(m["consistency"], json!({ "checked": true, "compared_runs": 48, "all_identical": true }));
    let passes = m["passes"].as_array().unwrap();
    assert_eq!(passes.iter().map(|p| int(&p["threads"])).collect::<Vec<_>>(), [1, 2, 3]);
    assert_eq!((float(&passes[0]["speedup"]), float(&passes[0]["efficiency_pct"])), (1.0, 100.0));
    for p in passes {
        let threads = int(&p["threads"]);
        assert_eq!((int(&p["completed"]), int(&p["failed"]), int(&p["running"])), (24, 0, 0));
        let wall = float(&p["wall_ms"]);
        assert!((float(&p["speedup"]) - float(&passes[0]["wall_ms"]) / wall).abs() < 1e-9);
        assert!((float(&p["efficiency_pct"]) - 100.0 * float(&p["speedup"]) / threads as f64).abs() < 1e-9);
        let workers = p["workers"].as_array().unwrap();
        assert_eq!(workers.len() as u64, threads);
        assert_eq!(workers.iter().map(|w| int(&w["experiments"])).sum::<u64>(), 24);
        let runs = p["runs"].as_array().unwrap();
        let mut spans: Vec<(u64, f64, f64)> = runs.iter().map(|r| (int(&r["worker"]), float(&r["start_ms"]), float(&r["end_ms"]))).collect();
        assert!(spans.iter().all(|s| s.0 < threads && 0.0 <= s.1 && s.1 <= s.2 && s.2 <= wall));
        spans.sort_by(|x, y| x.partial_cmp(y).unwrap());
        assert!(spans.windows(2).all(|w| w[0].0 != w[1].0 || w[0].2 <= w[1].1), "one worker ran two experiments at once");
        for (r, e) in runs.iter().zip(experiments) {
            assert_eq!(r["engine_checksum"], e["result"]["engine_checksum"]);
        }
    }

    // a sweep experiment equals the same config submitted as a simulation
    let e = experiments.iter().find(|e| e["scenario"] == "SorterOverload" && e["routing"] == "congestion" && e["policy"] == "edf" && e["capacity_pct"] == 70).unwrap();
    let sim = submit(&app, "/api/simulations", json!({ "scenario": "SorterOverload", "routing": "congestion", "policy": "edf", "capacity_pct": 70, "bag_count": 5000 })).await;
    let sim = wait_done(&app, &format!("/api/simulations/{sim}")).await;
    assert_eq!(sim["engine_checksum"], e["result"]["engine_checksum"]);
    assert_eq!(sim["dataset"]["checksum"], m["dataset"]["checksum"]);

    // one thread only: nothing to compare, and the API says so
    let id = submit(&app, "/api/sweeps", json!({ "scenarios": ["Normal"], "bag_count": 1000, "threads": [1] })).await;
    wait_done(&app, &format!("/api/sweeps/{id}")).await;
    let one = get(&app, &format!("/api/sweeps/{id}/metrics")).await;
    assert_eq!(one["passes"].as_array().unwrap().len(), 1);
    assert_eq!(one["consistency"], json!({ "checked": false, "compared_runs": 0, "all_identical": null }));

    let hist = get(&app, "/api/history?kind=sweep").await;
    assert_eq!(hist["items"].as_array().unwrap().len(), 2);
    assert_eq!(hist["items"][1]["summary"]["experiment_count"], 24);

    let bad = [
        r#"{"scenarios": []}"#,
        r#"{"scenarios": ["Blizzard"]}"#,
        r#"{"routings": ["random"]}"#,
        r#"{"policies": []}"#,
        r#"{"capacity_pcts": []}"#,
        r#"{"capacity_pcts": [19]}"#,
        r#"{"bag_count": 999}"#,
        r#"{"bag_count": 500001}"#,
        r#"{"threads": [0]}"#,
        r#"{"threads": [1,2,3,4,5,6,7,8,9]}"#,
        r#"{"capacity_pcts": [100,90,80,70,60]}"#,
        r#"{"bag_count": 500000, "capacity_pcts": [100,90,80,70], "threads": [2,4,8]}"#,
        r#"{"backend": "rayon"}"#,
    ];
    for body in bad {
        expect_error(&app, "POST", "/api/sweeps", Some(body), StatusCode::BAD_REQUEST, "invalid_request").await;
    }
}

#[tokio::test]
async fn rejects_bad_input() {
    let dir = TempDir::new("invalid");
    let app = server(&dir, 1);
    let bad = [
        r#"{"bag_count": 999}"#,
        r#"{"bag_count": 1000001}"#,
        r#"{"bag_count": -5}"#,
        r#"{"capacity_pct": 19}"#,
        r#"{"capacity_pct": 301}"#,
        r#"{"capacity_pct": "70"}"#,
        r#"{"server_multiplier": 0}"#,
        r#"{"server_multiplier": 21}"#,
        r#"{"server_multiplier": 1.5}"#,
        r#"{"scenario": "Blizzard"}"#,
        r#"{"routing": "random"}"#,
        r#"{"policy": "lifo"}"#,
        r#"{"pct": 70}"#,
        r#"not json"#,
    ];
    for body in bad {
        expect_error(&app, "POST", "/api/simulations", Some(body), StatusCode::BAD_REQUEST, "invalid_request").await;
    }
    let bad = [
        r#"{"backends": []}"#,
        r#"{"backends": ["quantum"]}"#,
        r#"{"backends": ["scalar"], "bag_count": 10000001}"#,
        r#"{"backends": ["scalar"], "repetitions": 0}"#,
        r#"{"backends": ["scalar"], "warmup": 11}"#,
        r#"{"backends": ["rayon-ilp"], "threads": [0]}"#,
    ];
    for body in bad {
        expect_error(&app, "POST", "/api/benchmarks", Some(body), StatusCode::BAD_REQUEST, "invalid_request").await;
    }
    expect_error(&app, "POST", "/api/benchmarks", Some(r#"{"backends": ["mpi"]}"#), StatusCode::BAD_REQUEST, "backend_unavailable").await;
    for uri in ["/api/simulations/nope", "/api/simulations/nope/metrics", "/api/simulations/nope/network", "/api/simulations/nope/events", "/api/benchmarks/nope", "/api/nothing"] {
        expect_error(&app, "GET", uri, None, StatusCode::NOT_FOUND, "not_found").await;
    }
    expect_error(&app, "GET", "/api/history?kind=other", None, StatusCode::BAD_REQUEST, "invalid_request").await;
    assert_eq!(get(&app, "/api/history").await["items"], json!([]), "rejected requests must not create jobs");
}

#[tokio::test]
async fn simulation_views_agree_with_each_other() {
    let dir = TempDir::new("views");
    let app = server(&dir, 1);
    let id = submit(&app, "/api/simulations", json!({ "bag_count": 20000, "capacity_pct": 20, "scenario": "ConveyorFailure" })).await;
    let base = format!("/api/simulations/{id}");

    // the event stream ends by itself once the job is done
    let (status, events) = send(&app, "GET", &format!("{base}/events"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(events.contains("event: done"), "{events}");

    let run = wait_done(&app, &base).await;
    let summary = &run["summary"];
    let total = int(&summary["total_bags"]);
    assert!(total >= 20_000);
    assert_eq!(int(&summary["loaded_on_time"]) + int(&summary["delayed_bags"]), total);
    assert_eq!(run["retained"], true);

    let metrics = get(&app, &format!("{base}/metrics")).await;
    assert_eq!(metrics["nodes"].as_array().unwrap().len(), 10);
    for node in metrics["nodes"].as_array().unwrap() {
        let waits: u64 = node["wait_histogram"].as_array().unwrap().iter().map(int).sum();
        assert_eq!(waits, int(&node["arrivals"]));
    }

    let net = get(&app, &format!("{base}/network")).await;
    assert_eq!(net["edges"].as_array().unwrap().len(), 18);
    let from_checkin: u64 = net["edges"].as_array().unwrap().iter().filter(|e| e["source"] == 0).map(|e| int(&e["traffic_total"])).sum();
    assert_eq!(from_checkin, total);
    let failed: Vec<&Value> = net["edges"].as_array().unwrap().iter().filter(|e| !e["outages"].as_array().unwrap().is_empty()).collect();
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0]["id"], "e2-4");
    assert!(failed[0]["capacity"].is_null());
    let times = net["series"]["times_ms"].as_array().unwrap().len();
    assert_eq!(net["series"]["nodes"][0]["queue"].as_array().unwrap().len(), times);
    let during = get(&app, &format!("{base}/network?at_ms={}", 18 * 3600 * 1000)).await;
    assert_eq!(during["edges"].as_array().unwrap().iter().filter(|e| e["available"] == false).count(), 1);
    assert!(during["nodes"][0]["queue_length"].is_u64());
    assert!(net["nodes"][0]["queue_length"].is_null());

    // final state: everything is loaded on time or delayed
    let page = get(&app, &format!("{base}/baggage?page_size=25&page=2")).await;
    assert_eq!(int(&page["total"]), total);
    assert_eq!(page["items"].as_array().unwrap().len(), 25);
    assert_eq!(page["items"][0]["id"], 25);
    assert_eq!(page["counts"]["delayed"], summary["delayed_bags"]);
    let delayed = get(&app, &format!("{base}/baggage?status=DELAYED&sort=deadline&order=desc")).await;
    assert_eq!(delayed["total"], summary["delayed_bags"]);
    let d: Vec<u64> = delayed["items"].as_array().unwrap().iter().map(|b| int(&b["deadline_ms"])).collect();
    assert!(d.windows(2).all(|w| w[0] >= w[1]));
    assert_eq!(get(&app, &format!("{base}/baggage?status=MISROUTED")).await["total"], 0);

    let one = get(&app, &format!("{base}/baggage?q=1234")).await;
    assert_eq!((int(&one["total"]), int(&one["items"][0]["id"])), (1, 1234));
    let flight = int(&one["items"][0]["flight_id"]);
    let same_flight = get(&app, &format!("{base}/baggage?flight={flight}&page_size=500")).await;
    assert!(same_flight["items"].as_array().unwrap().iter().all(|b| int(&b["flight_id"]) == flight));
    let via = get(&app, &format!("{base}/baggage?node=4")).await;
    assert_eq!(via["total"], metrics["nodes"][4]["arrivals"]);

    // playback: counts partition the bags, and the node filter means "there now"
    let mid = get(&app, &format!("{base}/baggage?at_ms={}", 18 * 3600 * 1000)).await;
    let c = &mid["counts"];
    let parts: u64 = ["not_arrived", "in_system", "loaded_on_time", "delayed"].iter().map(|k| int(&c[*k])).sum();
    assert_eq!(parts, total);
    assert!(int(&c["in_system"]) > 0 && int(&c["not_arrived"]) > 0);
    let waiting_at_1 = get(&app, &format!("{base}/baggage?node=1&at_ms={}&page_size=500", 18 * 3600 * 1000)).await;
    assert!(waiting_at_1["items"].as_array().unwrap().iter().all(|b| b["current_node"] == 1));

    let bag = get(&app, &format!("{base}/baggage/1234")).await;
    let route = bag["route"].as_array().unwrap();
    assert_eq!(route.len(), 5, "check-in, identification, screening, sorter, loading");
    assert!(route.iter().all(|h| int(&h["arrive_ms"]) <= int(&h["start_ms"]) && int(&h["start_ms"]) <= int(&h["end_ms"])));
    let states: Vec<&str> = bag["timeline"].as_array().unwrap().iter().map(|t| t["state"].as_str().unwrap()).filter(|s| *s != "HELD_FOR_INSPECTION").collect();
    assert_eq!(states[..6], ["CHECKED_IN", "IDENTIFIED", "SCREENING", "CLEARED", "IN_TRANSIT", "SORTED"]);
    assert_eq!(states[7], bag["status"].as_str().unwrap());
    let travelling = get(&app, &format!("{base}/baggage/1234?at_ms={}", int(&route[0]["end_ms"]))).await;
    assert_eq!((travelling["status"].as_str(), travelling["next_node"].as_u64()), (Some("IN_TRANSIT"), Some(1)));
    let before = get(&app, &format!("{base}/baggage/1234?at_ms=0")).await;
    assert!(before["status"].is_null());

    for uri in ["baggage?page=0", "baggage?page_size=501", "baggage?status=LOST", "baggage?node=10", "baggage?q=abc", "baggage?sort=weight", "baggage?color=red", "network?at_ms=-1", "baggage/abc"] {
        expect_error(&app, "GET", &format!("{base}/{uri}"), None, StatusCode::BAD_REQUEST, "invalid_request").await;
    }
    expect_error(&app, "GET", &format!("{base}/baggage/99999999"), None, StatusCode::NOT_FOUND, "not_found").await;
    // a simulation id is not a benchmark id
    expect_error(&app, "GET", &format!("/api/benchmarks/{id}"), None, StatusCode::NOT_FOUND, "not_found").await;
}

#[tokio::test]
async fn redirected_bags_keep_their_own_flight() {
    let dir = TempDir::new("redirect");
    let app = server(&dir, 2);
    let a = submit(&app, "/api/simulations", json!({ "bag_count": 20000 })).await;
    let b = submit(&app, "/api/simulations", json!({ "bag_count": 20000, "scenario": "SorterOverload" })).await;
    wait_done(&app, &format!("/api/simulations/{b}")).await;
    let at = "page_size=500&page=30"; // an evening page, inside the 17:00-19:00 window
    let normal = get(&app, &format!("/api/simulations/{a}/baggage?{at}")).await;
    let overload = get(&app, &format!("/api/simulations/{b}/baggage?{at}")).await;
    let items = overload["items"].as_array().unwrap();
    assert!(items.iter().any(|x| x["redirected"] == true));
    for (x, y) in normal["items"].as_array().unwrap().iter().zip(items) {
        assert_eq!((&x["flight_id"], &x["departure_ms"], &x["deadline_ms"]), (&y["flight_id"], &y["departure_ms"], &y["deadline_ms"]));
        if y["redirected"] == true {
            assert_eq!(y["loading_node"], 7);
        }
    }
}

#[tokio::test]
async fn keeps_recent_runs_and_persists_history() {
    let dir = TempDir::new("history");
    let app = server(&dir, 2);
    let mut ids = Vec::new();
    for pct in [100, 90, 80] {
        ids.push(submit(&app, "/api/simulations", json!({ "bag_count": 5000, "capacity_pct": pct })).await);
    }
    wait_done(&app, &format!("/api/simulations/{}", ids[2])).await;
    // one worker, first in first out: the earlier jobs finished before the last one started
    let mut previous_end = 0;
    for id in &ids {
        let r = get(&app, &format!("/api/simulations/{id}")).await;
        assert_eq!(r["status"], "done");
        assert!(int(&r["started_at_ms"]) >= previous_end, "jobs overlapped");
        previous_end = int(&r["finished_at_ms"]);
    }

    let old = format!("/api/simulations/{}", ids[0]);
    expect_error(&app, "GET", &format!("{old}/network"), None, StatusCode::GONE, "run_not_retained").await;
    expect_error(&app, "GET", &format!("{old}/baggage"), None, StatusCode::GONE, "run_not_retained").await;
    assert_eq!(get(&app, &format!("{old}/metrics")).await["retained"], false);
    get(&app, &format!("/api/simulations/{}/network", ids[1])).await;

    let before = get(&app, "/api/history").await;
    let order: Vec<&str> = before["items"].as_array().unwrap().iter().map(|r| r["id"].as_str().unwrap()).collect();
    assert_eq!(order, [&ids[2], &ids[1], &ids[0]]);

    // a restarted server reads the saved records, without the in-memory run data
    let restarted = server(&dir, 2);
    let after = get(&restarted, "/api/history?kind=simulation").await;
    assert_eq!(after["items"].as_array().unwrap().len(), 3);
    for (x, y) in before["items"].as_array().unwrap().iter().zip(after["items"].as_array().unwrap()) {
        assert_eq!((&x["id"], &x["config"], &x["config_hash"], &x["summary"]), (&y["id"], &y["config"], &y["config_hash"], &y["summary"]));
        assert_eq!(y["retained"], false);
    }
    assert_eq!(get(&restarted, "/api/history?kind=benchmark").await["items"], json!([]));
}

#[tokio::test]
async fn full_queue_is_refused() {
    let dir = TempDir::new("queue");
    let app = server(&dir, 1);
    let body = json!({ "bag_count": 200000 }).to_string();
    let mut accepted = Vec::new();
    let mut refused = 0;
    for _ in 0..12 {
        let (status, text) = send(&app, "POST", "/api/simulations", Some(&body)).await;
        match status {
            StatusCode::ACCEPTED => accepted.push(serde_json::from_str::<Value>(&text).unwrap()["id"].as_str().unwrap().to_string()),
            StatusCode::TOO_MANY_REQUESTS => refused += 1,
            other => panic!("{other}: {text}"),
        }
    }
    assert!((8..=9).contains(&accepted.len()), "{} accepted", accepted.len());
    assert_eq!(accepted.len() + refused, 12);
    let h = get(&app, "/api/health").await;
    assert!(int(&h["queue"]["queued"]) <= 8);
    wait_done(&app, &format!("/api/simulations/{}", accepted.last().unwrap())).await;
}

#[tokio::test]
async fn benchmark_runs_real_kernels() {
    let dir = TempDir::new("bench");
    let app = server(&dir, 1);
    let h = get(&app, "/api/health").await;
    let available: Vec<String> = h["backends"].as_array().unwrap().iter().filter(|b| b["available"] == true).map(|b| b["id"].as_str().unwrap().to_string()).collect();
    let id = submit(&app, "/api/benchmarks", json!({ "bag_count": 100000, "backends": available, "threads": [1, 2], "repetitions": 3, "warmup": 1 })).await;
    let base = format!("/api/benchmarks/{id}");
    wait_done(&app, &base).await;
    let m = get(&app, &format!("{base}/metrics")).await;
    assert_eq!(m["static"], false);
    assert!(int(&m["workload_size"]) >= 100_000);
    let rows = m["results"].as_array().unwrap();
    assert_eq!(rows[0]["backend"], "scalar");
    assert_eq!(rows[0]["speedup"], 1.0);
    for r in rows {
        let name = r["backend"].as_str().unwrap();
        assert_eq!(r["output_identical_to_scalar"], true, "{name}");
        assert_eq!(r["samples_ms"].as_array().unwrap().len(), 3, "warm-up is not a sample");
        let t = &r["time_ms"];
        let f = |k: &str| t[k].as_f64().unwrap();
        assert!(f("min") > 0.0 && f("min") <= f("median") && f("median") <= f("max") && f("std") >= 0.0);
        assert!(r["memory_usage_bytes"].is_null());
        let threaded = name.starts_with("rayon") || name == "openmp";
        assert_eq!(r["parallel_efficiency_pct"].is_f64(), threaded, "{name}");
        let gpu = name == "metal" || name.starts_with("cuda");
        assert_eq!(r["gpu"].is_object(), gpu, "{name}");
        if gpu {
            for k in ["copy_in_ms", "kernel_ms", "copy_out_ms", "launch_overhead_ms"] {
                assert!(r["gpu"][k]["median"].as_f64().unwrap() >= 0.0, "{name} {k}");
            }
            assert!(r["threads"].is_null());
        }
    }
    assert_eq!(rows.iter().filter(|r| r["backend"] == "rayon-ilp").count(), 2);
    let hist = get(&app, "/api/history?kind=benchmark").await;
    assert_eq!(hist["items"][0]["summary"]["results"].as_array().unwrap().len(), rows.len());
    let (_, events) = send(&app, "GET", &format!("{base}/events"), None).await;
    assert!(events.starts_with("event: done"), "{events}");
}

#[tokio::test]
async fn static_results_are_flagged() {
    let dir = TempDir::new("static");
    let app = server(&dir, 1);
    let v = get(&app, "/api/static-results").await;
    assert_eq!(v["static"], true);
    let rows = v["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 53);
    assert!(rows.iter().all(|r| r["static"] == true && !r["machine"].as_str().unwrap().is_empty()));
}

/// The regression baseline (docs/AUDIT.md 5.5) through the HTTP API.
#[tokio::test]
async fn three_fixed_configs_keep_their_results() {
    let dir = TempDir::new("baseline");
    let app = server(&dir, 1);
    let cases = [
        ("Normal", "dijkstra", 100, 9_245, "3.697", "61aa19cce7723683"),
        ("SorterOverload", "ecmp", 100, 28_606, "11.438", "144494908f029748"),
        ("Normal", "congestion", 70, 134_427, "53.752", "29e8786b1e8e3fae"),
    ];
    for (scenario, routing, pct, delayed, rate, checksum) in cases {
        let id = submit(&app, "/api/simulations", json!({ "scenario": scenario, "routing": routing, "policy": "fcfs", "capacity_pct": pct, "bag_count": 250000 })).await;
        let r = wait_done(&app, &format!("/api/simulations/{id}")).await;
        assert_eq!(r["config"]["server_multiplier"], 1);
        assert_eq!(r["dataset"]["checksum"], "168e0a37b06224f9");
        assert_eq!(int(&r["dataset"]["bags_simulated"]), 250_086);
        assert_eq!(r["engine_checksum"], checksum, "{scenario}/{routing}/{pct}");
        assert_eq!(int(&r["summary"]["delayed_bags"]), delayed);
        assert_eq!(format!("{:.3}", r["summary"]["delayed_pct"].as_f64().unwrap()), rate);
        let page = get(&app, &format!("/api/simulations/{id}/baggage?status=DELAYED&page_size=1")).await;
        assert_eq!(int(&page["total"]), delayed, "bag views must agree with the engine");
        println!("{scenario}/{routing}/{pct}%: delayed {rate}% checksum {checksum}");
    }
    // and inside a parallel sweep
    let id = submit(&app, "/api/sweeps", json!({
        "scenarios": ["Normal", "SorterOverload"], "routings": ["dijkstra", "ecmp", "congestion"], "policies": ["fcfs"],
        "capacity_pcts": [100, 70], "bag_count": 250000, "threads": [4]
    })).await;
    wait_done(&app, &format!("/api/sweeps/{id}")).await;
    let m = get(&app, &format!("/api/sweeps/{id}/metrics")).await;
    assert_eq!(m["consistency"]["all_identical"], true);
    for (scenario, routing, pct, delayed, _, checksum) in cases {
        let e = m["experiments"].as_array().unwrap().iter()
            .find(|e| e["scenario"] == scenario && e["routing"] == routing && e["capacity_pct"] == pct)
            .unwrap();
        assert_eq!(e["result"]["engine_checksum"], checksum, "sweep {scenario}/{routing}/{pct}");
        assert_eq!(int(&e["result"]["delayed_bags"]), delayed);
    }
}

/// Operational parallel mode through the HTTP API: same pinned results, precompute phase
/// and task telemetry reported; dynamic routing keeps its routes in the loop.
#[tokio::test]
async fn operational_parallel_keeps_results_and_reports_tasks() {
    let dir = TempDir::new("operational");
    let app = server(&dir, 1);
    let cases = [
        ("Normal", "dijkstra", 100, 9_245, "61aa19cce7723683", true),
        ("Normal", "congestion", 70, 134_427, "29e8786b1e8e3fae", false),
    ];
    for (scenario, routing, pct, delayed, checksum, routes) in cases {
        let id = submit(&app, "/api/simulations", json!({
            "scenario": scenario, "routing": routing, "policy": "fcfs", "capacity_pct": pct, "bag_count": 250000,
            "operational_parallel": true, "workers": 4
        })).await;
        let r = wait_done(&app, &format!("/api/simulations/{id}")).await;
        assert_eq!(r["engine_checksum"], checksum, "{scenario}/{routing}");
        assert_eq!(int(&r["summary"]["delayed_bags"]), delayed);
        let m = get(&app, &format!("/api/simulations/{id}/metrics")).await;
        let op = &m["operational"];
        assert_eq!(op["enabled"], true);
        assert_eq!(op["workers"], 4);
        assert_eq!(op["routes_precomputed"], routes);
        assert_eq!(op["precompute"]["identical_to_sequential"], true);
        let tasks = op["tasks"].as_array().unwrap();
        assert_eq!(tasks.len(), if routes { 3 } else { 2 } * 4 * 4);
        assert!(tasks.iter().all(|t| int(&t["worker"]) < 4 && t["end_ms"].as_f64() >= t["start_ms"].as_f64()));
        assert!(m["pipeline"]["phases"].as_array().unwrap().iter().any(|p| p["id"] == "precompute"));
    }
    let bad = json!({ "operational_parallel": true, "workers": 0, "bag_count": 1000 });
    let (status, _) = send(&app, "POST", "/api/simulations", Some(&bad.to_string())).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
