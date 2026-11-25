use axum::{extract::{Query, State}, http::StatusCode, routing::get, Json, Router};
use bagflow_core::engine2::{run_with, Policy, Strategy};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::airport_network;
use bagflow_core::scenarios::{build, ALL};
use bagflow_core::soa::BagSoA;
use bagflow_core::types::{Edge, Node, Scenario};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

struct AppState {
    bags: BagSoA,
    nodes: Vec<Node>,
    edges: Vec<Edge>,
}

fn parse_scenario(s: &str) -> Option<Scenario> {
    ALL.iter().copied().find(|x| format!("{:?}", x) == s)
}

async fn info(State(s): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({
        "bags": s.bags.len(),
        "scenarios": ALL.iter().map(|x| format!("{:?}", x)).collect::<Vec<_>>(),
        "routings": Strategy::ALL.iter().map(|x| x.name()).collect::<Vec<_>>(),
        "policies": Policy::ALL.iter().map(|x| x.name()).collect::<Vec<_>>(),
    }))
}

async fn run(State(s): State<Arc<AppState>>, Query(q): Query<HashMap<String, String>>) -> Result<Json<Value>, (StatusCode, String)> {
    let bad = |m: &str| (StatusCode::BAD_REQUEST, m.to_string());
    let sc = parse_scenario(q.get("scenario").map(|x| x.as_str()).unwrap_or("Normal")).ok_or_else(|| bad("unknown scenario"))?;
    let rname = q.get("routing").map(|x| x.as_str()).unwrap_or("congestion");
    let pname = q.get("policy").map(|x| x.as_str()).unwrap_or("fcfs");
    let strat = Strategy::ALL.iter().copied().find(|x| x.name() == rname).ok_or_else(|| bad("unknown routing"))?;
    let pol = Policy::ALL.iter().copied().find(|x| x.name() == pname).ok_or_else(|| bad("unknown policy"))?;
    let pct: u32 = q.get("pct").and_then(|x| x.parse().ok()).unwrap_or(100).clamp(20, 300);

    let out = tokio::task::spawn_blocking(move || {
        let mut nodes = s.nodes.clone();
        for nd in nodes.iter_mut() {
            nd.servers = ((nd.servers as u32 * pct / 100).max(1)) as u16;
        }
        let setup = build(sc, &s.bags, &nodes, &s.edges, 42);
        let t = std::time::Instant::now();
        let r = run_with(&setup.bags, &setup.nodes, &setup.edges, strat, pol, 42, &setup.outages);
        let secs = t.elapsed().as_secs_f64();
        let node_rows: Vec<Value> = setup.nodes.iter().enumerate().map(|(i, nd)| json!({
            "id": i, "kind": format!("{:?}", nd.kind), "servers": nd.servers,
            "arrivals": r.arrivals[i], "avg_wait_s": r.avg_wait_s[i],
            "max_queue": r.max_queue[i], "utilisation": r.util[i],
        })).collect();
        json!({
            "scenario": format!("{:?}", sc), "routing": strat.name(), "policy": pol.name(), "pct": pct,
            "bags": r.n, "loaded": r.loaded, "delayed": r.delayed,
            "delayed_pct": 100.0 * r.delayed as f64 / r.n as f64,
            "tight_delayed_pct": 100.0 * r.tight_delayed as f64 / r.tight_total.max(1) as f64,
            "mean_s": r.mean_sojourn_s, "p95_s": r.p95_sojourn_s,
            "max_queue": r.max_queue.iter().max().copied().unwrap_or(0),
            "sim_seconds": secs, "nodes": node_rows,
        })
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(out))
}

#[tokio::main]
async fn main() {
    let n: usize = std::env::var("BAGS").ok().and_then(|v| v.parse().ok()).unwrap_or(250_000);
    let threads = std::thread::available_parallelism().map(|x| x.get()).unwrap_or(1);
    println!("generating {n} bags ...");
    let (_, bags) = generate_par(&GenConfig { seed: 42, target_bags: n }, threads);
    let (nodes, edges) = airport_network(1);
    println!("{} bags ready", bags.len());
    let state = Arc::new(AppState { bags, nodes, edges });
    let app = Router::new()
        .route("/api/info", get(info))
        .route("/api/run", get(run))
        .layer(CorsLayer::permissive())
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001").await.unwrap();
    println!("API on http://127.0.0.1:3001  (try /api/info)");
    axum::serve(listener, app).await.unwrap();
}
