
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
