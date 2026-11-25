
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
