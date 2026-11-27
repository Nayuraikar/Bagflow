# BagFlow: Parallel Airport Processing & Optimisation Studio

BagFlow shows where parallel computing speeds up large-scale baggage processing, and where it does not. It generates synthetic baggage workloads, pushes them through a queueing model of an airport, compares routing and queue policies under six scenarios, and times the parallel parts on threads, SIMD, GPUs and MPI.

The discrete-event simulation is **sequential**, because events must be processed in time order. Parallelism is used inside a workload (dataset generation, a batch kernel, aggregation) and across independent experiments (sweeps).

All data is synthetic. This is a simulation study, not an airport control system, and nothing is calibrated against a real airport.

## Quickstart

### Prerequisites

| | macOS (Apple Silicon) | Linux x86_64 (Debian or Ubuntu commands) |
|---|---|---|
| C++ compiler | `xcode-select --install` | `sudo apt install build-essential curl` |
| Rust | [rustup](https://rustup.rs). It installs the version in `rust-toolchain.toml` by itself | same |
| Node | 24 (`web/.nvmrc`); 22.22 or later also meets the packages' requirements | same. The `nodejs` package of your distribution may be too old; use nvm or nodejs.org |
| OpenMP (optional) | `brew install libomp` | included with g++. With clang, install `libomp-dev` |
| GPU (optional) | Metal, no install | NVIDIA GPU of compute capability 7.5 or later, its driver, and the CUDA toolkit (`nvcc`) to build |
| MPI (optional, command line only) | `brew install open-mpi` | `sudo apt install openmpi-bin libopenmpi-dev` |

No GPU, libomp or MPI is needed. A backend that cannot be built or cannot run is listed as Unavailable with the reason, and the rest works.

### Run everything

```bash
git clone <repository-url> bagflow
cd bagflow
scripts/setup.sh    # checks prerequisites, installs the web packages, builds the API (release)
scripts/start.sh    # starts the API and the web app; Ctrl+C stops both
```

The first setup downloads packages and compiles, so it needs a network connection and takes longer than later ones.

### What to expect

1. `start.sh` ends with `BagFlow is running: http://localhost:5173`. Open that address.
2. The **Main Dashboard** shows **Engine status**: your machine, and which kernel backends are available. Each unavailable one has its reason. On Apple Silicon, AVX2, CUDA and live MPI are expected there.
3. Press **Run baseline** (Normal, dijkstra, fcfs, 100% capacity, 250,000 bags requested). It runs for a few seconds.
4. The **Delayed bags** card then shows **9,245**, **3.697% of bags** (250,086 simulated). This result is deterministic. The pipeline timings below it are measured on your machine and will differ from run to run.

### Addresses

| Variable | Default | Used by |
|---|---|---|
| `BAGFLOW_API_ADDR` | `127.0.0.1:3001` | The API (where it listens) and `start.sh` |
| `BAGFLOW_API_URL` | `http://127.0.0.1:3001` | `npm run dev` and `npm run preview`: where they forward `/api`. It can also go in `web/.env.local`. `start.sh` sets it from `BAGFLOW_API_ADDR` |
| `BAGFLOW_WEB_PORT` | `5173` | `start.sh` |

To run the two parts by hand:

```bash
# terminal 1: the API
cargo run --release -p bagflow-api

# terminal 2: the web app on http://localhost:5173
cd web && npm ci && npm run dev
# or the built version, on http://localhost:4173
cd web && npm ci && npm run build && npm run preview
```

The API creates `data/` and saves one record per job in `data/runs/` (gitignored). `BAGFLOW_DATA_DIR` and `BAGFLOW_RESULTS_DIR` change the two folders. Full bag histories stay in memory for the 3 newest simulations only. The API allows any origin (CORS is fully open), so while it runs, any web page open in your browser can call it and start jobs.

### Troubleshooting

- **libomp missing.** The build warns `OpenMP backend not built: ...` and succeeds; the app lists `openmp` as not available. To add it: `brew install libomp` (with clang on Linux: `libomp-dev`), then run `scripts/setup.sh` again. A plain `cargo build` may not notice a newly installed library; `touch crates/bagflow-kernels/build.rs` first. For a libomp in another place, set `LIBOMP_PREFIX`.
- **The API fails to start after removing libomp** with `Library not loaded: ... libomp.dylib`. That binary was built with it. Run `scripts/setup.sh` again.
- **Port 3001 busy.** `start.sh` stops with `something already answers on 127.0.0.1:3001`, or the API prints `could not listen on ...`. See what holds the port with `lsof -nP -iTCP:3001 -sTCP:LISTEN`, or use another one: `BAGFLOW_API_ADDR=127.0.0.1:3101 scripts/start.sh`. By hand, set `BAGFLOW_API_ADDR` for the API and `BAGFLOW_API_URL=http://127.0.0.1:3101` for the web app.
- **Port 5173 busy.** `BAGFLOW_WEB_PORT=5273 scripts/start.sh`.
- **`Found another Vite dev process for this project`.** Vite runs one dev server per project folder. If `start.sh` is running, use its address, or stop it before `npm run dev`. `npm run preview` can run next to it.
- **Debug build warning.** The dashboard says `Debug build: timings are not representative` when the API was built without `--release`. Results are the same but timings are not usable. Use `scripts/start.sh` or `cargo run --release -p bagflow-api`.
- **CUDA not available.** The reason is shown in Engine status. `CUDA driver version is insufficient for CUDA runtime version` is also what CUDA reports when no NVIDIA driver is installed at all. If the toolkit is in another place than `/usr/local/cuda` and `nvcc` is not on `PATH`, set `CUDA_HOME` and run `scripts/setup.sh` again.
- **A GPU or OpenMP backend breaks the build or misbehaves.** Leave it out with `BAGFLOW_NO_CUDA=1`, `BAGFLOW_NO_METAL=1` or `BAGFLOW_NO_OPENMP=1`, set while building.
- **"API unreachable" in the app.** The API is not running, or the web app points at another address (`BAGFLOW_API_URL`). The page reconnects by itself.

## What is in here

| Part | Where | What it does |
|---|---|---|
| Core, generator, engines | `crates/bagflow-core` | Seeded generator, structure-of-arrays dataset, discrete-event engines, routing, scenarios |
| CLI tools | `crates/bagflow-sim` | `bagflow-sim gen`, and the binaries `validate`, `compare`, `scenarios`, `scale`, `slice` |
| Batch kernels | `crates/bagflow-kernels`, `kernels/` | Deadline-risk kernel: scalar, ILP, Rayon, OpenMP, NEON, AVX2, Metal, CUDA (naive, warp, PTX), MPI |
| API | `crates/bagflow-api` | Axum server: runs simulations, parallel runs, sweeps and benchmarks |
| Web app | `web/` | React app over the API |
| Results | `results/` | Raw output of measured runs |
| Notes | `docs/` | `AUDIT.md`, `design/`, and older notes (`assumptions.md`, `schemas.md`, `backends.md`; parts are out of date, see the audit) |

There are two engines. `engine2` is the one behind the API and the routing and scenario results. The older `engine.rs` (a 6-node chain with a 12-state bag machine) is still used by `slice`, `scale` and `validate`.

## More commands

```bash
# checks (CI runs these on Ubuntu and macOS: .github/workflows/ci.yml)
cargo test --release
cd web && npm run build && npm run lint

# command-line tools
cargo run --release -p bagflow-sim -- gen --bags 10000000 --mode bench   # generator, sequential vs Rayon
cargo run --release -p bagflow-sim --bin validate                        # M/M/c against theory
cargo run --release -p bagflow-sim --bin compare -- 250000 1 100         # 4 routings x 4 queue policies
cargo run --release -p bagflow-sim --bin scenarios -- 250000 100         # six scenarios
cargo run --release -p bagflow-kernels -- 10000000                       # CPU and GPU kernels

# MPI (needs Open MPI). The first command writes the 50M-bag file, about 1.2 GB.
cargo run --release -p bagflow-sim -- gen --bags 50000000
scripts/run_mpi.sh results/bags_seed42.bin 8
```

AVX2 needs an x86_64 CPU that has it. CUDA is built on Linux with `nvcc` and needs an NVIDIA GPU to run (Kaggle was used for the saved results). Metal needs macOS.

The measurements below were taken before the API's default `generate` chunk changed from about 1,042 flights to 16 (17 at 10M bags, because of the task limit). The "Known issue" bullet and the "default chunk" row describe the old default; the new one has not been re-measured.

## The app

| Page | What it shows |
|---|---|
| Main Dashboard | Engine status, a baseline run, and the four pipeline phases with measured times and an Amdahl analysis |
| Stage Explorer | Seven baggage stages: what each does, what can be parallel, what was measured, and what is not modelled |
| Airport Network, Baggage Tracker, Congestion Analysis | One retained simulation: facilities, individual bags, queues over time |
| Parallel Execution Studio | One workload, sequential against a backend, replayed from recorded task times |
| Parallel Airport Operations (`/operations/parallel-operations`) | The same configuration run sequentially and in operational parallel mode: measured times, speedup, efficiency, a checksum match check, a replay of the recorded precompute tasks per worker, and which facilities are parallel or sequential |
| Performance Lab, Backend Comparison | Live kernel benchmarks, plus saved results labelled Static with their machine |
| Resource Profiler | **Planned.** Not built |
| Scenario Studio, Simulation History | Run one configuration; reopen and compare saved runs |
| Parallel Sweeps | Many independent simulations on a thread pool, checked against the 1-thread pass |
| Guided Demo | A six-step walkthrough (below) |

Values carry a label saying where they come from: Real or Measured (an API run on this machine), Static (a saved result), Simplified (a model or display rule). A missing value shows `--`.

### Guided Demo (`/guided-demo`)

Problem, Workload, Parallel kernel, Simulation, Experiment sweep, Results.

- Each of the first five steps is one API job. Nothing runs until you press its button.
- A step reuses the newest saved run with exactly the same settings, and says whether the result was run during this visit or reused.
- A step without a result can be skipped, including when the API is busy or unreachable. Skipped values show `--` in Results.
- Noisy speedups are shown as ranges. A single sweep is marked as having no spread.
- Results states the Amdahl ceiling of one pipeline run and compares it with the measured sweep speedup.

With nothing saved, the five jobs took about 70 s in total on the M1 in one browser walkthrough; the workload and sweep steps were about 31 s each.

## Phases

| Phase | Content |
|---|---|
| R1 | Pipeline timing, parallel telemetry and sweeps in the API; legacy endpoints removed |
| R2 | New web shell and dashboard with the measured pipeline and Amdahl analysis |
| R3 | Parallel Execution Studio and Stage Explorer from recorded telemetry |
| R4 | Parallel Sweeps, Performance Lab, Backend Comparison |
| R5 | Airport Network, Baggage Tracker, Congestion Analysis, Scenario Studio, Simulation History |
| R6 | Guided Demo, narrow-screen and API-unreachable polish, this README |
| R7 | Operational parallel mode in `engine2` (per-bag precompute on Rayon), its API options and pipeline phase, and the Parallel Airport Operations page |

Not built: Resource Profiler, `POST /api/scenarios`, history delete and export, live MPI runs, memory and GPU utilisation figures. See `docs/AUDIT.md` section 12.

Tags from the earlier engine and kernel work: `v0.1-core`, `v0.1b-bigdata`, `v0.2-slice`, `v0.3-validated`, `v0.3b-scaling`, `v0.4-routing`, `v0.4b-stressed`, `v0.5-scenarios`, `v0.6a-kernels` to `v0.6d-mpi`, `v0.7-dashboard` to `v0.7e-arena`, `v0.9-skin`.

## Results

**M1** below means an Apple M1 MacBook Air (fanless), 8 GB, 8 logical cores. Files named `results/r6_*` were measured on it on 27 November 2026 with rustc 1.100.0, on AC power; each starts with its command and load average. **Kaggle** figures come from older saved files and were **not re-measured**.

### Engine checks

- **M/M/c validation** (`r6_validation_mmc.txt`): 15 of 15 cases (c in 1, 2, 4, 8, 16; utilisation 0.5, 0.7, 0.8; 1M customers each) are within 5% of Erlang C, with errors from -3.3% to +0.4%. This validates `engine.rs` only. **`engine2` has no theory validation of its own.**
- **Pinned `engine2` runs** through the live API (`r6_api.txt`), 250,086 bags, FCFS:

| Scenario, routing, capacity | Delayed | Engine checksum |
|---|---|---|
| Normal, dijkstra, 100% | 3.697% | `61aa19cce7723683` |
| SorterOverload, ecmp, 100% | 11.438% | `144494908f029748` |
| Normal, congestion, 70% | 53.752% | `29e8786b1e8e3fae` |

### Routing, queue policy and scenarios

These are deterministic. The re-runs (`r6_compare_100.txt`, `r6_compare_70.txt`, `r6_scenarios.txt`) match the older files in every column except the wall time of each run.

250,086 bags, normal day, full capacity:

| Routing + queue | Delayed | Tight-connection delayed |
|---|---|---|
| Dijkstra + FCFS | 3.70% | 7.42% |
| Congestion + FCFS | 3.25% | 7.23% |
| Any routing + Priority | 3.42 to 3.89% | 0.00% |
| Any routing + EDF | 0.00% | 0.00% |
| ECMP, congestion or deadline + SPT | 0.71 to 0.72% | 0.68 to 0.72% |

- At 70% capacity EDF no longer helps: Dijkstra gives 79.59% delayed with EDF and 77.42% with FCFS.
- Screening delay and peak surge hurt most among the scenarios: 13.68 to 20.62% delayed over all routings with FCFS or EDF.
- The conveyor failure barely changes the delayed rate.
- Sorter overload shows the largest routing effect: congestion + EDF 0.00% delayed, Dijkstra + EDF 8.51%.

### Dataset generation, 10M bags (M1)

| How it was run | Sequential | Rayon, 8 threads | Speedup |
|---|---|---|---|
| CLI, 3 processes, one timing each (`r6_gen_10M.txt`) | 2.99 to 3.14 s | 0.617 to 0.629 s | 4.74x to 5.09x |
| Live API, 64 flights per chunk, 3 jobs, median of 5 (`r6_api.txt`) | 2.89 to 3.54 s | 0.78 to 1.20 s | 2.95x to 3.70x |
| Live API, **default** chunk (1,042 flights), 1 job (`r6_api.txt`) | 2.94 s | 1.43 s | 2.06x |

- Every output was identical to the sequential one.
- The earlier figure of **4.97x** is in `bench_phase1b.txt` (M1, one run) and lies inside the new CLI range. It describes the CLI, not what the app measures.
- The API figures are **noisy**. Single repetitions of the Rayon side ranged from 0.68 s to 2.23 s, and one sequential repetition took 8.76 s. Why the API is slower than the CLI was not investigated.
- **Known issue:** the API's default chunk for `generate` allows only two tasks per generator batch of 2,048 flights, so most threads sit idle. This affects the Parallel Execution Studio. The Guided Demo asks for 64-flight chunks.
- At 50M bags (`r6_gen_50M.txt`, one run): sequential 16.4 s, Rayon with 8 threads 5.51 s, 2.98x.

### Parallel sweep (M1, `r6_api.txt`)

96 experiments (6 scenarios x 4 routings x 4 queue policies), 100,000 bags requested each, three identical sweeps. All 96 results on 8 threads matched the 1-thread pass each time.

| Sweep | 1 thread | 8 threads | Speedup | Efficiency |
|---|---|---|---|---|
| 1 | 24.54 s | 4.72 s | 5.20x | 65.0% |
| 2 | 24.23 s | 4.74 s | 5.11x | 63.9% |
| 3 | 25.27 s | 5.61 s | 4.51x | 56.3% |

Quote this as **4.5x to 5.2x**, not as one number: each pass is timed once per sweep, and timings move on a fanless laptop. A **5.08x** figure quoted for this sweep earlier could not be traced to any result file or saved run, so it is not used. At this size and full capacity every experiment delays under 0.04% of bags in the demo's runs, so this grid demonstrates wall-time gain more than operational differences.

### The whole pipeline (M1, `r6_api.txt`)

Three baseline jobs (250,086 bags): simulation took 692 to 701 ms, about 90% of the all-sequential sum. The parallelisable share was 9.8 to 9.9%, which gives an **Amdahl ceiling of 1.11x** for one pipeline run. The measured full-pipeline speedup was 1.08x. Both are computed from sums of separately timed phases, not from an end-to-end timing. Parallelism pays off in sweeps, where whole simulations run side by side.

### Operational parallel mode

An optional mode of `engine2` (`crates/bagflow-core/src/operational.rs`). Before the event loop, the independent per-bag work runs on a Rayon pool, split into contiguous bag ranges with at least 4 tasks per worker:

- **Parallel:** check-in registration (each bag's arrival time), flight grouping (each bag's loading area), and, for dijkstra and ecmp routing without an edge outage, each bag's full route and its service time at every facility on it.
- **Sequential, unchanged:** the event loop, every queue (screening and sorting included), server allocation and event order.
- Congestion and deadline routing, and any routing in ConveyorFailure (an edge outage), precompute only check-in registration and flight grouping: their routes depend on live queues or time.

Results are identical because the engine's random draws are a stateless hash of (seed, bag, stage), not a shared stream. The three pinned checksums (61aa19cce7723683, 144494908f029748, 29e8786b1e8e3fae) are reproduced for workers 1, 2, 4 and 8 (`crates/bagflow-core/tests/operational.rs`). Through the API: `"operational_parallel": true, "workers": N` on `POST /api/simulations`.

M1 (Apple M1 MacBook Air), Normal / dijkstra / fcfs / 100%, stats only (no bag histories), median of 3, `operational_bench`. Load average was about 4.1, so the machine was not fully quiet. **Reported in session, not saved to `results/`.**

| Bags | Workers | Precompute, sequential → parallel | Precompute speedup | Event loop | Whole-run speedup |
|---|---|---|---|---|---|
| 250,086 | 1 | 150 → 151 ms | 1.00x | about 496 to 500 ms | 1.05x |
| 250,086 | 2 | 150 → 75 ms | 2.00x | about 496 to 500 ms | 1.18x |
| 250,086 | 4 | 150 → 38 ms | 3.98x | about 496 to 500 ms | 1.29x |
| 250,086 | 8 | 150 → 25 ms | 6.04x | about 496 to 500 ms | 1.32x |
| 1,000,065 | 1 | 609 → 611 ms | 1.00x | -- | 1.07x |
| 1,000,065 | 2 | 609 → 304 ms | 2.03x | -- | 1.20x |
| 1,000,065 | 4 | 609 → 162 ms | 3.80x | -- | 1.28x |
| 1,000,065 | 8 | 609 → 106 ms | 5.78x | -- | 1.32x |

- The whole run gains only about 1.3x at 8 workers because the sequential event loop dominates (Amdahl: the precompute is about 23 to 24% of the work).
- The 1.05x to 1.07x at 1 worker is not parallelism: the precompute itself is 1.00x there. The gain comes from moving per-bag work out of the loop.
- The API path also records bag histories, which lengthens the loop and shrinks the speedup.
- The 1M-bag checksum is not a pinned value.

### Batch kernel, 10M bags

The kernel is a separate analysis of the bag table. **The simulation does not use its output.** Speedup is over the scalar loop on the same machine.

| Backend | M1: time, speedup (3 runs of best-of-10, `r6_kernels_10M.txt`) | Kaggle Xeon (4 vCPU) + T4: best of 10, **saved, not re-measured** (`kernels_10M_kaggle.txt`) |
|---|---|---|
| Scalar | 14.07 to 14.11 ms | 26.31 ms |
| ILP x4 | 13.04 to 13.05 ms, 1.08x | 30.50 ms, 0.86x |
| SIMD | NEON 6.71 ms, 2.10x | AVX2 7.91 ms, 3.32x |
| OpenMP | 8 threads: 4.28 to 4.32 ms, 3.26x to 3.30x | 4 threads: 7.07 ms, 3.72x |
| Rayon 4 + SIMD | NEON 1.82 to 1.99 ms, 7.08x to 7.72x | AVX2 3.56 ms, 7.39x |
| GPU kernel only | Metal 3.45 ms, 4.07x to 4.10x | CUDA warp 0.83 ms, 31.65x |
| GPU with copies | Metal 7.35 to 7.46 ms, 1.89x to 1.91x | CUDA warp + PCIe 21.61 ms, 1.22x |
| Naive GPU atomics | | CUDA naive 24.81 ms, 1.06x |

- All outputs were identical to scalar.
- The live API reports medians, not best-of-10: three runs of `rayon-neon` on 8 threads gave 6.37x to 6.59x (`r6_api.txt`). Pairing single repetitions within those three runs gives anything from 3.83x to 8.09x, and runs in the browser walkthroughs spread wider still.
- The scalar baseline is auto-vectorised. With vectorisation off, scalar took 21.16 ms on the M1 (`kernels_10M_novec.txt`, **saved, not re-measured**).
- ILP gains little or loses on both machines.
- On the M1, Rayon with NEON stops improving beyond 4 threads. The cause was not measured.
- On the T4, the warp-shuffle kernel is about 30x faster than per-thread atomics, and hand-written PTX takes the same time. Copying the input over PCIe (18.71 ms) costs far more than the kernel (0.83 ms).
- M1 timings can differ much more between sessions than within one: the older `kernels_10M.txt` has `rayon-4+neon` at 3.81 ms.

Do not compare times across the two machines as if they were one experiment.

### MPI, 50M bags (M1, 2 runs, `r6_mpi_50M.txt`)

| Measure | 4 ranks | 8 ranks |
|---|---|---|
| Compute speedup | 3.99x to 4.00x | 5.89x to 6.19x |
| End to end, `read` (each rank loads its slice) | 2.73x to 4.55x | 3.52x to 6.07x |
| End to end, `scatter` (rank 0 sends everything) | 1.81x to 2.15x | 1.03x to 1.15x |

- Results were identical at every rank count.
- **End-to-end figures are unreliable.** The load time is measured once. In the first run the 1-rank `read` load took 202 ms against 72 ms in the second, which inflates every `read` speedup in that run.
- The older `mpi_50M.txt` has different values (8 ranks: compute 4.74x, `read` 3.47x, `scatter` 1.43x).
- On Kaggle at 4 ranks, `scatter` was 0.63x end to end (`mpi_50M_kaggle.txt`, **saved, not re-measured**): communication outweighed the compute gain.

### Figures removed from the earlier README

- "50M bags generate in about 6.5 s": no result file supported it. The measured run above took 5.51 s.
- "The kernel is memory bound": not measured.

## Limits

- Everything is one synthetic day.
- Early-bag storage, transfers with minimum connection times, loader limits, random equipment failures and edge capacity limits are not modelled. Misrouted bags never occur.
- Facility colours and the "congested" count are a display rule of the API, not engine output.
- Server counts do not grow with the bag count, so more bags means more load unless you raise the server multiplier.
- The web app has no automated tests.
- Operational parallel mode parallelises only per-bag precompute; the event loop and all queues stay sequential, so the whole-run gain is about 1.3x at 8 workers. Its measurement was not on a fully quiet machine and is not saved to `results/`. The browser check covered only 100k bags with 4 workers.
- On narrow screens, wide tables scroll sideways and the network graph is small: zoom in to read its labels.
