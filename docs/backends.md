
# Batch kernel: deadline-risk classification (Phase 6a)
est = 1200 + 600*special + 300*transfer (s); slack = deadline - arrival - est; class = 0 (>=1800 s), 1 (>=600 s), 2 (<600 s).
Outputs: class byte per bag, class counts, slack sum. All integer, so every backend must be bit-identical to scalar.
Backends: scalar, ILP (4 accumulators), TLP (Rayon, OpenMP), SIMD (NEON; AVX2 written, pending Kaggle), TLP x SIMD.
Results: results/kernels_10M.txt (auto-vectorized scalar) and results/kernels_10M_novec.txt (vectorization disabled, true scalar baseline). Apple Silicon, 8 logical cores.
Findings: LLVM auto-vectorizes scalar (14.1 vs 21.2 ms). ILP gives ~1.0x (out-of-order cores already overlap). NEON 2.1x/3.15x. Kernel is memory-bound (26-36 GB/s); threads flatten past 4. Threaded timings vary ~30% run to run (fanless Air, thermal throttling).
Traffic per bag: 9 bytes read + 1 written = 10 bytes, used for the GB/s column.
