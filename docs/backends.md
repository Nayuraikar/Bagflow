
# Batch kernel: deadline-risk classification (Phase 6a)
est = 1200 + 600*special + 300*transfer (s); slack = deadline - arrival - est; class = 0 (>=1800 s), 1 (>=600 s), 2 (<600 s).
Outputs: class byte per bag, class counts, slack sum. All integer, so every backend must be bit-identical to scalar.
Backends: scalar, ILP (4 accumulators), TLP (Rayon, OpenMP), SIMD (NEON; AVX2 written, pending Kaggle), TLP x SIMD.
Results: results/kernels_10M.txt (auto-vectorized scalar) and results/kernels_10M_novec.txt (vectorization disabled, true scalar baseline). Apple Silicon, 8 logical cores.
Findings: LLVM auto-vectorizes scalar (14.1 vs 21.2 ms). ILP gives ~1.0x (out-of-order cores already overlap). NEON 2.1x/3.15x. Kernel is memory-bound (26-36 GB/s); threads flatten past 4. Threaded timings vary ~30% run to run (fanless Air, thermal throttling).
Traffic per bag: 9 bytes read + 1 written = 10 bytes, used for the GB/s column.

# Metal (Phase 6b)
One thread per bag; 256-thread groups reduce counts and slack with simd_sum, then write one partial per group; the CPU sums partials (integers, fixed order), so results are bit-identical to scalar.
Shader is compiled at runtime from source embedded in kernels/gpu/metal/risk_metal.mm (no Metal toolchain required). Buffers use shared storage (Apple Silicon unified memory), so "copy in/out" is a memcpy, not a PCIe transfer.
Reported separately: copy in, GPU kernel time (GPU timestamps), CPU-side wall time, copy out + partial reduction, and end-to-end. First run is a warm-up and excluded. Results: results/kernels_10M_metal.txt.

# CUDA and AVX2 (Phase 6c, run on Kaggle: Xeon 2.0 GHz 4 logical cores, Tesla T4, CUDA 13.0)
Three CUDA variants of the risk kernel: naive (3 global atomics per thread), warp shuffle (shfl_down, one atomic per warp), warp ptx (inline PTX vote.sync.ballot + popc + shfl.sync). All bit-identical to scalar. AVX2 and Rayon+AVX2 also identical.
Findings: naive atomics 24.8 ms vs warp shuffle 0.83 ms (30x, atomic contention). PTX = warp shuffle speed (compiler emits the same code). Kernel ~120 GB/s (about 40% of T4 peak).
Transfer: pageable copy-in 18.7 ms (~4.8 GB/s) dwarfs the 0.83 ms kernel; end-to-end 21.6 ms is only 1.22x over scalar and about 6x slower than rayon-4+avx2 (3.56 ms). On the M1 the copy-in was 3.0 ms (unified memory).
sm_60 dropped from the build because CUDA 13 no longer supports Pascal. Results: results/kernels_10M_kaggle.txt. Speedups are relative to the scalar row of the same file.

# MPI (Phase 6d)
kernels/mpi/risk_mpi.cpp: same risk formula, one thread per rank, bags split into contiguous slices. Two distribution modes: `read` (each rank reads its slice of the .bin file) and `scatter` (rank 0 reads all, MPI_Scatterv). Results combined with MPI_Reduce (3 x int64). Reports load, compute (best of 10, slowest rank) and reduce times.
Correctness: every rank count gives identical counts and slack sum; the 10M result matches the Rust scalar answer (7172190 1944284 883694, slack 27835824747).
Findings (M1, 50M): compute 3.9x at 4 ranks, 4.7x at 8 (memory-bound). Reduce is negligible (24 bytes). Scatter load (278 ms at 8 ranks) dwarfs compute (17 ms): end-to-end only 1.43x, versus 3.47x in read mode.
Results: results/mpi_10M.txt, results/mpi_50M.txt (Mac M1). Kaggle run to follow: results/mpi_50M_kaggle.txt (4 cores).
- MPI on Kaggle (50M, 4 logical cores): same result as the Mac. Compute 2.29x at 4 ranks (memory-bound, likely 2 physical cores). Scatter load grows with ranks (498 to 856 ms), so end-to-end is 0.63x at 4 ranks: communication cost outweighs compute gains.

# Dashboard (Phase 7)
crates/bagflow-api: Axum 0.7 server on 127.0.0.1:3001. Generates the 250k dataset at startup; GET /api/info and GET /api/run?scenario=&routing=&policy=&pct= run the real engine (engine2 + scenarios) and return JSON. Vite proxies /api.
web/: three tabs. Replay (Phase 2 Pixi page), Scenarios (any scenario x routing x policy x capacity, compare 4 routings), Benchmark lab (kernel, transfer and MPI charts; numbers embedded in BenchPage.tsx from the result files).
Verified: API Normal/dijkstra/fcfs gives 3.697% delayed, identical to the CLI tables.
Not included: WebSocket live streaming, click-to-fail conveyor, side-by-side synced replays, ParticleContainer level-of-detail.

# Journey tab (Phase 7c)
web/src/journeySim.ts: deterministic multi-stage queue model (check-in, screening, sorter, belts, per-flight loading with departure deadlines, flight, unloading). Same random bags for every worker count, so serial and parallel runs compare directly. web/src/JourneyPage.tsx draws it on a canvas and narrates each step from the followed bag's phase.
It is an illustrative model with the engine's structure, not the Rust engine's event log. Light theme applied app-wide (light.css).

# Scale tab (Phase 7d)
web/src/ScalePage.tsx: per-minute fluid model (check-in, screening, sorter, loading; 12/14/16/10 bags/min per worker) for up to 50M bags and 4096 workers; on-time share by first-in-first-out matching with a 150 min window. Particles carry many bags each (1 dot = N/4000 bags). Backend race uses measured throughput from results/kernels_10M_metal.txt and kernels_10M_kaggle.txt (linear extrapolation, two machines).
Not the Rust engine: that processes about 240k bags/s sequentially, so million-bag runs happen in the CLI. Pixi replay page is lazy-loaded (code split).
