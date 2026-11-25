fn main() {
    println!("cargo:rustc-check-cfg=cfg(has_metal)");
    println!("cargo:rustc-check-cfg=cfg(has_cuda)");
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();

    // ---- OpenMP kernel (C++) ----
    let src = "../../kernels/cpu/openmp/risk_omp.cpp";
    println!("cargo:rerun-if-changed={src}");
    let mut b = cc::Build::new();
    b.cpp(true).file(src).opt_level(3).flag("-std=c++17");
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

    // ---- Metal kernel (macOS only) ----
    if os == "macos" {
        let m = "../../kernels/gpu/metal/risk_metal.mm";
        println!("cargo:rerun-if-changed={m}");
        cc::Build::new()
            .cpp(true)
            .file(m)
            .opt_level(3)
            .flag("-std=c++17")
            .flag("-fobjc-arc")
            .compile("bagflow_metal");
        println!("cargo:rustc-link-lib=framework=Metal");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-cfg=has_metal");
    }

    // ---- CUDA kernel (Linux with nvcc only) ----
    if os == "linux" {
        let home = std::env::var("CUDA_HOME")
            .or_else(|_| std::env::var("CUDA_PATH"))
            .unwrap_or_else(|_| "/usr/local/cuda".to_string());
        let candidates = [format!("{home}/bin/nvcc"), "nvcc".to_string()];
        let nvcc = candidates.iter().find(|c| {
            std::process::Command::new(c).arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
        });
        if let Some(nvcc) = nvcc {
            let cu = "../../kernels/gpu/cuda/risk_cuda.cu";
            println!("cargo:rerun-if-changed={cu}");
            let out_dir = std::env::var("OUT_DIR").unwrap();
            let obj = format!("{out_dir}/risk_cuda.o");
            let st = std::process::Command::new(nvcc)
                .args([
                    "-c", "-O3", "-std=c++17", "-Xcompiler", "-fPIC",
                    "-gencode=arch=compute_60,code=sm_60",   // P100
                    "-gencode=arch=compute_75,code=sm_75",   // T4
                    "-gencode=arch=compute_75,code=compute_75",
                    cu, "-o", &obj,
                ])
                .status()
                .expect("could not run nvcc");
            assert!(st.success(), "nvcc failed");
            let lib = format!("{out_dir}/libbagflow_cuda.a");
            let st = std::process::Command::new("ar").args(["crs", &lib, &obj]).status().expect("could not run ar");
            assert!(st.success(), "ar failed");
            println!("cargo:rustc-link-search=native={out_dir}");
            println!("cargo:rustc-link-lib=static=bagflow_cuda");
            println!("cargo:rustc-link-search=native={home}/lib64");
            println!("cargo:rustc-link-lib=cudart");
            println!("cargo:rustc-link-lib=stdc++");
            println!("cargo:rustc-cfg=has_cuda");
        } else {
            println!("cargo:warning=nvcc not found: CUDA backends skipped");
        }
    }
}
