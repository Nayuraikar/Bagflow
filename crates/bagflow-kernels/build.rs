//! Builds the optional C++ backends. A backend whose toolchain or library is missing is
//! left out with a warning, and the reason is compiled in so that it can be reported at
//! run time. Only a C++ compiler is required.

use std::path::{Path, PathBuf};
use std::process::Command;

const OMP_SRC: &str = "../../kernels/cpu/openmp/risk_omp.cpp";
const METAL_SRC: &str = "../../kernels/gpu/metal/risk_metal.mm";
const CUDA_SRC: &str = "../../kernels/gpu/cuda/risk_cuda.cu";

fn main() {
    println!("cargo:rustc-check-cfg=cfg(has_openmp)");
    println!("cargo:rustc-check-cfg=cfg(has_metal)");
    println!("cargo:rustc-check-cfg=cfg(has_cuda)");
    println!("cargo:rerun-if-changed=build.rs");
    for src in [OMP_SRC, METAL_SRC, CUDA_SRC] {
        println!("cargo:rerun-if-changed={src}");
    }
    for var in ["BAGFLOW_NO_OPENMP", "BAGFLOW_NO_METAL", "BAGFLOW_NO_CUDA", "LIBOMP_PREFIX", "CUDA_HOME", "CUDA_PATH", "CXX", "CXXFLAGS"] {
        println!("cargo:rerun-if-env-changed={var}");
    }
    let os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();

    openmp(&os);

    if os == "macos" {
        if let Err(reason) = metal() {
            skip("Metal", "BAGFLOW_METAL_REASON", &reason);
        }
    } else {
        skip_quietly("BAGFLOW_METAL_REASON", "Metal is only built on macOS");
    }

    if os == "linux" {
        if let Err(reason) = cuda() {
            skip("CUDA", "BAGFLOW_CUDA_REASON", &reason);
        }
    } else {
        skip_quietly("BAGFLOW_CUDA_REASON", "CUDA is only built on Linux with nvcc");
    }
}

fn skip_quietly(var: &str, reason: &str) {
    println!("cargo:rustc-env={var}={}", reason.replace('\n', " "));
}

fn skip(backend: &str, var: &str, reason: &str) {
    println!("cargo:warning={backend} backend not built: {}", reason.replace('\n', " "));
    skip_quietly(var, reason);
}

fn disabled(var: &str) -> bool {
    std::env::var(var).is_ok_and(|v| !v.is_empty() && v != "0")
}

fn cpp_build(file: &str) -> cc::Build {
    let mut b = cc::Build::new();
    b.cpp(true).file(file).opt_level(3).flag("-std=c++17");
    b
}

/// What it takes to compile and link OpenMP code here.
struct OpenMp {
    compile: Vec<String>,
    include: Option<PathBuf>,
    lib_dir: Option<PathBuf>,
    lib: &'static str,
}

/// The kernel file is always built, since it has a one-thread form without OpenMP.
fn openmp(os: &str) {
    let found = if disabled("BAGFLOW_NO_OPENMP") {
        Err("disabled by BAGFLOW_NO_OPENMP".to_string())
    } else {
        find_openmp(os)
    };
    let mut b = cpp_build(OMP_SRC);
    match &found {
        Ok(omp) => {
            for f in &omp.compile {
                b.flag(f);
            }
            if let Some(dir) = &omp.include {
                b.include(dir);
            }
        }
        Err(_) => {
            b.flag_if_supported("-Wno-unknown-pragmas");
        }
    }
    b.compile("bagflow_omp");
    match found {
        Ok(omp) => {
            if let Some(dir) = omp.lib_dir {
                println!("cargo:rustc-link-search=native={}", dir.display());
            }
            println!("cargo:rustc-link-lib={}", omp.lib);
            println!("cargo:rustc-cfg=has_openmp");
        }
        Err(reason) => skip("OpenMP", "BAGFLOW_OPENMP_REASON", &reason),
    }
}

fn find_openmp(os: &str) -> Result<OpenMp, String> {
    let compiler = cpp_build(OMP_SRC).try_get_compiler().map_err(|e| e.to_string())?;
    if os == "macos" {
        // Apple clang has no OpenMP runtime of its own; it comes from libomp.
        let prefixes: Vec<PathBuf> = match std::env::var_os("LIBOMP_PREFIX") {
            Some(p) => vec![p.into()],
            None => vec!["/opt/homebrew/opt/libomp".into(), "/usr/local/opt/libomp".into()],
        };
        let mut failure = "libomp not found (install it with: brew install libomp)".to_string();
        for prefix in prefixes {
            let (include, lib_dir) = (prefix.join("include"), prefix.join("lib"));
            if !include.join("omp.h").exists() {
                continue;
            }
            let omp = OpenMp {
                compile: vec!["-Xclang".into(), "-fopenmp".into()],
                include: Some(include.clone()),
                lib_dir: Some(lib_dir),
                lib: "omp",
            };
            match probe_openmp(&compiler, &omp, &["-lomp".into()]) {
                Ok(()) => {
                    // so that removing libomp later runs this script again
                    println!("cargo:rerun-if-changed={}", include.join("omp.h").display());
                    return Ok(omp);
                }
                Err(e) => failure = format!("libomp in {} does not work: {e}", prefix.display()),
            }
        }
        Err(failure)
    } else {
        let clang = compiler.is_like_clang();
        let lib = if clang { "omp" } else { "gomp" };
        // clang may keep libomp in a folder that the Rust linker does not search
        let lib_dir = if clang { clang_libomp_dir(&compiler) } else { None };
        let omp = OpenMp { compile: vec!["-fopenmp".into()], include: None, lib_dir, lib };
        // Rust links with `cc`, not with the C++ compiler, so the probe has to do the same
        probe_openmp_rust_link(&compiler, &omp)
            .map_err(|e| format!("the C++ compiler cannot build OpenMP programs (lib{lib} missing?): {e}"))?;
        Ok(omp)
    }
}

/// The folder that holds clang's libomp.so, if it can be found.
fn clang_libomp_dir(compiler: &cc::Tool) -> Option<PathBuf> {
    let print = |arg: &str| {
        let out = compiler.to_command().arg(arg).output().ok()?;
        Some(PathBuf::from(String::from_utf8_lossy(&out.stdout).trim()))
    };
    // either the library's own path, or two levels above <llvm>/lib/clang/<version>
    let named = print("-print-file-name=libomp.so").filter(|p| p.is_absolute());
    let from_name = named.and_then(|p| p.parent().map(Path::to_path_buf));
    let from_resources = print("-print-resource-dir").and_then(|p| p.ancestors().nth(2).map(Path::to_path_buf));
    [from_name, from_resources].into_iter().flatten().find(|d| d.join("libomp.so").exists())
}

const OMP_PROBE: &str = "#include <omp.h>\nint main() {\n    int n = 0;\n    #pragma omp parallel reduction(+:n)\n    n += 1;\n    return omp_get_max_threads() > 0 && n > 0 ? 0 : 1;\n}\n";

fn write_probe() -> Result<(PathBuf, PathBuf), String> {
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let src = out_dir.join("omp_probe.cpp");
    std::fs::write(&src, OMP_PROBE).map_err(|e| e.to_string())?;
    Ok((src, out_dir))
}

/// Compile with the C++ compiler, then link with the linker that rustc will use.
fn probe_openmp_rust_link(compiler: &cc::Tool, omp: &OpenMp) -> Result<(), String> {
    let (src, out_dir) = write_probe()?;
    let obj = out_dir.join("omp_probe.o");
    let mut compile = compiler.to_command();
    compile.args(&omp.compile).arg("-c").arg(&src).arg("-o").arg(&obj);
    run(compile)?;
    let mut link = Command::new(std::env::var_os("RUSTC_LINKER").unwrap_or_else(|| "cc".into()));
    link.arg(&obj).arg("-o").arg(out_dir.join("omp_probe"));
    if let Some(dir) = &omp.lib_dir {
        link.arg("-L").arg(dir);
    }
    link.arg(format!("-l{}", omp.lib));
    run(link)
}

/// Compile and link a small OpenMP program in one step, with the C++ compiler.
fn probe_openmp(compiler: &cc::Tool, omp: &OpenMp, link: &[String]) -> Result<(), String> {
    let (src, out_dir) = write_probe()?;
    let mut cmd = compiler.to_command();
    cmd.args(&omp.compile);
    if let Some(dir) = &omp.include {
        cmd.arg("-I").arg(dir);
    }
    cmd.arg(&src).arg("-o").arg(out_dir.join("omp_probe"));
    if let Some(dir) = &omp.lib_dir {
        cmd.arg("-L").arg(dir);
    }
    cmd.args(link);
    run(cmd)
}

/// Run a command, or describe why it failed in one line.
fn run(mut cmd: Command) -> Result<(), String> {
    let name = cmd.get_program().to_string_lossy().into_owned();
    let out = cmd.output().map_err(|e| format!("could not run {name}: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let text = String::from_utf8_lossy(&out.stderr);
    // a linker names the missing library on an earlier line than its closing "error"
    let line = ["cannot find", "unable to find", "error"]
        .iter()
        .find_map(|key| text.lines().find(|l| l.contains(key)))
        .or_else(|| text.lines().next());
    Err(format!("{name} failed ({}): {}", out.status, line.unwrap_or("no error output")))
}

fn metal() -> Result<(), String> {
    if disabled("BAGFLOW_NO_METAL") {
        return Err("disabled by BAGFLOW_NO_METAL".to_string());
    }
    cpp_build(METAL_SRC)
        .flag("-fobjc-arc")
        .try_compile("bagflow_metal")
        .map_err(|e| format!("the Metal host code did not compile: {e}"))?;
    println!("cargo:rustc-link-lib=framework=Metal");
    println!("cargo:rustc-link-lib=framework=Foundation");
    println!("cargo:rustc-cfg=has_metal");
    Ok(())
}

fn cuda() -> Result<(), String> {
    if disabled("BAGFLOW_NO_CUDA") {
        return Err("disabled by BAGFLOW_NO_CUDA".to_string());
    }
    let home = std::env::var_os("CUDA_HOME").or_else(|| std::env::var_os("CUDA_PATH")).map(PathBuf::from);
    let mut candidates: Vec<PathBuf> = home.iter().map(|h| h.join("bin/nvcc")).collect();
    candidates.push("/usr/local/cuda/bin/nvcc".into());
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|d| d.join("nvcc")));
    }
    let nvcc = candidates
        .into_iter()
        .find(|c| Command::new(c).arg("--version").output().is_ok_and(|o| o.status.success()))
        .ok_or("nvcc not found (needs the CUDA toolkit)")?;

    // find the runtime library before compiling, so that a missing one cannot break linking
    let root = nvcc.parent().and_then(Path::parent).map(Path::to_path_buf);
    let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap();
    let mut lib_dirs: Vec<PathBuf> = Vec::new();
    for base in home.iter().chain(root.iter()) {
        lib_dirs.extend([base.join("lib64"), base.join("lib")]);
    }
    lib_dirs.extend(["/usr/local/cuda/lib64".into(), format!("/usr/lib/{arch}-linux-gnu").into(), "/usr/lib64".into()]);
    // The static runtime is preferred: the binary then starts on machines without CUDA libraries.
    let find = |file: &str| lib_dirs.iter().find(|d| d.join(file).exists()).cloned();
    let (lib_dir, runtime) = find("libcudart_static.a")
        .map(|d| (d, "static=cudart_static"))
        .or_else(|| find("libcudart.so").map(|d| (d, "dylib=cudart")))
        .ok_or("nvcc was found but libcudart was not (set CUDA_HOME)")?;

    let out_dir = std::env::var("OUT_DIR").unwrap();
    let obj = format!("{out_dir}/risk_cuda.o");
    let mut compile = Command::new(&nvcc);
    compile.args([
        "-c", "-O3", "-std=c++17", "-Xcompiler", "-fPIC",
        "-gencode=arch=compute_75,code=sm_75", // T4
        "-gencode=arch=compute_75,code=compute_75",
        CUDA_SRC, "-o", &obj,
    ]);
    run(compile)?;
    let lib = format!("{out_dir}/libbagflow_cuda.a");
    let mut archive = Command::new("ar");
    archive.args(["crs", &lib, &obj]);
    run(archive)?;
    println!("cargo:rustc-link-search=native={out_dir}");
    println!("cargo:rustc-link-lib=static=bagflow_cuda");
    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib={runtime}");
    for lib in ["stdc++", "dl", "rt", "pthread"] {
        println!("cargo:rustc-link-lib={lib}");
    }
    println!("cargo:rustc-cfg=has_cuda");
    Ok(())
}
