
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
