# BagFlow

A parallel airport baggage simulation and optimisation engine. It generates synthetic baggage workloads of up to tens of millions of bags, pushes them through a queueing model of an airport (check-in, screening, sorting, loading), compares routing and queue policies under six operational scenarios, and benchmarks the batch analysis on ILP, threads, SIMD, GPUs and MPI.

All data is synthetic. This is a simulation study, not an airport control system.

## What is in here

| Part | Where | What it does |
|---|---|---|
| Core, generator, engines | `crates/bagflow-core` | 12-state bag machine, seeded ChaCha streams, structure-of-arrays dataset, discrete-event engines, routing, scenarios |
| CLI tools | `crates/bagflow-sim` | `gen`, `slice`, `validate`, `scale`, `compare`, `scenarios` |
| Batch kernels | `crates/bagflow-kernels`, `kernels/` | Deadline-risk kernel: scalar, ILP, Rayon, OpenMP, NEON, AVX2, Metal, CUDA (naive, warp, PTX), MPI |
| API | `crates/bagflow-api` | Axum server that runs the real engine for the dashboard |
| Dashboard | `web/` | Tabs: Airport, Scale, Journey, Replay, Scenarios, Benchmark lab |
| Notes | `docs/` | `assumptions.md`, `schemas.md`, `backends.md` |
| Results | `results/*.txt` | Raw output of every measured run below |

## Run it

```bash
# tests
cargo test

# dataset: 250k bags, or 10M with a threads benchmark
cargo run --release -p bagflow-sim -- gen --bags 250000
cargo run --release -p bagflow-sim -- gen --bags 10000000 --mode bench

# engine checks and comparisons
cargo run --release -p bagflow-sim --bin validate     # M/M/c against theory
cargo run --release -p bagflow-sim --bin compare      # 4 routings x 4 queue policies
cargo run --release -p bagflow-sim --bin scenarios    # six scenarios

# kernels (needs libomp on macOS: brew install libomp)
cargo run --release -p bagflow-kernels -- 10000000
scripts/run_mpi.sh results/bags_seed42.bin 8          # needs Open MPI

# dashboard
cargo run --release -p bagflow-api                    # terminal 1 (port 3001)
cd web && npm install && npm run dev                  # terminal 2 (port 5173)
```

CUDA, AVX2, warp and PTX run on a Linux machine with an NVIDIA GPU (Kaggle was used); the build skips CUDA elsewhere. Metal needs macOS.

## Results

Every number comes from a file in `results/`. Backends are bit-identical to the scalar baseline in all runs.

**Engine correctness.** The engine was run as a single M/M/c station against the exact Erlang C waiting time for c in {1, 2, 4, 8, 16} and utilisation 0.5, 0.7 and 0.8 (1M customers each): 15 of 15 cases within 5% of theory, with errors between -3.3% and +0.4%. Bags are conserved in every run, and the same seed gives the same checksum.

**Dataset generation (10M bags, Apple M1).** Sequential 3.0 s; Rayon with 8 threads 0.61 s, which is 4.97x (16.5M bags/s) with an identical checksum. 50M bags generate in about 6.5 s.

**Routing and queue policies (250k bags, stressed network).**

| Routing + queue | Delayed | Tight-connection delayed |
|---|---|---|
| Dijkstra + FCFS | 3.70% | 7.42% |
| Congestion + FCFS | 3.25% | 7.23% |
| Any routing + Priority | about 3.4 to 3.9% | 0.00% |
| Any routing + EDF | 0.00% | 0.00% |
| ECMP / congestion / deadline + SPT | 0.7% | 0.7% |

Queue policy matters more than routing at moderate load. EDF stops helping once the system is overloaded (70% of the servers or fewer).

**Scenarios.** Screening delay and peak surge hurt most (16 to 21% delayed against 3 to 4% in the normal case). A conveyor failure is almost invisible because screening is the bottleneck and bags reroute over the other sorter exits. Sorter overload shows the largest routing benefit: congestion + EDF 0.0% delayed against Dijkstra + EDF 8.5%.

**Batch kernel, 10M bags (time per run, speedup over scalar of the same machine).**

| Backend | Apple M1 | Kaggle Xeon (4 vCPU) + T4 |
|---|---|---|
| Scalar | 14.12 ms | 26.31 ms |
| ILP x4 | 13.12 ms (1.08x) | 30.50 ms (0.86x) |
| SIMD | NEON 6.75 ms (2.09x) | AVX2 7.91 ms (3.32x) |
| Threads | OpenMP-8 4.30 ms (3.29x) | OpenMP-4 7.07 ms (3.72x) |
| Threads + SIMD | Rayon-4 + NEON 1.89 ms (7.47x) | Rayon-4 + AVX2 3.56 ms (7.39x) |
| GPU kernel only | Metal 3.45 ms (4.10x) | CUDA warp 0.83 ms (31.65x) |
| GPU with copy | Metal 7.41 ms (1.90x) | CUDA warp + PCIe 21.61 ms (1.22x) |
| Naive GPU atomics | | CUDA naive 24.81 ms (1.06x) |

Findings:
- LLVM auto-vectorises the scalar loop. With vectorisation off, scalar takes 21.2 ms on the M1.
- ILP gains almost nothing on out-of-order cores.
- The kernel is memory bound, so threads flatten after about 4.
- Warp-shuffle reduction is about 30x faster than per-thread atomics on the same GPU, and hand-written PTX matches it.
- Copying data to the GPU (18.7 ms over PCIe on the T4) costs more than the kernel (0.83 ms), so end-to-end the GPU loses to 4 CPU threads with SIMD. On the M1's unified memory the copy is 3.0 ms.

**MPI (50M bags).** Compute speedup is 3.9x at 4 ranks and 4.7x at 8 on the M1. With `read` mode each rank loads its own slice (end-to-end 3.47x at 8 ranks). With `scatter` mode rank 0 sends everything and end-to-end falls to 1.43x on the M1 and 0.63x on Kaggle at 4 ranks: communication outweighs the compute gain.

## Dashboard

- **Airport.** Synthetic data for one day, 30 days or a year (up to about 42M bags); book a direct or via-hub trip, get a boarding pass, then follow the bag through each scene.
- **Scale.** A per-minute flow model for up to 50M bags, plus an arena that races every backend.
- **Journey, Replay, Scenarios, Benchmark lab.** Step-by-step bag story, the real engine's event-log replay, the real engine behind the API, and the measured kernel charts.

## Limits

- The Airport, Scale and Journey scenes use simplified queue models, not the Rust engine's event log. Only Replay and Scenarios run the real engine.
- Choosing a compute backend in the dashboard does not change the animated bag flow. Linking them needs the Rust engine driving a re-planning loop.
- Throughputs shown for the M1 and the Kaggle machine come from different hardware and should be compared within one machine only.
- Early-bag storage, MCT-based transfers, loader limits, random MTBF failures and edge capacity limits are not modelled. Calibration against real SITA figures is not done.
- Timings are best-of-10 on a fanless laptop and a shared cloud VM, so expect about 30% run-to-run variation.

## Milestones

Tags: `v0.1-core` (types, generator), `v0.1b-bigdata` (Rayon generator), `v0.2-slice` (end-to-end replay), `v0.3-validated` (M/M/c), `v0.3b-scaling`, `v0.4-routing`, `v0.4b-stressed`, `v0.5-scenarios`, `v0.6a-kernels` to `v0.6d-mpi`, `v0.7-dashboard` to `v0.7e-arena`, `v0.9-skin`.
