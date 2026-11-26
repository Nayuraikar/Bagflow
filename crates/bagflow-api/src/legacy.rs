//! `/api/info` and `/api/run`, used by the current Scenarios tab. Remove with that tab.

use crate::error::{ApiError, ApiResult};
use crate::jobs::lock;
use crate::sim::{parse_policy, parse_routing, parse_scenario, scale_servers, SEED};
use crate::AppState;
use axum::extract::{Query, State};
use axum::Json;
use bagflow_core::engine2::{run_with, Policy, Strategy};
use bagflow_core::generator::{generate_par, GenConfig};
use bagflow_core::network::airport_network;
use bagflow_core::scenarios::{build, ALL};
use bagflow_core::soa::BagSoA;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

fn dataset(s: &AppState) -> &BagSoA {
    s.legacy_bags.get_or_init(|| {
        let threads = std::thread::available_parallelism().map(|x| x.get()).unwrap_or(1);
        generate_par(&GenConfig { seed: SEED, target_bags: s.legacy_bag_count }, threads).1
    })
}

pub async fn info(State(s): State<Arc<AppState>>) -> ApiResult<Json<Value>> {
    let bags = tokio::task::spawn_blocking(move || dataset(&s).len())
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(json!({
        "bags": bags,
        "scenarios": ALL.iter().map(|x| format!("{:?}", x)).collect::<Vec<_>>(),
        "routings": Strategy::ALL.iter().map(|x| x.name()).collect::<Vec<_>>(),
        "policies": Policy::ALL.iter().map(|x| x.name()).collect::<Vec<_>>(),
    })))
}

pub async fn run(State(s): State<Arc<AppState>>, Query(q): Query<HashMap<String, String>>) -> ApiResult<Json<Value>> {
    let get = |k: &str, d: &'static str| q.get(k).cloned().unwrap_or_else(|| d.to_string());
    let sc = parse_scenario(&get("scenario", "Normal")).ok_or_else(|| ApiError::invalid("unknown scenario"))?;
    let strat = parse_routing(&get("routing", "congestion")).ok_or_else(|| ApiError::invalid("unknown routing"))?;
    let pol = parse_policy(&get("policy", "fcfs")).ok_or_else(|| ApiError::invalid("unknown policy"))?;
    let pct: u32 = q.get("pct").and_then(|x| x.parse().ok()).unwrap_or(100).clamp(20, 300);

    let out = tokio::task::spawn_blocking(move || {
        let bags = dataset(&s);
        let (mut nodes, edges) = airport_network(1);
        scale_servers(&mut nodes, pct);
        let _one_at_a_time = lock(&s.jobs.shared.run_lock);
        let setup = build(sc, bags, &nodes, &edges, SEED);
        let t = std::time::Instant::now();
        let r = run_with(&setup.bags, &setup.nodes, &setup.edges, strat, pol, SEED, &setup.outages);
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
    .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(out))
}
