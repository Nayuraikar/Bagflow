use bagflow_api::{app, Config};

#[tokio::main]
async fn main() {
    let mut cfg = Config::repo_default();
    if let Some(n) = std::env::var("BAGS").ok().and_then(|v| v.parse().ok()) {
        cfg.legacy_bag_count = n;
    }
    if let Some(dir) = std::env::var_os("BAGFLOW_DATA_DIR") {
        cfg.data_dir = dir.into();
    }
    if let Some(dir) = std::env::var_os("BAGFLOW_RESULTS_DIR") {
        cfg.results_dir = dir.into();
    }
    let router = app(cfg).expect("could not open the data folder");
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001").await.expect("port 3001 is in use");
    println!("API on http://127.0.0.1:3001  (try /api/health)");
    axum::serve(listener, router).await.expect("server error");
}
