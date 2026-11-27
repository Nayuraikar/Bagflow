use bagflow_api::{app, Config};

const DEFAULT_ADDR: &str = "127.0.0.1:3001";

#[tokio::main]
async fn main() {
    let mut cfg = Config::repo_default();
    if let Some(dir) = std::env::var_os("BAGFLOW_DATA_DIR") {
        cfg.data_dir = dir.into();
    }
    if let Some(dir) = std::env::var_os("BAGFLOW_RESULTS_DIR") {
        cfg.results_dir = dir.into();
    }
    let addr = std::env::var("BAGFLOW_API_ADDR").unwrap_or_else(|_| DEFAULT_ADDR.into());
    let data_dir = cfg.data_dir.clone();
    // creates the data folder if it does not exist
    let router = app(cfg).unwrap_or_else(|e| fail(format!("could not open the data folder {}: {e}", data_dir.display())));
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap_or_else(|e| {
        fail(format!("could not listen on {addr}: {e}. Stop whatever uses that port, or set BAGFLOW_API_ADDR (e.g. 127.0.0.1:3101)"))
    });
    let bound = listener.local_addr().map_or(addr, |a| a.to_string());
    println!("API on http://{bound}  (try /api/health)");
    if cfg!(debug_assertions) {
        println!("Debug build: timings are not representative. Use cargo run --release.");
    }
    axum::serve(listener, router).await.unwrap_or_else(|e| fail(format!("server error: {e}")));
}

fn fail(message: String) -> ! {
    eprintln!("bagflow-api: {message}");
    std::process::exit(1);
}
