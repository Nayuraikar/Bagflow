fn main() {
    let src = "../../kernels/cpu/openmp/risk_omp.cpp";
    println!("cargo:rerun-if-changed={src}");
    let mut b = cc::Build::new();
    b.cpp(true).file(src).opt_level(3).flag("-std=c++17");
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    if os == "macos" {
        let p = "/opt/homebrew/opt/libomp";
        if std::path::Path::new(p).exists() {
            b.flag("-Xclang").flag("-fopenmp").include(format!("{p}/include"));
            println!("cargo:rustc-link-search=native={p}/lib");
            println!("cargo:rustc-link-lib=omp");
        } else {
            println!("cargo:warning=libomp not found: the OpenMP kernel will run on one thread");
        }
    } else {
        b.flag("-fopenmp");
        println!("cargo:rustc-link-lib=gomp");
    }
    b.compile("bagflow_omp");
}
