# BagFlow: project reference

A technical reference for the BagFlow repository, written so that the project can be understood, audited and reproduced without opening the code. Everything here was read from the working tree on 27 November 2026. No code was run apart from read-only inspection and small calculations (see Part 5). Where something is missing it says **NOT FOUND**; where the repo is ambiguous it says **UNCLEAR**.

Conventions:

- `path:line` refers to a file in this repository. Line numbers are from the current working tree.
- "M1" means the machine named in the `results/r6_*` headers: `Apple M1 (MacBook Air, fanless), 8 GB, rustc 1.100.0 (0ef1bc386 2026-11-09)`.
- "Kaggle" means the machine named in `results/kernels_10M_kaggle.txt` line 1: `Kaggle: Xeon @ 2.00GHz with AVX2, Tesla T4, CUDA 13.0`, 4 logical cores. **Kaggle figures are saved results that were not re-measured** (README "Results").
- `data/runs/*.json` are job records written by the local API. The folder is gitignored (`.gitignore`: `data/`), so these files exist in this working tree but **not in a fresh clone**. They are labelled "local record".
- `results/*.bin` and `results/*.csv` are also gitignored (`.gitignore`: `results/*.bin`, `results/*.csv`) and are not in a fresh clone.

---

# PART 1: Overview

## 1.1 Purpose and task

From `README.md` lines 3–7:

> BagFlow shows where parallel computing speeds up large-scale baggage processing, and where it does not. It generates synthetic baggage workloads, pushes them through a queueing model of an airport, compares routing and queue policies under six scenarios, and times the parallel parts on threads, SIMD, GPUs and MPI.
>
> The discrete-event simulation is **sequential**, because events must be processed in time order. Parallelism is used inside a workload (dataset generation, a batch kernel, aggregation) and across independent experiments (sweeps).
>
> All data is synthetic. This is a simulation study, not an airport control system, and nothing is calibrated against a real airport.

The task is therefore a performance study, not a prediction task. There is no machine-learning model, no training, and no train/test split anywhere in the repository.

## 1.2 Contributions (what the repository actually contains)

| # | Contribution | Where |
|---|---|---|
| 1 | Seeded synthetic generator of one airport day (flights and bags), sequential and Rayon-parallel, bit-identical | `crates/bagflow-core/src/generator.rs` |
| 2 | Sequential discrete-event engine `engine2` on a 10-node layered network with 4 routing strategies, 4 queue policies, timed outages | `crates/bagflow-core/src/engine2.rs`, `network.rs` |
| 3 | Six operational scenarios | `crates/bagflow-core/src/scenarios.rs` |
| 4 | Older 6-node chain engine `engine.rs` with a 12-state bag machine, validated against M/M/c (Erlang C) theory | `engine.rs`, `state.rs`, `queueing.rs` |
| 5 | Optional observation of `engine2` (bag histories, node time-series, wait histograms, edge traffic) that does not change results | `crates/bagflow-core/src/collect.rs` |
| 6 | Sequential and parallel aggregation of bag histories | `crates/bagflow-core/src/aggregate.rs` |
| 7 | Batch deadline-risk kernel in 12 implementations plus MPI | `crates/bagflow-kernels/src/lib.rs`, `kernels/` |
| 8 | Benchmark runner with warm-up, repetitions, statistics and output checks | `crates/bagflow-kernels/src/runner.rs`, `crates/bagflow-api/src/bench.rs` |
| 9 | HTTP API with one job queue, server-sent events, pipeline timing, parallel telemetry, sweeps | `crates/bagflow-api/src/` |
| 10 | React web app over the API | `web/src/` |
| 11 | Raw result files | `results/` |

## 1.3 Repository tree

Build outputs (`target/`, `target-novec/`, `web/node_modules/`, `web/dist/`) and the local Python virtual environment `.venv/` are left out. Sizes are bytes in the working tree.

```
.
├── Cargo.toml                 workspace: 5 member crates, shared dependency versions
├── Cargo.lock                 locked Rust dependency versions
├── rust-toolchain.toml        pins rustc 1.100.0 (profile minimal)
├── LICENSE                    placeholder: "LICENSE NOT YET CHOSEN" (no licence granted)
├── README.md                  quickstart, app pages, measured results with sources, limits
├── .gitignore                 ignores target/, node_modules/, data/, results/*.bin, results/*.csv, /bin/ …
├── .github/workflows/ci.yml   CI: cargo test --release, npm ci/build/lint on ubuntu-latest and macos-latest
├── analysis/validate.py       reads a BFLW0001 file and plots results/validation.png
├── bin/risk_mpi               compiled MPI binary (gitignored, output of scripts/run_mpi.sh)
├── configs/                   empty
├── crates/
│   ├── bagflow-core/          generator, SoA bag table, RNG streams, engines, network, scenarios, collect, aggregate
│   │   ├── src/bin/measure.rs time/memory of one engine2 run (used for results/engine2_1M_collect.txt)
│   │   └── tests/collect.rs   8 integration tests incl. the three pinned configs
│   ├── bagflow-sim/           CLI: `bagflow-sim gen`; binaries compare, scenarios, validate, scale, slice
│   ├── bagflow-kernels/       deadline-risk kernels, build.rs backend detection, runner, traced kernels, CLI table
│   ├── bagflow-api/           Axum server (lib.rs routes, jobs.rs queue, sim.rs, pipeline.rs, parallel.rs, sweep.rs, bench.rs, static_results.rs)
│   │   └── tests/api.rs       15 HTTP integration tests
│   └── bagflow-bench/         prints "Hello, world!" (dead crate)
├── data/runs/*.json           local job records written by the API (gitignored): 13 sim, 9 par, 2 sweep, 1 bench
├── docs/
│   ├── AUDIT.md               Phase 0 audit and Phase 1 status
│   ├── PRESENTATION.md        presenter script (written in this session)
│   ├── assumptions.md, backends.md, schemas.md   older notes; README says parts are out of date
│   ├── design/blueprint.md, design/parallel-studio.md   UI design documents
│   ├── benchmark 1.png, benchmark 2.png          images, not referenced by the README
│   └── papers/                empty
├── kaggle/setup.sh            clones the repo on Kaggle and installs nvcc/MPI/Rust prerequisites
├── kernels/
│   ├── cpu/openmp/risk_omp.cpp   OpenMP kernel (plain and traced)
│   ├── gpu/metal/risk_metal.mm   Metal host code + MSL shader compiled at run time
│   ├── gpu/cuda/risk_cuda.cu     CUDA naive / warp-shuffle / inline-PTX kernels
│   ├── mpi/risk_mpi.cpp          MPI read/scatter program
│   ├── CMakeLists.txt            unused (AUDIT §2.2)
│   └── cpu/{avx2,ilp,neon,scalar}/, gpu/{ptx,warp}/   .gitkeep placeholders only
├── results/                   raw output of measured runs (Appendix C lists every file)
├── scripts/                   setup.sh, start.sh, run_mpi.sh, check_env.sh
└── web/                       React app (Vite, TypeScript); package.json, vite.config.ts, src/
```

## 1.4 Languages

| Language | Where |
|---|---|
| Rust (edition 2021; `bagflow-bench` uses 2024) | `crates/*` |
| C++17 | `kernels/cpu/openmp/risk_omp.cpp`, `kernels/mpi/risk_mpi.cpp` |
| Objective-C++ and Metal Shading Language | `kernels/gpu/metal/risk_metal.mm` |
| CUDA C++ and inline PTX | `kernels/gpu/cuda/risk_cuda.cu` |
| TypeScript / React (TSX) | `web/src` |
| Python 3 | `analysis/validate.py` |
| POSIX sh / bash | `scripts/*.sh`, `kaggle/setup.sh` |

## 1.5 Dependencies and versions

**Toolchain.** `rust-toolchain.toml`: `channel = "1.100.0"`. Node: `web/.nvmrc` = `24`; `scripts/setup.sh` accepts Node ≥ 24 or 22.22+.

**Rust workspace dependencies** (`Cargo.toml` `[workspace.dependencies]`, semver requirements; exact resolved versions are in `Cargo.lock`, not reproduced here):

| Crate | Requirement | Used by |
|---|---|---|
| rand | 0.8 | core |
| rand_chacha | 0.3 | core (ChaCha8 streams) |
| rand_distr | 0.4 | core (Beta, LogNormal, Normal, Exp) |
| rayon | 1.10 | core, kernels, api |
| serde (derive) | 1 | core, api |
| serde_json | 1 | core (unused per AUDIT §6.1), sim, api |
| axum | 0.7 | api |
| tokio (rt-multi-thread, macros, net) | 1 | api |
| futures-util | 0.3 | api (SSE stream) |
| tower-http (cors) | 0.5 | api |
| tower (util, dev only) | 0.5 | api tests |
| cc (build only) | 1 | kernels `build.rs` |

**Web dependencies** (`web/package.json`, caret ranges; exact versions in `web/package-lock.json`): react ^19.3.1, react-dom ^19.3.1, react-router ^8.5.3, @tanstack/react-query ^5.108.4, recharts ^3.11.1, cytoscape ^3.35.0, lucide-react ^1.81.0, @fontsource/inter ^5.3.0, @fontsource/jetbrains-mono ^5.3.0. Dev: vite ^8.4.0, typescript ~6.0.3, tailwindcss ^4.3.5, @tailwindcss/vite ^4.3.5, @vitejs/plugin-react ^6.3.0, eslint ^10.15.0, typescript-eslint ^8.74.0, eslint-plugin-react-hooks ^7.1.1, eslint-plugin-react-refresh ^0.5.8, @eslint/js ^10.0.1, globals ^17.14.0, @types/node ^24.19.4, @types/react ^19.3.3, @types/react-dom ^19.3.0.

**Optional native backends** (README "Prerequisites"): libomp (macOS `brew install libomp`; Linux included with g++), Metal (macOS, no install), CUDA toolkit with `nvcc` and an NVIDIA GPU of compute capability 7.5+ (Linux only), Open MPI (command line only).

**Python** (`analysis/validate.py`): numpy, matplotlib. Versions: **NOT FOUND** (no requirements file).

## 1.6 Hardware and OS used for the results

| Machine | Details | Source |
|---|---|---|
| Apple M1 MacBook Air | fanless, 8 GB, 8 logical cores, rustc 1.100.0, on AC power, 27 Nov 2026; load averages printed per file | header line of every `results/r6_*.txt` |
| Apple M1 (older files) | 8 logical cores; machine name for `kernels_10M_metal.txt`, `mpi_10M.txt`, `mpi_50M.txt` is supplied by `crates/bagflow-api/src/static_results.rs:42-44`, not by the files | AUDIT §12 |
| Kaggle | Xeon @ 2.00 GHz with AVX2, 4 logical cores, Tesla T4, CUDA 13.0 | `results/kernels_10M_kaggle.txt:1`, `results/mpi_50M_kaggle.txt:1` |
| CI | GitHub `ubuntu-latest`, `macos-latest` | `.github/workflows/ci.yml` |

OS version of the M1: **NOT FOUND** in the result files.

## 1.7 How to run from a fresh clone

From `README.md` "Quickstart" and `scripts/`:

```bash
git clone <repository-url> bagflow
cd bagflow
scripts/setup.sh    # checks cargo, node (>=24 or 22.22), curl, a C++ compiler; npm ci; touch build.rs; cargo build --release -p bagflow-api
scripts/start.sh    # builds the API, starts target/release/bagflow-api, waits for /api/health, starts Vite on port 5173
# open http://localhost:5173
```

`scripts/start.sh` refuses to start if something already answers on the API address or web port, and prints `BagFlow is running: http://localhost:5173` when both answer.

Expected first result (README "What to expect"): pressing **Run baseline** (Normal, dijkstra, fcfs, 100%, 250,000 bags requested) shows **9,245** delayed bags, **3.697%**, of 250,086 simulated.

By hand:

```bash
cargo run --release -p bagflow-api                       # API on 127.0.0.1:3001
cd web && npm ci && npm run dev                          # web app on http://localhost:5173
```

Environment variables: `BAGFLOW_API_ADDR` (default `127.0.0.1:3001`, `crates/bagflow-api/src/main.rs:3`), `BAGFLOW_API_URL` (default `http://127.0.0.1:3001`, `web/vite.config.ts`), `BAGFLOW_WEB_PORT` (default `5173`, `scripts/start.sh`), `BAGFLOW_DATA_DIR`, `BAGFLOW_RESULTS_DIR` (`main.rs:8-13`), and build-time `BAGFLOW_NO_OPENMP`, `BAGFLOW_NO_METAL`, `BAGFLOW_NO_CUDA`, `LIBOMP_PREFIX`, `CUDA_HOME`, `CUDA_PATH` (`crates/bagflow-kernels/build.rs:20`).

Command-line reproduction of each result file (README "More commands" and the `# Command:` header of each `r6_*` file):

| Result | Command |
|---|---|
| `r6_gen_10M.txt` | `target/release/bagflow-sim gen --bags 10000000 --mode bench` (3 separate processes) |
| `r6_gen_50M.txt` | `target/release/bagflow-sim gen --bags 50000000 --mode bench` |
| `r6_kernels_10M.txt` | `target/release/bagflow-kernels 10000000` (3 processes) |
| `r6_mpi_50M.txt` | `scripts/run_mpi.sh results/bags_seed42.bin 8` (2 times); needs the 1.2 GB file from `cargo run --release -p bagflow-sim -- gen --bags 50000000` |
| `r6_compare_100.txt` | `target/release/compare 250000 1 100` |
| `r6_compare_70.txt` | `target/release/compare 250000 1 70` |
| `r6_scenarios.txt` | `target/release/scenarios 250000 100` |
| `r6_validation_mmc.txt` | `target/release/validate` |
| `r6_api.txt` | "Measured through the live API (release build). Jobs run one at a time." The exact requests are **NOT FOUND** (no script in the repo). |
| `engine2_1M_collect.txt` | `/usr/bin/time -l target/release/measure <bags> <scenario> <routing> <pct> <off\|on>` |

Tests: `cargo test --release`; web: `cd web && npm run build && npm run lint`.

---

# PART 2: Data

## 2.1 Origin and licence

All data is **synthetic**, produced by `crates/bagflow-core/src/generator.rs` from a master seed. No external dataset is used. Licence of the data and code: none granted (`LICENSE`: "LICENSE NOT YET CHOSEN … all rights are reserved").

## 2.2 Every dataset and data file

| Data | How produced | Size | Records | Seed | In a fresh clone? |
|---|---|---|---|---|---|
| In-memory bag table, 250k request | `generate`/`generate_par` with `target_bags: 250_000` (API default, CLI default) | — | **250,086 bags, 1,650 flights**, dataset checksum `168e0a37b06224f9` | 42 | regenerated on demand. Sources: `crates/bagflow-core/tests/collect.rs:48`, `data/runs/sim-1795756506633-1.json` `result.dataset` |
| 100k request (sweep default) | same, `target_bags: 100_000` | — | **100,212 bags**, dataset checksum `6043a7e6cf9bff92` (local record `data/runs/sweep-1795756596593-6.json` `result.dataset`; not in `results/`) | 42 | regenerated |
| 1M request | same | — | 1,000,065 bags | 42 | `results/engine2_1M_collect.txt` |
| 5M request (old engine) | same | — | 5,000,095 bags | 42 | `results/scaling_seq.txt` |
| 10M request | same | — | 10,000,168 bags | 42 | `results/r6_kernels_10M.txt` header; `r6_api.txt` |
| `results/bags_seed42.bin` | `bagflow-sim gen --bags 50000000` (writes BFLW0001 file) | 1,200,002,392 B | **50,000,099 bags** (header n, read in this session) | 42 | no (gitignored) |
| `results/flights_seed42.csv` | same command, flights | 5,408,335 B | **327,554 flights** (327,555 lines incl. header) | 42 | no (gitignored) |
| `results/bags_seed42_sample.csv` | same command, first 2,000 bags | 80,736 B | 2,000 bags (2,001 lines) | 42 | no (gitignored) |
| `data/runs/*.json` | API job records | 8,854–332,898 B each | 25 records | — | no (gitignored) |

Byte-size check of the binary file: 16-byte header + 24 bytes per bag (4+4+4+2+1+1+4+4) × 50,000,099 = 1,200,002,392 B. **MATCH** with the file size.

## 2.3 Schema of the bag table

`BagSoA` (`crates/bagflow-core/src/soa.rs:7-16`), one vector per field, all the same length. The `.bin` layout is "BFLW0001", `n` as u64 little-endian, then the eight columns in this order, little-endian (`soa.rs:58-72`).

| Field | Type | Unit | Range observed in the 50M file | Meaning |
|---|---|---|---|---|
| `id` | u32 | — | 0 … 50,000,098 | index after sorting by arrival |
| `pax` | u32 | — | — | passenger id = `flight * 512 + p`, p = passenger index on the flight (`generator.rs:97`) |
| `flight` | u32 | — | 0 … 327,553 | flight id |
| `weight_dg` | u16 | 0.1 kg | 30 … 320 (3.0–32.0 kg); mean 178.95 dg = 17.895 kg | `generator.rs:101,113` |
| `priority` | u8 | class | {0,1,2} | 0 standard, 1 priority, 2 tight connection (`types.rs:4-6`) |
| `flags` | u8 | bits | bit 0, bit 1 | bit 0 `FLAG_TRANSFER`, bit 1 `FLAG_SPECIAL` (oversize/fragile) (`types.rs:9-10`) |
| `arrival_s` | u32 | s since midnight | 4,813 … 84,166; sorted ascending | time the bag enters check-in |
| `deadline_s` | u32 | s since midnight | 13,475 … 85,100 | loading must finish by this time |

Derived from the 50M file in this session (numpy memory map, read-only): `deadline_s − arrival_s` ranges 581 … 9,499 s, mean 4,085.9 s; no bag has `arrival_s ≥ deadline_s`.

**Flight schema** (`types.rs:44-49`, `flights_seed42.csv`): `id` u32, `departure_s` u32 (seconds since midnight; observed 14,675 … 86,000), `seats` u16.

## 2.4 How the data is generated (distributions and parameters)

All from `crates/bagflow-core/src/generator.rs`.

| Quantity | Distribution / rule | Code |
|---|---|---|
| Departure bank | weighted pick of centres 07:00 (0.22), 09:30 (0.16), 12:30 (0.10), 15:00 (0.08), 18:30 (0.24), 21:00 (0.20) | `BANKS`, lines 18–25 |
| Departure time | Normal(centre, sd 45 min), clamped to [4 h, 86,000 s] | `gen_flight`, lines 57–63 |
| Seats | 76 (0.15), 150 (0.25), 180 (0.30), 220 (0.15), 300 (0.10), 350 (0.05) | `SEATS`, line 16 |
| Load factor | Beta(16, 4), mean 0.80; passengers = round(seats × lf), ≤ seats | lines 67–68 |
| Transfer passenger | Bernoulli(0.30) | `TRANSFER_SHARE`, line 31 |
| Bags per passenger | 0 (0.22), 1 (0.55), 2 (0.20), 3 (0.03) | `BAG_COUNT`, line 27 |
| Origin arrival | open = dep − 180 min, close = dep − 45 min; base = open + Beta(4, 2.2) × (close − open) | lines 72–73, 86 |
| Late origin bag | with probability 0.02, base = close + U{0..899} s | `LATE_SHARE`, lines 88–90 |
| Transfer arrival | uniform in [dep − 120 min, dep − 30 min] | lines 81–85 |
| Bag arrival | base + U{0..20} s per bag (bags of one passenger cluster) | line 100 |
| Weight | LogNormal(ln 17, 0.35) kg, clamped to [3, 32], stored ×10 rounded | lines 69, 101, 113 |
| Priority (origin) | standard 0.97, priority 0.03 | `PRIO_ORIGIN`, line 28 |
| Priority (transfer) | standard 0.80, tight 0.15, priority 0.05 | `PRIO_TRANSFER`, line 29 |
| Special flag | Bernoulli(0.02) per bag | `SPECIAL_SHARE`, line 33 |
| Deadline | dep − 20 min (origin) or dep − 15 min (transfer), floored at 0 | line 96 |
| Stopping rule | flights are generated until at least `target_bags` bags exist; output sorted stably by (arrival, flight, pax) | lines 145, 162 |

**Seeds and random streams** (`crates/bagflow-core/src/rng.rs`): ChaCha8 seeded from the master seed. `Stream::Flights = 1`, `Bags = 2`, `Screening = 3`, `Failures = 4`, `Routing = 5`. `stream_rng(master, s)` sets stream `s`; `flight_rng(master, s, flight_id)` sets stream `(s << 32) | flight_id`, so every flight has its own stream and generation order cannot change the result (`rng.rs:22-28`). `Failures` and `Routing` are unused (AUDIT §2.1). The master seed is 42 everywhere results come from (`crates/bagflow-api/src/sim.rs:19` `SEED = 42`; all CLI binaries pass 42).

**Engine randomness** (`engine2.rs:33-50`) is not drawn from a stream but from a stateless hash `u01(seed, bag, stage, k)` (SplitMix64-style `mix`), so every strategy and policy sees the same service times for the same bag at the same stage ("common random numbers", `docs/assumptions.md` Phase 4).

## 2.5 Time span and "sampling rate"

- One synthetic day. Arrivals in the 50M file run from 4,813 s (01:20:13) to 84,166 s (23:22:46); departures from 14,675 s to 86,000 s (`flights_seed42.csv`).
- The engine works in integer milliseconds (`ScheduledEvent.time_ms`, `events.rs:18`).
- Node time-series, when collected, are sampled every 60,000 simulation ms (`crates/bagflow-api/src/sim.rs:20` `SAMPLE_INTERVAL_MS`).

## 2.6 Class labels, counts and balance

There are three categorical labels in the data. None is a prediction target.

**Priority class** (50M file, counted in this session):

| Class | Count | Share |
|---|---|---|
| 0 standard | 45,954,753 | 91.909% |
| 1 priority | 1,799,165 | 3.598% |
| 2 tight connection | 2,246,181 | 4.492% |
| Total | 50,000,099 | 100% |

**Flags** (50M file): transfer 14,999,616 (29.999%), special 1,000,515 (2.001%), both 300,169.

**Deadline-risk class** (output of the kernel, Part 3.7), per result files:

| Workload | on-track | at-risk | critical | slack sum (s) | Source |
|---|---|---|---|---|---|
| 10,000,168 bags | 7,172,190 (71.72%) | 1,944,284 (19.44%) | 883,694 (8.84%) | 27,835,824,747 | `r6_kernels_10M.txt` line 4 of each run; also `kernels_10M*.txt`, `mpi_10M.txt` |
| 50,000,099 bags | 35,861,889 (71.72%) | 9,721,115 (19.44%) | 4,417,095 (8.83%) | 139,195,725,044 | `r6_mpi_50M.txt`, `mpi_50M.txt`, `mpi_50M_kaggle.txt` |

The counts sum to the bag totals (7,172,190 + 1,944,284 + 883,694 = 10,000,168; 35,861,889 + 9,721,115 + 4,417,095 = 50,000,099). **MATCH**.

**Simulation outcome** (loaded on time vs delayed) is a property of a run, not of the data; see Part 6.

**Class imbalance handling:** not applicable (no classifier is trained).

**Flight seats** (`flights_seed42.csv`, 327,554 flights): 76: 48,994 (14.96%); 150: 81,655 (24.93%); 180: 98,645 (30.12%); 220: 49,269 (15.04%); 300: 32,645 (9.97%); 350: 16,346 (4.99%). These match the configured probabilities 0.15/0.25/0.30/0.15/0.10/0.05 to within 0.1 percentage point. Mean bags per flight in the 50M file: 50,000,099 / 327,554 = 152.65.

## 2.7 Missing values

None by construction: every bag has every field (`BagSoA::push`, `soa.rs:27-36`). In API JSON, unavailable values are `null` (`crates/bagflow-api/src/lib.rs:1-2`) and the web shows `--` (`web/src/utils/format.ts` `EMPTY`).

## 2.8 Splits

**NOT FOUND / not applicable.** There is no training, validation or test split. Scenario experiments all use the same seed-42 base dataset, modified per scenario (`scenarios.rs::build`). Benchmarks run on their own seed-42 dataset generated at the requested size (`crates/bagflow-api/src/bench.rs:135`).

## 2.9 Worked example: one record end to end

Row 1 of `results/bags_seed42_sample.csv` (the first bag of the 50M dataset):

```
id,pax,flight,weight_kg,priority,flags,arrival_s,deadline_s
0,143248417,279782,17.1,0,2,4813,13882
```

1. **Flight.** `flights_seed42.csv` has `279782,15082,180`: departure 15,082 s (04:11:22), 180 seats.
2. **Passenger.** `pax = flight × 512 + p` → 143,248,417 − 279,782 × 512 = 143,248,417 − 143,248,384 = **33**: the 34th passenger of the flight.
3. **Origin or transfer.** `flags = 2` = binary 10: bit 1 (special) set, bit 0 (transfer) clear. So an origin bag, oversize/fragile.
4. **Deadline.** Origin rule: dep − 20 min = 15,082 − 1,200 = **13,882 s**. **MATCH** with `deadline_s`.
5. **Arrival window.** open = 15,082 − 10,800 = 4,282 s; close = 15,082 − 2,700 = 12,382 s. 4,813 lies in [4,282, 12,382], consistent with the Beta draw.
6. **Weight.** 17.1 kg → stored `weight_dg = 171`.
7. **Deadline-risk kernel** (`crates/bagflow-kernels/src/lib.rs:28-32`): `est = 1200 + 600 × special + 300 × transfer = 1200 + 600 × 1 + 300 × 0 = 1,800 s`. `slack = deadline − arrival − est = 13,882 − 4,813 − 1,800 = 7,269 s`. Classes: at-risk if slack < 1,800, critical if slack < 600. 7,269 ≥ 1,800, so class **0 (on-track)**; output byte `out[i] = 0`.
8. **Simulation.** In `engine2` the bag would enter Check-in (node 0) at 4,813,000 ms, then go to Identification (node 1), a screening line (2 or 3), a sorter (4–6), and loading area `7 + flight % 3` = 7 + (279,782 mod 3) = 7 + 2 = node **9** (Loading area 3) (`engine2.rs:209`). It is delayed if its loading service ends after 13,882,000 ms (`engine2.rs:443`). This bag's actual simulated times are **NOT FOUND**: the 50M file was never simulated in a saved result.

---

# PART 3: Methods and algorithms

The stages run in this order inside one API simulation job (`crates/bagflow-api/src/sim.rs:168-260`, `execute`): generate → build network and scenario → classify (batch kernel) → simulate (`engine2`) → aggregate → summarise. Sweeps, parallel runs and benchmarks reuse the same building blocks.

## 3.1 Sequential generator

**Idea.** Draw flights one by one from a single `Flights` stream; for each flight draw its bags from that flight's own `Bags` stream; stop once `target_bags` is reached; sort by arrival.

**Implementation.** `generate` → `generate_traced(cfg, usize::MAX, t0)` (`generator.rs:132-171`). `chunk_flights` only groups flights into task records for telemetry; it never changes output.

**Complexity.** O(F + N log N) for F flights and N bags (the stable sort dominates).

## 3.2 Parallel generator (Rayon)

`generate_on(pool, cfg, chunk_flights, t0)`, `crates/bagflow-core/src/generator.rs:235-319`. Core of the batch loop (`generator.rs:248-299`, abridged to the logic):

```rust
let per_flight_bags = if flights.is_empty() { BAGS_PER_FLIGHT_GUESS } else { (recs.len() / flights.len()).max(1) };
let batch_len = ((cfg.target_bags - recs.len()).div_ceil(per_flight_bags) + 1).min(FLIGHT_BATCH);
let batch: Vec<Flight> = (0..batch_len).map(|_| { let f = gen_flight(&mut frng, id); id += 1; f }).collect();
let chunks = batch.par_chunks(chunk_flights).with_max_len(1).enumerate()
    .map(|(i, part)| trace::task(t0, first_id + i, || {
        let per_flight: Vec<Vec<BagRec>> = part.iter().map(|f| { let mut v = Vec::new(); gen_bags(cfg.seed, f, &mut v); v }).collect();
        (per_flight.iter().map(|v| v.len() as u64).sum(), per_flight)
    })).collect();
for (f, v) in batch.into_iter().zip(per_flight) {
    if recs.len() >= cfg.target_bags { continue; }
    recs.extend(v); flights.push(f);
}
```

Line by line:
1. Estimate bags per flight: 150 for the first batch (`BAGS_PER_FLIGHT_GUESS`), then the running average.
2. Size the batch to what is still missing plus one, capped at `FLIGHT_BATCH = 2048` flights.
3. Draw the batch's flights **sequentially** from the shared flight stream (cheap, and it keeps flight ids and order identical to the sequential version).
4. Split the batch into chunks of `chunk_flights` flights; `with_max_len(1)` makes each chunk one Rayon task.
5. Each task generates the bags of its flights, each flight from its own `flight_rng` stream, and records a `Task` (id, worker thread index, start/end ns, bags produced).
6. `collect()` keeps chunk order, so per-flight results come back in flight order.
7. Append flights in order and **stop exactly where the sequential version stops**; surplus flights are computed but dropped.

After the loop: `par_sort_by_key((arrival, flight, pax))` (stable) and parallel column building (`generator.rs:304-316`).

**Parameters.** `FLIGHT_BATCH = 2048` (line 219), `BAGS_PER_FLIGHT_GUESS = 150` (line 221), `CHUNK_FLIGHTS = 16` (line 223, used by `generate_par` and by the API pipeline, `pipeline.rs` `generate_phase`). The API's parallel-run default chunk for `generate` is `max(16, ceil(ceil(bags/150)/4096))` (`parallel.rs:124-128`), i.e. 17 at 10,000,000 bags.

**Correctness guarantee.** Tests `parallel_matches_sequential` (threads 1, 2, 4) and `traced_runs_match_and_cover_every_bag` (targets 1, 150, 5,000, 330,000; chunks 1, 13, 100,000) assert equal checksums (`generator.rs:326-354`).

## 3.3 The airport network

`airport_network(k)`, `crates/bagflow-core/src/network.rs:54-101`. `k` is the server multiplier.

| Id | API name (`sim.rs` `node_name`) | Kind | Servers (×k) | Mean service |
|---|---|---|---|---|
| 0 | Check-in | CheckIn | 40 | 5,000 ms |
| 1 | Identification | Identification | 4 | 400 ms |
| 2 | Screening A | Screening | 10 | 1,800 ms |
| 3 | Screening B | Screening | 6 | 2,500 ms |
| 4, 5, 6 | Sorter 1, 2, 3 | Sorter | 4 each | 1,000 ms |
| 7, 8, 9 | Loading area 1, 2, 3 | Loading | 12 each | 4,000 ms |

Edges (18, all `capacity_per_min: 600`, which the engine never reads): 0→1 6 s; 1→2 8 s; 1→3 9 s; screening→sorter `10 s + 2 s × d` where d = j for line A and 2 − j for line B; sorter i → loading j `9 s + 2 s × |i − j|`.

**Capacity percentage** (`sim.rs:118-122` `scale_servers`; identical code in `compare.rs`, `measure.rs`, `sweep.rs::simulate`): `servers = max(1, floor(servers × pct / 100))`, applied after the multiplier.

## 3.4 `engine2` event loop

**Idea.** A min-heap of `ScheduledEvent { time_ms, kind, bag_id, seq, node }` ordered by `(time_ms, kind, bag_id, seq)`; same-time ties are broken by kind in declaration order Repair < Failure < ServiceComplete < TransitComplete < Arrival (`events.rs:4-23`). Each node has `cap[n]` servers, `busy[n]` in use, and a min-heap queue of `(policy key, seq, bag, service ms, enqueued at)`.

Main loop, `crates/bagflow-core/src/engine2.rs:398-424`:

```rust
for i in 0..bags.len() {
    g.push(bags.arrival_s[i] as u64 * 1000, EventKind::Arrival, i as u32, 0);
}
for (i, o) in outages.iter().enumerate() {
    let nd = match o.target { Target::Node(x) => x, Target::Edge(_) => 0 };
    g.push(o.start_s as u64 * 1000, EventKind::Failure, i as u32, nd);
    g.push(o.end_s as u64 * 1000, EventKind::Repair, i as u32, nd);
}
while let Some(Reverse(ev)) = g.heap.pop() {
    g.sample_before(ev.time_ms);
    end_ms = ev.time_ms;
    match ev.kind {
        EventKind::Arrival => g.arrive(ev.time_ms, ev.bag_id, 0),
        EventKind::TransitComplete => g.arrive(ev.time_ms, ev.bag_id, ev.node),
        EventKind::ServiceComplete => g.complete(ev.time_ms, ev.bag_id, ev.node),
        EventKind::Failure => g.outage(ev.time_ms, ev.bag_id as usize, true, outages),
        EventKind::Repair => g.outage(ev.time_ms, ev.bag_id as usize, false, outages),
    }
```

1. Every bag gets an Arrival event at check-in (node 0) at its arrival time in ms.
2. Every outage gets a Failure event at its start and a Repair event at its end; the bag-id field carries the outage index.
3. Pop the earliest event.
4. Before advancing the clock, record any due time-series samples (observation only).
5. Arrival and TransitComplete both mean "the bag reaches a node": `arrive`.
6. ServiceComplete frees a server and moves the bag on: `complete`.
7. Failure/Repair change a node's capacity or an edge's availability: `outage`.

**State changes** (`engine2.rs:268-321`):

- `arrive(t, bag, n)`: `arrivals[n] += 1`; draw the service time `dur = dur_ms(bag, n)`; if `busy[n] < cap[n]` start service now, else push `(key(bag, dur), seq, bag, dur, t)` onto the node's queue and update `max_q[n]`.
- `start(t, bag, n, dur, enq)`: `busy[n] += 1`; `wait_ms[n] += t − enq`; `busy_ms[n] += dur`; schedule ServiceComplete at `t + dur`.
- `complete(t, bag, n)`: `busy[n] −= 1`; if a server is free, pop the queue head and start it; if `n` is a Loading node record `finish[bag] = t` and stop; otherwise pick `(to, travel) = next_hop(t, bag, n)` and schedule TransitComplete at `t + travel` at node `to`.

There is **no explicit per-bag state machine in `engine2`** (AUDIT §1 finding 1: "It does not use `BagState`"). Bag statuses shown by the API are derived from hop histories afterwards (AUDIT §11.3).

**Service time** (`engine2.rs:40-50, 163-171`):

```
u01(seed, bag, stage, k) = ((mix(seed XOR mix((bag << 16) | (stage << 8) | k)) >> 11) + 0.5) / 2^53
z = sqrt(−2 ln u1) · cos(2π u2)                      (Box–Muller, u1 = u01(…,k), u2 = u01(…,k+1))
service = exp(ln(mean) − σ²/2 + σ z),  σ = 0.4       (lognormal with the node's mean)
inspection (screening only): with probability 0.05 (u01(…, stage 2, k=2) < 0.05) add a lognormal hold, mean 20,000 ms
dur = max(1, floor(service + hold)) ms
```

Stage codes: CheckIn 0, Identification 1, Screening 2, Conveyor/Sorter/Transfer 3, Loading 4 (`engine2.rs:51-59`).

**Complexity.** Each bag generates a bounded number of events (5 hops × 2 events plus its arrival), each a heap operation: O(E log E) for E events.

## 3.5 Routing strategies

**Free-flow distance table** (`engine2.rs:81-109`). For each loading node `dest`, Dijkstra on the reversed graph gives `dist[dest][v]` = time from arriving at v until finishing at dest = sum of mean service times on the path + travel times. Bag b is bound for loader index `flight[b] mod 3` (`engine2.rs:209`).

**Next hop** (`engine2.rs:207-230`): candidates are the outgoing edges whose target can reach the bag's loader, with cost `c = travel + dist[loader][target]`. If none of them is up, all candidates are used ("no live alternative: use the edge anyway", line 218).

| Strategy | Rule | Code |
|---|---|---|
| `dijkstra` | the first candidate with minimum c | `first_min`, lines 111–114 |
| `ecmp` | among candidates with `c × 1000 ≤ min × 1001` (within 0.1%), pick index `bag mod count` | `ecmp`, lines 115–120 |
| `congestion` | minimise `c + wait_est(target)`, where `wait_est(v) = max(0, (queue_v + busy_v + 1 − s_v)) / s_v × mean_service_v`, `s_v = max(1, cap_v)` | `dynamic`, `wait_est`, lines 187–205 |
| `deadline` | if slack `deadline_ms − t < 20 min` use `congestion`, else `ecmp` | lines 226–229, `URGENT_MS` line 13 |

Caveat (AUDIT §6.3): Dijkstra costs and the congestion estimate use base mean service, without the extra inspection time.

## 3.6 Queue policies

Queue key, smaller served first (`engine2.rs:173-185`); ties broken by `seq` (insertion order):

| Policy | Key |
|---|---|
| `fcfs` | 0 (so pure insertion order) |
| `priority` | tight 0, priority 1, standard 2 |
| `edf` | `deadline_s × 1000` |
| `spt` | the bag's sampled service time `dur` |

## 3.7 Outages

`Outage { target, start_s, end_s, factor }` (`engine2.rs:125-127`). Node outage: `cap = floor(servers × factor)` at Failure; at Repair `cap = servers` and queued bags start until servers are full (`engine2.rs:232-248`). Bags already in service finish, so `busy` can exceed `cap` just after a failure (AUDIT §4). Edge outage: `edge_up[e] = false` until Repair.

## 3.8 The six scenarios

`crates/bagflow-core/src/scenarios.rs:40-82`. Window constants: `W0 = 17:00`, `W1 = 19:00`, `OUTAGE_S = 90 min`. Randomness from a stateless hash `h01(seed, i, salt)` (lines 28–34).

| Scenario | Change | Salt |
|---|---|---|
| Normal | none | — |
| PeakSurge | for each bag arriving in [17:00, 18:00) with h01 < 0.5, add a clone arriving `+floor(h01 × 600)` s later (capped at deadline − 1) | 1, 2 |
| ConveyorFailure | edge 2→4 (Screening A → Sorter 1) down 17:00–18:30 | — |
| ScreeningDelay | node 2 (Screening A) at factor 0.4 for 17:00–18:30 | — |
| ConnectingRush | transfer bags arriving in [17:00, 18:30) with h01 < 0.6 become tight, deadline = min(deadline, arrival + 30 min) | 3 |
| SorterOverload | bags arriving in [17:00, 19:00) with h01 < 0.6 get `flight −= flight mod 3`, so they go to loader index 0 = Loading area 1 | 4 |

The API reports the original flight for redirected bags (`sim.rs:179` `original_flight`).

## 3.9 Run statistics and engine checksum

After the loop (`engine2.rs:430-485`):

```
loaded   = #{b : finish_b > 0 and finish_b ≤ deadline_b × 1000}
delayed  = #{b : finish_b > deadline_b × 1000}
unfinished = #{b : finish_b = 0}
sojourn_b = floor((finish_b − arrival_b × 1000) / 1000)  s       (finished bags)
mean_sojourn = Σ sojourn_b / max(1, #finished)
p95_sojourn  = the element at index min(m − 1, floor(0.95 m)) of the sojourn list (select_nth_unstable)
avg_wait_s[n] = wait_ms[n] / max(1, arrivals[n]) / 1000
util[n]       = busy_ms[n] / (servers_n × span),  span = max(1, end_ms − first_arrival_ms)
checksum      = FNV-1a 64 over the little-endian bytes of finish_b for every bag in id order
```

FNV-1a constants: offset `0xcbf29ce484222325`, prime `0x100000001b3`. Note that `util` uses the **nominal** server count even during an outage (AUDIT §4).

## 3.10 Collection (observation only)

`crates/bagflow-core/src/collect.rs`. Options: `history` (hop records `arrive_ms, start_ms, end_ms` per bag per node visited) and `sample_interval_ms` (per-node samples of queue length, busy servers, capacity, cumulative arrivals and completions). Wait-histogram upper bounds (ms, inclusive): `[0, 1000, 5000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000]` plus an open-ended last bin (`collect.rs:15-16`). Module comment: "Nothing here schedules events, draws random numbers or feeds back into the simulation, so results are the same with collection on or off" (`collect.rs:1-5`). This is tested in `crates/bagflow-core/tests/collect.rs` (`baseline_checksums_unchanged_with_collection_off_and_on`, `collection_changes_nothing_in_any_scenario`).

## 3.11 Aggregation (sequential fold and parallel reduction)

`crates/bagflow-core/src/aggregate.rs`. Per node: visits, total wait, total service, max wait, wait histogram. Per run: loaded on time, delayed, unfinished, total sojourn ms. All sums are integers, so merge order cannot change the result (module comment, lines 1–3).

Parallel version, `aggregate.rs:150-173`:

```rust
let parts: Vec<(Task, Aggregate)> = pool.install(|| {
    (0..n.div_ceil(chunk)).into_par_iter().with_max_len(1).map(|i| {
        trace::task(t0, i, || {
            let r = chunk_range(i, chunk, n);
            let size = r.len() as u64;
            let mut part = Aggregate::empty(input.nodes.len());
            part.fold(input, r);
            (size, part)
        })
    }).collect()
});
let result = trace::stage(&mut stages, t0, "merge", false, || {
    parts.iter().fold(Aggregate::empty(input.nodes.len()), |acc, p| acc.merge(&p.1))
});
```

1. Split the bag index range into chunks; each chunk is one Rayon task.
2. Each task folds its bags into a private partial aggregate (no sharing, no locks).
3. `collect()` returns partials in chunk order.
4. One thread merges the partials (recorded as the `merge` stage). This serial merge is visible in the Parallel Execution Studio.

Chunk size in the pipeline: `max(4096, ceil(bags / (threads × 8)))` (`pipeline.rs` `aggregate_chunk`). The API checks the aggregate against the engine's own totals (`pipeline.rs` `matches_engine`: loaded/delayed/unfinished, per-node visits, wait histograms, average waits) and fails the job if they differ (`sim.rs:208-211`).

## 3.12 Deadline-risk kernel (all backends)

**Formula** (`crates/bagflow-kernels/src/lib.rs:28-32`, repeated in every backend):

```
est_b   = 1200 + 600 · special_b + 300 · transfer_b           seconds (special = flags bit 1, transfer = flags bit 0)
slack_b = (deadline_b − arrival_b − est_b)  as wrapping u32 → i32
class_b = [slack_b < 1800] + [slack_b < 600]                  0 on-track, 1 at-risk, 2 critical
output  = counts [n − LT, LT − CR, CR] with LT = Σ[slack < 1800], CR = Σ[slack < 600], and Σ slack_b (i64)
```

AUDIT §1 finding 2: the estimate is a fixed formula and "its output feeds neither routing nor queueing".

**Scalar** (`lib.rs:41-59`): one loop over i computing `s`, `a = (s < 1800)`, `b = (s < 600)`, `out[i] = a + b`, accumulating `lt, cr, sm`.

**ILP** (`lib.rs:62-82`): 4 bags per iteration with 4 independent accumulators, then the tail.

**Rayon TLP** (`lib.rs:85-98`): `out.par_chunks_mut(1 << 16)`; each 65,536-bag chunk runs any `Kernel` (ILP, NEON, AVX2) and partial `Out`s are combined with `reduce(Out::default, Out::merge)`. Backends `rayon-ilp`, `rayon-neon`, `rayon-avx2`.

**OpenMP** (`kernels/cpu/openmp/risk_omp.cpp:18-35`):

```cpp
uint64_t lt = 0, cr = 0;
int64_t sm = 0;
#pragma omp parallel for reduction(+:lt,cr,sm) schedule(static)
for (long long i = 0; i < (long long)n; i++) {
    uint32_t f = fl[i];
    uint32_t est = 1200u + 600u * ((f >> 1) & 1u) + 300u * (f & 1u);
    int32_t s = (int32_t)(dl[i] - arr[i] - est);
    uint8_t a = (s < 1800), b = (s < 600);
    out[i] = a + b;
    lt += a; cr += b; sm += s;
}
counts[0] = n - lt; counts[1] = lt - cr; counts[2] = cr; *slack_sum = sm;
```

1–2. Three accumulators. 3. OpenMP splits the loop into equal contiguous blocks per thread (`schedule(static)`) and gives each thread private copies of `lt, cr, sm`, summed at the end (`reduction`). 5–6. The risk formula. 7–9. Class byte and accumulation. 11. Convert to the three class counts. Thread count: OpenMP's default (`omp_get_max_threads()`, line 12); the plain kernel cannot be told a thread count. The traced variant `bf_risk_omp_traced` (lines 41–76) takes `num_threads(threads)` and records per-chunk worker and times.

**NEON** (`lib.rs:123-170`): 8 bags per loop iteration as two 4-lane u32 vectors; flags widened u8→u16→u32; masks from `vcltq_s32` (all ones where true), so `lt = lt − mask` adds 1; `vpadalq_s32` accumulates slack pairwise into 64-bit lanes; class bytes narrowed and stored with `vst1_u8`.

**AVX2** (`lib.rs:176-234`): 8 bags per iteration in 256-bit registers; masks via `_mm256_cmpgt_epi32`; slack accumulated in two 4×i64 vectors; class bytes packed with `_mm256_shuffle_epi8`. Runtime check `is_x86_feature_detected!("avx2")`.

**Metal** (`kernels/gpu/metal/risk_metal.mm:13-59`): one GPU thread per bag computes the class; `simd_sum` reduces `lt, cr, sm` within a SIMD group; one value per SIMD group goes to threadgroup memory; thread 0 writes one partial triple per threadgroup; the CPU sums the partials. Threadgroup size = `min(256, maxTotalThreadsPerThreadgroup)` rounded down to a multiple of 32 (lines 101–104). Buffers are shared memory, so "copy in/out is a memcpy" (`r6_kernels_10M.txt`).

**CUDA** (`kernels/gpu/cuda/risk_cuda.cu`), launched with 256 threads per block (lines 177–179):

| Variant | Reduction | Lines |
|---|---|---|
| `k_naive` ("naive atomics") | every thread does 3 global `atomicAdd`s | 19–30 |
| `k_warp` ("warp shuffle") | `__shfl_down_sync` tree over 32 lanes (offsets 16, 8, 4, 2, 1), one set of atomics per warp | 32–57 |
| `k_ptx` ("warp ptx") | inline PTX `vote.sync.ballot` + `popc` for the two counts, `shfl.sync.down` for slack, one set of atomics per warp | 59–96 |

Build target `-gencode=arch=compute_75,code=sm_75` (T4) (`build.rs` CUDA section).

**MPI** (`kernels/mpi/risk_mpi.cpp`): rank r gets bags `[n·r/size, n·(r+1)/size)`. Mode 0 `read`: each rank reads its own slices of the arrival, deadline and flags columns at byte offsets `16 + 16n`, `16 + 20n`, `16 + 15n` (lines 79–82). Mode 1 `scatter`: rank 0 reads all three columns and sends slices with `MPI_Scatterv` (lines 84–98). The load is timed once between barriers (lines 74–101). Compute is repeated 10 times; each repetition takes the slowest rank (`MPI_Reduce … MPI_MAX`) and the best repetition is kept; the three totals are combined with `MPI_Reduce … MPI_SUM` (lines 103–123). `scripts/run_mpi.sh` runs ranks 1, 2, 4, 8 for each mode and computes `compute speedup = compute_1 / compute_p` and `end-to-end = (load+compute+reduce)_1 / (load+compute+reduce)_p` per mode (awk program in the script).

## 3.13 Backend detection (`build.rs`)

`crates/bagflow-kernels/build.rs`. Only a C++ compiler is required. For each optional backend the build either sets a `cfg` flag (`has_openmp`, `has_metal`, `has_cuda`) or compiles the reason into an environment variable read at run time.

| Backend | Built when | Otherwise the reason is |
|---|---|---|
| OpenMP | not `BAGFLOW_NO_OPENMP`; macOS: `omp.h` under `$LIBOMP_PREFIX` or `/opt/homebrew/opt/libomp` or `/usr/local/opt/libomp`, compiled with `-Xclang -fopenmp`, and a link probe passes; Linux: the compiler builds an OpenMP probe | e.g. `libomp not found (install it with: brew install libomp)`; stored as `BAGFLOW_OPENMP_REASON`. The kernel file is always built (one-thread form) |
| Metal | macOS and not `BAGFLOW_NO_METAL` and the host code compiles | `Metal is only built on macOS`, or the compile error; `BAGFLOW_METAL_REASON` |
| CUDA | Linux and not `BAGFLOW_NO_CUDA`, `nvcc` found (`$CUDA_HOME/bin`, `/usr/local/cuda/bin`, `PATH`) and `libcudart_static.a` found | `CUDA is only built on Linux with nvcc`, `nvcc not found (needs the CUDA toolkit)`, `nvcc was found but libcudart was not (set CUDA_HOME)`; `BAGFLOW_CUDA_REASON` |

At run time `Backend::availability()` (`runner.rs:86-104`) reports, e.g., `NEON needs an aarch64 CPU`, `AVX2 needs an x86_64 CPU with AVX2`, `OpenMP was not built: …`, `Metal was not built: …`, `CUDA was not built: …`, and for MPI always `live MPI runs are not wired into the runner; see the static results`.

## 3.14 Benchmark statistics

`crates/bagflow-api/src/bench.rs:114-123`:

```rust
let mut v = values.to_vec();
v.sort_by(f64::total_cmp);
let n = v.len();
let mean = v.iter().sum::<f64>() / n as f64;
let median = if n % 2 == 1 { v[n / 2] } else { (v[n / 2 - 1] + v[n / 2]) / 2.0 };
let std = (n > 1).then(|| (v.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1) as f64).sqrt());
Stats { mean, median, std, min: v[0], max: v[n - 1] }
```

Sort; arithmetic mean; median = middle value, or the **average of the two middle values** for an even count; sample standard deviation with n − 1; min and max. Speedup = median scalar time / median backend time (`bench.rs:192`). Parallel efficiency = `100 × (median one-thread time of efficiency_baseline / median backend time) / threads`, thread backends only (`bench.rs:211`), with efficiency baselines OpenMP→scalar, rayon-ilp→ilp, rayon-neon→neon, rayon-avx2→avx2 (`runner.rs` `efficiency_baseline`). Every repetition, warm-ups included, is checked against the scalar output (`runner.rs` `repeat`).

The command-line kernel tool (`crates/bagflow-kernels/src/main.rs:6-21`) instead reports **best of 10**, `M bags/s = n / best / 1e6`, `GB/s = n × 10 bytes / best / 1e9`, and speedup over the scalar best.

## 3.15 Pipeline timing and Amdahl

`crates/bagflow-api/src/pipeline.rs`. Repetitions after one untimed warm-up, alternating baseline and parallel: generate 3, classify 9, aggregate 5, simulate 1 (`pipeline.rs:18-21`). Each phase time is the **median** of its repetitions (`stats` above). Formulas (`pipeline.rs:231-255`):

```
other           = scenario_setup_ms + summarise_ms
eligible_base   = median(gen baseline) + median(classify scalar) + median(aggregate sequential)
eligible_par    = median(gen rayon)    + median(classify backend) + median(aggregate rayon)
baseline_total  = eligible_base + simulate_ms + other
parallel_total  = eligible_par  + simulate_ms + other
p               = eligible_base / baseline_total               ("parallelisable_fraction")
max_speedup     = 1 / (1 − p)                                  (Amdahl ceiling)
full speedup    = baseline_total / parallel_total
eligible speedup= eligible_base / eligible_par
phase speedup   = median baseline / median parallel
```

The API's own definitions: "full … is a composed total, not one end-to-end timing" and "Generation keeps some serial steps, so this is an upper bound" (`pipeline.rs:261-266`). A worked example from a real run is in Part 5.4.

## 3.15a Operational parallel mode (`crates/bagflow-core/src/operational.rs`)

An optional precompute of the independent per-bag work that `engine2` needs, run before the event loop either sequentially or on a Rayon pool. The event loop, queues, server allocation and event order stay sequential in `engine2`. Workers only read shared data and return their own chunk.

**Task kinds** (`TaskKind`), run one after the other because route+service needs the flight grouping:

| Kind | Pure per-range function | Output per bag |
|---|---|---|
| `checkin` (check-in registration) | `checkin(cx, range)` | arrival time in ms (`arrival_s × 1000`) |
| `flight_grouping` | `flight_grouping(cx, range)` | loading-area index (`flight % loaders`) |
| `route_service` (dijkstra and ecmp only, no edge outage) | `route_service(cx, loader, range)` | every hop of the bag's route from node 0 to its loader: `Hop {node, next, dur, travel}`, where `dur` is the service time at that node |

`route_service` walks the route with the same functions the event loop uses: `engine2::candidates` (outgoing candidates, preferring live edges), `engine2::static_pick` (`first_min` for dijkstra, `ecmp` for ecmp) and `engine2::service_ms` (the lognormal service draw plus the screening hold). Routes longer than 255 hops are refused by an assertion (the hop cursor is a `u8`).

**When routes are not precomputed** (`route_precompute`): congestion routing reads live queue lengths; deadline routing reads the current time and live queues; any routing with an edge outage (ConveyorFailure) depends on which edges are up at that time. In those cases only `checkin` and `flight_grouping` run, and `routes_note` says why. Node outages change capacity only, so they do not block route precompute.

**Chunk planning** (`plan(n, workers)`): `workers × TASKS_PER_WORKER` (4) equal contiguous ranges, `size = ceil(n / tasks)`, so at least 4 tasks per worker (fewer only if there are fewer bags than tasks). The sequential version (`pool: None`) and the parallel version (`pool: Some`) call the same function over the same ranges. Each task records a `TaskRecord {id, kind, worker (rayon::current_thread_index, 0 when sequential), start_ms, end_ms (from the start of the job), size}`.

**Equality guarantee**: `Precomputed` equality compares seed, strategy, `arrival_ms`, `loader` and routes, and ignores telemetry. `Routes` equality compares every bag's hop list, so it does not depend on how bags were split into chunks.

**How `engine2` consumes it** (`run_with_pre`, `run_collected_pre`): `simulate` asserts the precompute matches the bag count, seed and strategy. Arrival events are still pushed one by one in bag order (the push order fixes `seq`, which breaks time ties), using `arrival_ms`. `next_hop` uses the precomputed loader. With routes, `arrive` takes `dur` from the bag's current hop, and `complete` takes `(next, travel)` from it and advances a per-bag cursor. Without routes, the existing in-loop path runs.

**Why results cannot change (the gate)**: `engine2` draws its random numbers with `u01(seed, bag, stage, k)`, a stateless SplitMix-style hash: a counter-based per-bag RNG, not a shared stream consumed in event order. A value is the same whichever worker computes it and whenever. The engine checksum (FNV over finish times) depends only on the event loop, which sees bit-identical inputs.

**API** (`crates/bagflow-api/src/sim.rs`, `pipeline.rs`): `SimConfig.operational_parallel` (bool, default false) and `workers` (default logical cores, validated in the same range as `threads`). When set, `pipeline::precompute_phase` runs the sequential and parallel precompute alternately (one warm-up plus `PRECOMPUTE_REPS` = 3 timed), fails the job if any output differs, and hands the last parallel output to the event loop. The pipeline report then has a fifth phase `precompute` (counted in the Amdahl eligible phases), and the job reports progress phase `precomputing`. Every run result has an `operational` block, served by `GET /api/simulations/:id` and `/metrics`: `enabled`, `des_ms`, `total_ms` (parallel precompute median + `des_ms`, or `des_ms` alone without the mode), `routes_precomputable`, `routes_note`, `sequential_parts`, `definitions`, and with the mode `workers`, `tasks_per_worker`, `parallel_parts`, `routes_precomputed`, `precompute {sequential_ms, parallel_ms, samples, speedup, efficiency, identical_to_sequential}` and `tasks` (from the last parallel repetition).

**Benchmark binary** (`crates/bagflow-core/src/bin/operational_bench.rs`): Normal / dijkstra / fcfs / 100%, stats only (`run_with`, no history collection), default sizes 250,000 and 1,000,000 bags requested. Per worker count 1, 2, 4, 8, three repetitions, alternating the plain sequential run, the sequential precompute, the parallel precompute and the loop with the precompute; every run's checksum is asserted. Prints medians as TSV.

**Web**: the page `Parallel Airport Operations` (`web/src/pages/ParallelOperationsPage.tsx`, see 9.4). Its worker timeline is a replay of the recorded precompute tasks, not live activity, and has no lanes for the event loop. Screening and sorting queues are labelled Sequential.

## 3.16 Parallel runs (telemetry)

`crates/bagflow-api/src/parallel.rs`. One workload (`generate`, `classify`, `aggregate`) is run sequentially and on a chosen backend, each with one warm-up then `repetitions` timed runs, alternating. The run shown on each side is the one with the **median wall time, the lower middle one for an even count** (`parallel.rs:174-175` `median_run`). Speedup = sequential wall / selected wall of those shown runs (`parallel.rs:505`). Every timed repetition's checksum must match the sequential one (`matches_sequential`). Limits: bags 1,000–10,000,000 (aggregate 1,000–1,000,000), repetitions 1–10, at most 4,096 tasks (`parallel.rs:22-32`). Default chunk for classify/aggregate: `max(1024, ceil(bags/64))` bags.

## 3.17 Sweep scheduler

`crates/bagflow-api/src/sweep.rs`. Grid = scenarios × routings × policies × capacity percentages (`grid`, lines 127+). Passes: 1 thread first, then each requested thread count ≠ 1 (`passes`, lines 121–125). Execution (`execute`, lines 305+): generate the dataset once with `generate_par`; build one read-only `Setup` per scenario; run one untimed warm-up simulation; then for each pass run the whole grid on a fresh Rayon pool with `grid.par_iter().with_max_len(1)` (one experiment per task, work stealing), recording worker, start and end per experiment (`Pass::run`, lines 228–262). Each experiment is `run_with` (collection off) after `scale_servers` (`simulate`, lines 192–196). Speedup = one-thread wall / wall; efficiency = `100 × speedup / threads`; consistency compares every experiment's full `Outcome` (including the engine checksum) with the one-thread pass (`mismatches`). Limits: bags 1,000–500,000; at most 384 experiments; at most 8 thread counts; at most 500,000,000 simulated bags over all passes (`sweep.rs:22-26`).

## 3.18 Job queue and server-sent events

`crates/bagflow-api/src/jobs.rs`. One worker thread (`bagflow-worker`) takes jobs from a channel in submission order and holds a run lock while each runs, so **at most one job runs at a time** (`worker`, lines 243–305). At most `MAX_QUEUED = 8` jobs may wait; a ninth gets HTTP 429 `queue_full` (`submit`, lines 154–191). Job ids are `{sim|bench|par|sweep}-{created_ms}-{counter}`. Each record is written to `data/runs/<id>.json` (via a `.tmp` file and rename) **before** it is shown as finished (`save`, lines 307–312). The 3 newest simulations keep their full `SimData` in memory (`DEFAULT_RETAIN = 3`, `lib.rs:33`; eviction lines 280–283). `config_hash` = FNV-1a 64 of the config JSON string (lines 115–122).

Progress is a `tokio::sync::watch` value `{status, phase, done, total, error, detail?}`. The SSE endpoints send event name `progress` while running and `done` or `failed` at the end, then close (`lib.rs` `sse`). Simulation phases: `queued`, `generating`, `classifying`, `simulating` (with `done/total` bags), `aggregating`, `summarising`, `done`/`failed`. Sweep phases: `generating`, `preparing`, `warming_up`, `sweeping` (with a `detail` object of the current pass).

## 3.19 Facility status display rule

`crates/bagflow-api/src/sim.rs:26-29, 252-282`. For each sample and node, over the trailing 15 samples: `u = Σ busy / Σ capacity`; Congested if u ≥ 0.95, High if u ≥ 0.75, else Normal; Offline if capacity is 0 at the sample. Whole-run status = worst status over all samples, ignoring offline ones. The API states: "API display rule applied to engine samples; not an engine output" (`sim.rs:136`).

## 3.20 Older engine, state machine and M/M/c validation

- `engine.rs`: FCFS engine on the 6-node chain `slice_network()` (`network.rs:12-50`: Check-in 40×5 s, Identification 4×0.4 s, Screening 16×2 s, Conveyor 200×20 s, Sorter 8×1 s, Loading 30×4 s), with the 12-state `BagState` machine and an event log. Used by `slice`, `scale`, `validate` and tests.
- `state.rs`: 12 states CheckedIn, Identified, Screening, Cleared, InTransit, Sorted, TransferPending, Loading, Loaded, Delayed, Misrouted, HeldForInspection; Loaded and Delayed are terminal; any non-terminal state may go to Delayed (`state.rs:38-60`).
- `queueing.rs`: Erlang C and M/M/c mean queue wait

```
a = λ/μ,  ErlangC(c, a) = [a^c/c! · 1/(1 − a/c)] / [Σ_{k=0}^{c−1} a^k/k! + a^c/c! · 1/(1 − a/c)]
W_q = ErlangC(c, λ/μ) / (cμ − λ)
```

  with μ = 1/100 s⁻¹ (`MEAN_SERVICE_MS = 100_000`), λ = ρcμ, Poisson arrivals stored at 1 s resolution, exponential service, no holds (`queueing.rs:8-74`). Simulated W_q = total wait / arrivals. The `validate` binary passes a case if `|error| < 5%`, `|util − ρ| < 0.02` and every customer completed (`crates/bagflow-sim/src/bin/validate.rs`).

## 3.21 Every checksum in the project

| Checksum | Over | Algorithm | Code |
|---|---|---|---|
| Dataset checksum | every column of `BagSoA` in field order | FNV-1a 64 over LE bytes | `soa.rs:39-56` |
| Engine checksum (`engine2`) | `finish_ms` of every bag | FNV-1a 64 | `engine2.rs:464-470` |
| Event-log checksum (`engine.rs`) | (time, bag, from, to, node) of every log event | FNV-1a 64 | `engine.rs:219-232` |
| Aggregate checksum | every field of `Aggregate` | FNV-1a 64 | `aggregate.rs:95-109` |
| Kernel output check | class counts, slack sum **and** the full per-bag class array | equality, not a hash | `runner.rs` `repeat`; CLI `main.rs:18` |
| Parallel-run checksum | per workload output (hex string) | **UNCLEAR** exact definition for each workload (not read in full) | `parallel.rs` |
| Config hash | config JSON text | FNV-1a 64 | `jobs.rs:115-122` |

---

# PART 4: Configuration and hyperparameters

"How chosen": the repository records a reason only where quoted. Otherwise **NOT FOUND**.

| Name | Value | Where set | Controls | How chosen |
|---|---|---|---|---|
| Master seed | 42 | `crates/bagflow-api/src/sim.rs:19`; every CLI binary | all generated data and engine hashes | NOT FOUND |
| `SEATS` | (76,.15),(150,.25),(180,.30),(220,.15),(300,.10),(350,.05) | `generator.rs:16` | aircraft size | NOT FOUND |
| `BANKS` | 07:00 .22, 09:30 .16, 12:30 .10, 15:00 .08, 18:30 .24, 21:00 .20; sd 45 min | `generator.rs:18-25, 59` | departure times | comment: "Morning and evening peaks, afternoon lull" |
| Departure clamp | [14,400 s, 86,000 s] | `generator.rs:60` | departure range | NOT FOUND |
| Load factor | Beta(16, 4) | `generator.rs:67` | passengers per flight | comment "mean 0.80" |
| `BAG_COUNT` | 0 .22, 1 .55, 2 .20, 3 .03 | `generator.rs:27` | bags per passenger | NOT FOUND |
| `PRIO_ORIGIN` / `PRIO_TRANSFER` | .97/.03 ; .80/.15 tight/.05 priority | `generator.rs:28-29` | priority mix | NOT FOUND |
| `TRANSFER_SHARE`, `LATE_SHARE`, `SPECIAL_SHARE` | 0.30, 0.02, 0.02 | `generator.rs:31-33` | flags and late bags | NOT FOUND |
| Weight | LogNormal(ln 17, 0.35), clamp 3–32 kg | `generator.rs:69, 101` | bag weight | NOT FOUND |
| Origin arrival curve | Beta(4, 2.2) over dep−180..dep−45 min | `generator.rs:70-73` | arrival times | comment "mode about 0.71 of the window" |
| Transfer window | dep−120..dep−30 min | `generator.rs:82-83` | transfer arrivals | NOT FOUND |
| Deadlines | dep−20 min origin, dep−15 min transfer | `generator.rs:96` | delay test | NOT FOUND |
| `FLIGHT_BATCH` | 2048 flights | `generator.rs:219` | parallel generator batch | comment "Most flights drawn before their bags are generated" |
| `BAGS_PER_FLIGHT_GUESS` | 150 | `generator.rs:221` | first batch size | "used only to size the first batch" |
| `CHUNK_FLIGHTS` | 16 | `generator.rs:223` | flights per Rayon task (pipeline, `generate_par`) | README: changed from about 1,042 to 16; `parallel.rs:125-126` "its chunk must stay small or most threads sit idle" |
| Node servers, service means | Table in 3.3 | `network.rs:56-67` | network capacity | NOT FOUND |
| Edge travel times | 6–14 s (formulas in 3.3) | `network.rs:83-95` | transit | NOT FOUND |
| `capacity_per_min` | 600 | `network.rs:98` | **nothing** (never read, AUDIT §3) | — |
| `queue_capacity` | 1,000,000 | `network.rs:76` | **nothing** (unused, AUDIT §6.1) | — |
| `SIGMA` | 0.4 | `engine2.rs:10` | service-time spread | NOT FOUND |
| `HOLD_PROB`, `HOLD_MEAN_MS` | 0.05, 20,000 ms | `engine2.rs:11-12` | screening inspection | NOT FOUND |
| `URGENT_MS` | 20 min | `engine2.rs:13` | deadline routing switch | NOT FOUND |
| ECMP tolerance | 0.1% (`×1000 ≤ min×1001`) | `engine2.rs:117` | equal-cost test | NOT FOUND |
| `PROGRESS_EVERY` | 65,536 events | `engine2.rs:349` | progress callback | NOT FOUND |
| Scenario window | 17:00–19:00; outages 90 min | `scenarios.rs:16-18` | scenario timing | comment "the evening peak" |
| Scenario shares | PeakSurge 0.5, +≤600 s; ConnectingRush 0.6, ≤30 min; SorterOverload 0.6; ScreeningDelay factor 0.4 | `scenarios.rs:49-77` | scenario strength | NOT FOUND |
| `WAIT_BOUNDS_MS` | 0, 1 s, 5 s, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 30 min | `collect.rs:15` | wait histogram bins | AUDIT §12: "The blueprint sets no histogram bins, so `WAIT_BOUNDS_MS` stands" |
| `SAMPLE_INTERVAL_MS` | 60,000 | `sim.rs:20` | node time-series | NOT FOUND |
| Status window and thresholds | 15 samples; High 0.75; Congested 0.95 | `sim.rs:27-29` | facility colours | "a choice", returned in `status_rule` (AUDIT §11.3) |
| Kernel thresholds | est 1200/600/300 s; classes at 1800 s and 600 s | `kernels/src/lib.rs:28-50` | risk classes | NOT FOUND |
| Rayon kernel chunk | 65,536 bags | `kernels/src/lib.rs:86` | `par` task size | NOT FOUND |
| GPU group size | Metal ≤256, multiple of 32; CUDA 256 | `risk_metal.mm:101-104`; `risk_cuda.cu:177-179` | launch shape | NOT FOUND |
| CUDA arch | compute_75 / sm_75 | `build.rs` | T4 target | comment "// T4"; `docs/backends.md`: "sm_60 dropped … CUDA 13 no longer supports Pascal" |
| MPI repetitions | 10 (best of) | `risk_mpi.cpp:49` | compute timing | NOT FOUND |
| CLI kernel repetitions | 10, best of | `kernels/src/main.rs:33` | `bagflow-kernels` table | NOT FOUND |
| Pipeline repetitions | generate 3, classify 9, aggregate 5, simulate 1; one warm-up | `pipeline.rs:18-21` | dashboard phase timings | NOT FOUND |
| Aggregate chunk | `max(4096, ceil(bags/(threads×8)))` | `pipeline.rs` `aggregate_chunk` | pipeline aggregation | comment "about eight chunks per thread" |
| Default classify backend | first available of rayon-neon, rayon-avx2, else rayon-ilp | `pipeline.rs:24-31` | simulation default | NOT FOUND |
| Simulation defaults | Normal, dijkstra, fcfs, 100%, ×1, 250,000 bags, threads = logical cores | `sim.rs:51-64` | API default config | NOT FOUND |
| Simulation limits | bags 1,000–1,000,000; capacity 20–300%; multiplier 1–20; threads 1–64 | `sim.rs:21-23`, `bench.rs:14` | validation | AUDIT §10: 1M limit "confirmed by measurement" |
| `DEFAULT_RETAIN` | 3 simulations | `lib.rs:33` | in-memory detail | AUDIT §9: ~16 MB per 250k bags (estimate); `engine2_1M_collect.txt`: `history_mb=16.5` at 250,086 bags |
| `MAX_QUEUED` | 8 | `jobs.rs:22` | queue length | NOT FOUND |
| Parallel-run limits | bags 1,000–10,000,000 (aggregate ≤1,000,000); reps 1–10; ≤4,096 tasks; default ~64 tasks, min 1,024 bags/chunk | `parallel.rs:22-32` | telemetry jobs | NOT FOUND |
| Sweep defaults | 6 scenarios × 4 routings × 4 policies × [100], ×1, 100,000 bags, threads [] | `sweep.rs:42-53` | sweep form | NOT FOUND |
| Sweep limits | bags 1,000–500,000; ≤384 experiments; ≤8 thread counts; ≤500,000,000 bags | `sweep.rs:22-26` | validation | NOT FOUND |
| Benchmark limits | bags 1,000–10,000,000; reps 1–50; warm-up 0–10; threads 1–64 | `bench.rs:11-14` | validation | NOT FOUND |
| Web noise rule | 10% | `web/src/utils/sweep.ts` `NOISE_PCT` | "Noisy" labels | comment "A display rule" |
| Web wide-spread rule | 20% | `web/src/components/performance/BenchResults.tsx` `WIDE_SPREAD_PCT` | Performance Lab note | "A display rule" |
| Web saturation rule | >50% delayed | `web/src/components/operations/SaturationBanner.tsx` `SATURATED_PCT` | saturation banner | NOT FOUND |
| Guided Demo settings | 10,000,000 bags; generate chunk 64 flights, 5 reps; classify 10 reps; PROBLEM congestion 70%; BASELINE dijkstra 100% | `web/src/config/demo.ts` | demo jobs | "64 … gives 32 tasks per full batch" |

---

# PART 5: Calculations, worked by hand

All arithmetic below was recomputed in this session with Python from the raw values quoted. "MATCH" means equal at the precision printed in the source. Values in result files are rounded (for example to 0.01 ms), so a recomputed ratio can differ in the last printed digit; these are marked "MATCH (rounding)" and both numbers are given.

## 5.1 Delayed percentage

Formula: `delayed % = 100 × delayed / total` (`engine2` counts; `sim.rs` summary).

| Run | Inputs | Computed | Reported | Source | Verdict |
|---|---|---|---|---|---|
| Normal, dijkstra, fcfs, 100% | 9,245 / 250,086 | 3.6967% | 3.697% | `r6_api.txt` | MATCH |
| SorterOverload, ecmp, fcfs, 100% | 28,606 / 250,086 | 11.4385% | 11.438% | `r6_api.txt` | MATCH (rounding: 11.43847 → 11.438) |
| Normal, congestion, fcfs, 70% | 134,427 / 250,086 | 53.7523% | 53.752% | `r6_api.txt` | MATCH |
| Normal, dijkstra, 100%, 1M | 948,931 / 1,000,065 | 94.8869% | 94.887% | `data/runs/sim-1795732121966-5.json`; `engine2_1M_collect.txt` | MATCH |
| Tight-connection delayed, baseline | 837 / 11,273 | 7.4248% | 7.42% (`r6_compare_100.txt`), 7.424820… (`sim-1795756506633-1.json`) | | MATCH |
| On-time rate, baseline | 240,841 / 250,086 | 0.963033 | 0.9630327… | `sim-1795756506633-1.json` | MATCH; 240,841 + 9,245 = 250,086 MATCH |

## 5.2 Speedup, efficiency, throughput (generator CLI)

Formulas: `speedup = t_seq / t_par`; `efficiency = 100 × speedup / threads`; `bags/s = bags / t`.

`r6_gen_10M.txt`, run 1: t_seq = 3.141 s, t_rayon-8 = 0.617 s.
- speedup = 3.141 / 0.617 = **5.091** → reported 5.09x. MATCH.
- efficiency = 100 × 5.091 / 8 = **63.6%** → reported 64%. MATCH (rounding).
- bags/s seq = 10,000,000 / 3.141 = 3,183,699 → reported 3,183,921. MATCH (rounding: the file divides by the unrounded time).
- bags/s rayon-8 = 10,000,000 / 0.617 = 16,207,455 → reported 16,211,492. MATCH (rounding).

Runs 2 and 3: 3.011/0.623 = 4.833 (reported 4.83x), efficiency 60.4% (60%); 2.985/0.629 = 4.746 (reported 4.74x; the file computes from unrounded times), efficiency 59.3% (59%). MATCH (rounding).

Rayon-4 run 1: 3.141/1.004 = 3.128 (reported 3.13x). Rayon-1 run 1: 3.141/3.948 = 0.796 (0.80x). MATCH.

`r6_gen_50M.txt`: 16.436 / 5.508 = 2.984 (reported 2.98x); efficiency 37.3% (37%); bags/s seq 50,000,000/16.436 = 3,042,103 (reported 3,042,194). MATCH (rounding).

`bench_phase1b.txt`: 3.014 / 0.606 = 4.974 → 4.97x. MATCH.

## 5.3 Median, and the "pairing extremes" speedup range

Median (`bench.rs:120`): odd n → middle sorted value; even n → mean of the two middle values. Parallel runs instead show the lower-middle run for even n (`parallel.rs:174`).

Pairing range (web `utils/spread.ts` `speedupRange`; printed in `r6_api.txt` as "pairing extremes"): `[min(seq) / max(par), max(seq) / min(par)]`, i.e. shortest sequential over longest parallel, up to longest sequential over shortest parallel.

`r6_api.txt`, generate job 1: seq median 2,890.44 [2,871.42–3,060.30] ms, rayon median 781.85 [686.77–1,020.41] ms.
- speedup = 2,890.44 / 781.85 = **3.70** → 3.70x. MATCH.
- range = 2,871.42 / 1,020.41 = **2.81**; 3,060.30 / 686.77 = **4.46** → reported 2.81x–4.46x. MATCH.

All seven `r6_api.txt` parallel jobs:

| Job | Median ratio | Reported | Low pair | Reported | High pair | Reported | Verdict |
|---|---|---|---|---|---|---|---|
| generate 1 | 3.70 | 3.70 | 2.81 | 2.81 | 4.46 | 4.46 | MATCH |
| generate 2 | 3.06 | 3.06 | 2.02 | 2.02 | 4.60 | 4.60 | MATCH |
| generate 3 | 2.95 | 2.95 | 1.37 | 1.37 | 12.29 | 12.29 | MATCH |
| generate default chunk | 2.06 | 2.06 | 1.90 | 1.90 | 2.32 | 2.32 | MATCH |
| classify 1 | 6.59 | 6.59 | 6.23 | 6.22 | 7.73 | 7.75 | MATCH (rounding of 0.01 ms inputs) |
| classify 2 | 6.36 | 6.37 | 3.83 | 3.83 | 8.07 | 8.09 | MATCH (rounding) |
| classify 3 | 6.47 | 6.47 | 5.67 | 5.67 | 7.93 | 7.94 | MATCH (rounding) |

## 5.4 Pipeline and Amdahl, worked from a real run

Source: `data/runs/sim-1795756506633-1.json` (local record; Normal, dijkstra, fcfs, 100%, ×1, 250,000 requested, 8 threads, rayon-neon).

Phase samples (ms) and medians:

| Phase | Baseline samples | Baseline median | Parallel samples | Parallel median | Speedup |
|---|---|---|---|---|---|
| generate | 78.32875, 69.884292, 68.047542 | 69.884292 | 16.347708, 29.732333, 15.923625 | 16.347708 | 69.884292 / 16.347708 = 4.274868 (reported 4.274867889…) MATCH |
| classify | 0.352167, 0.351125, 0.352, 0.351041, 0.351292, 0.35125, 0.351333, 0.351, 0.35575 | 0.351292 | 0.200833, 0.146458, 0.159, 0.093916, 0.144792, 0.153583, 0.121667, 0.1275, 0.123875 | 0.144792 | 2.426184 (reported 2.426183…) MATCH |
| simulate | — | — | 787.667208 (1 run) | 787.667208 | — |
| aggregate | 7.934166, 7.812042, 7.871458, 7.830667, 8.514708 | 7.871458 | 2.042542, 1.815291, 1.805833, 1.871583, 1.856625 | 1.856625 | 4.239660 (reported 4.239659…) MATCH |

Other sequential: scenario setup 0.745375 + summarise 0.272208 = **1.017583 ms** (reported `time_ms` 1.017583). MATCH.

```
eligible_base  = 69.884292 + 0.351292 + 7.871458            = 78.107042 ms
eligible_par   = 16.347708 + 0.144792 + 1.856625            = 18.349125 ms
baseline_total = 78.107042 + 787.667208 + 1.017583          = 866.791833 ms   (reported 866.791833)  MATCH
parallel_total = 18.349125 + 787.667208 + 1.017583          = 807.033916 ms   (reported 807.033916)  MATCH
p              = 78.107042 / 866.791833                     = 0.0901105       (reported 0.09011049…) MATCH
Amdahl ceiling = 1 / (1 − 0.0901105)                        = 1.0990346       (reported 1.09903454…) MATCH
full speedup   = 866.791833 / 807.033916                    = 1.0740464       (reported 1.07404635…) MATCH
eligible speed = 78.107042 / 18.349125                      = 4.2567175       (reported 4.25671752…) MATCH
sequential frac= 1 − 0.0901105                              = 0.9098895       (reported 0.90988950…) MATCH
```

Note: this local run's ceiling (1.099x) and full speedup (1.074x) are lower than in `r6_api.txt` (1.109–1.110x and 1.084–1.085x), because its generate speedup was 4.27x against 4.67–4.76x there. Both are real; they show run-to-run variation.

`r6_api.txt` ceiling check from the printed p: 1/(1 − 0.098) = 1.1086 and 1/(1 − 0.099) = 1.1099, against reported 1.109x and 1.110x. MATCH (the file prints p rounded to 0.1%).

## 5.4a Operational parallel mode and Amdahl, from the session measurement

Source: `operational_bench` on the M1 (Apple M1 MacBook Air), Normal / dijkstra / fcfs / 100%, 250,086 bags, stats only, median of 3, load average about 4.1. **Reported in session, not saved to `results/`.**

- Precompute, sequential: about 150 ms. Event loop with the precompute: about 496 to 500 ms.
- Precompute share of the sequential-precompute path: p = 150 / (150 + 496…500) ≈ 0.23 to 0.24 (23 to 24%).
- Ceiling if the precompute took no time: 1 / (1 − p) ≈ 1 / 0.767 ≈ **1.31x**.
- At 8 workers the precompute speedup is S = 6.04x. Amdahl prediction: 1 / ((1 − p) + p / S) ≈ 1 / (0.767 + 0.233 / 6.04) ≈ 1 / 0.806 ≈ **1.24x**.
- Measured over the same path (sequential precompute + loop against parallel precompute + loop): **1.23x**. The prediction matches.
- The whole-run figure in the table (1.32x at 8 workers) is against the *plain* run, where the per-bag work happens inside the loop. That plain run is slower than sequential precompute + loop, which is why 1 worker already shows 1.05x (1.07x at 1,000,065 bags) while the precompute itself is 1.00x there. That part is not parallelism.
- With bag histories recorded (the API path), the loop is longer, so p and the gain are smaller.

| Bags | Workers | Precompute seq → par | Precompute speedup | Whole-run speedup |
|---|---|---|---|---|
| 250,086 | 1 / 2 / 4 / 8 | 150 → 151 / 75 / 38 / 25 ms | 1.00x / 2.00x / 3.98x / 6.04x | 1.05x / 1.18x / 1.29x / 1.32x |
| 1,000,065 | 1 / 2 / 4 / 8 | 609 → 611 / 304 / 162 / 106 ms | 1.00x / 2.03x / 3.80x / 5.78x | 1.07x / 1.20x / 1.28x / 1.32x |

## 5.5 Sweep speedup and efficiency

`r6_api.txt`: speedup = wall_1 / wall_8; efficiency = 100 × speedup / 8; time saved = wall_1 − wall_8.

| Sweep | wall_1 ms | wall_8 ms | Speedup computed | Reported | Efficiency computed | Reported | Time saved |
|---|---|---|---|---|---|---|---|
| 1 | 24,544 | 4,718 | 5.2022 | 5.20x | 65.03% | 65.0% | 19,826 ms |
| 2 | 24,233 | 4,742 | 5.1103 | 5.11x | 63.88% | 63.9% | 19,491 ms |
| 3 | 25,265 | 5,607 | 4.5060 | 4.51x | 56.32% | 56.3% | 19,658 ms |

All MATCH. Range over three sweeps: speedup 4.51x–5.20x; efficiency 56.3%–65.0%; median speedup 5.11x (computed here, not reported).

Local sweep records (`data/runs/sweep-1795756723279-14.json`, threads 1/2/4/8): 24,274.8/12,220.8 = 1.9864 (99.32%), /7,369.8 = 3.2938 (82.35%), /4,625.5 = 5.2480 (65.60%). Reported 1.986, 3.294, 5.248 and 99.3%, 82.3%, 65.6%. MATCH.

## 5.6 Kernel speedup, throughput and bandwidth

CLI formulas (`crates/bagflow-kernels/src/main.rs:20`): speedup = scalar best / backend best; `M bags/s = n / t / 1e6`; `GB/s = 10 n / t / 1e9` (10 bytes per bag: arrival 4 + deadline 4 + flags 1 + class 1). n = 10,000,168.

`r6_kernels_10M.txt` run 1, scalar 14.07 ms:

| Row | Time ms | Speedup computed | Reported | M bags/s computed | Reported | GB/s computed | Reported |
|---|---|---|---|---|---|---|---|
| scalar | 14.07 | 1.00 | 1.00x | 711 | 711 | 7.1 | 7.1 |
| ilp (x4) | 13.05 | 1.08 | 1.08x | 766 | 766 | 7.7 | 7.7 |
| neon | 6.71 | 2.10 | 2.10x | 1,490 | 1,491 | 14.9 | 14.9 |
| openmp-8 | 4.32 | 3.26 | 3.26x | 2,315 | 2,314 | 23.1 | 23.1 |
| metal kernel (GPU) | 3.45 | 4.08 | 4.07x | 2,899 | 2,896 | 29.0 | 29.0 |
| metal + copy in/out | 7.46 | 1.89 | 1.89x | 1,341 | 1,341 | 13.4 | 13.4 |
| rayon-4+neon | 1.82 | 7.73 | 7.72x | 5,495 | 5,488 | 54.9 | 54.9 |
| rayon-8+neon | 1.96 | 7.18 | 7.20x | 5,102 | 5,115 | 51.0 | 51.1 |

All MATCH (rounding: the file computes from unrounded times).

Metal parts, run 1: copy in 3.05 + wall 4.09 + copy out 0.26 = 7.40 ms, against the reported total 7.46 ms. Not expected to match exactly: each figure is the best of 11 runs taken separately (`main.rs:55-60` keeps separate minima), so the minima of the parts need not sum to the minimum total. **UNCLEAR** without the per-run values.

Kaggle (`kernels_10M_kaggle.txt`, scalar 26.31 ms): ilp 30.50 → 0.86 (0.86x); avx2 7.91 → 3.33 (3.32x); openmp-4 7.07 → 3.72 (3.72x); warp kernel 0.83 → 31.70 (31.65x); warp + PCIe 21.61 → 1.22 (1.22x); naive 24.81 → 1.06 (1.06x); rayon-4+avx2 3.56 → 7.39 (7.39x). MATCH (rounding). Warp vs naive kernel: 24.81 / 0.83 = 29.9 (README: "about 30x"). MATCH.

## 5.7 MPI speedups

`run_mpi.sh` awk: compute speedup = compute_1 / compute_p; end-to-end = (load+compute+reduce)_1 / (load+compute+reduce)_p, per mode.

`r6_mpi_50M.txt` run 1, `read`: 1-rank total = 202.4 + 74.01 + 0 = 276.41 ms.
- 8 ranks: compute 74.01/11.95 = **6.19** (6.19x); end-to-end 276.41/(33.6+11.95+0.006) = **6.07** (6.07x). MATCH.
- 4 ranks: 74.01/18.50 = 4.00; 276.41/(42.2+18.50+0.002) = 4.55. MATCH.

Run 2 `read`: compute 1.92, 3.99, 5.89; end-to-end 1.67, 2.73, 3.52. MATCH. `scatter` run 1: end-to-end 2.07, 2.15, 1.15; run 2: 1.77, 1.82 (reported 1.81), 1.03. MATCH (rounding).

## 5.8 M/M/c theory

Formula in 3.20. Recomputed W_q theory: c=1, ρ=0.5 → 100.00 s (file 100.00); c=1, ρ=0.8 → 400.00 (400.00); c=4, ρ=0.5 → 8.70 (8.70); c=8, ρ=0.8 → 28.60 (28.60); c=16, ρ=0.8 → 9.53 (9.53). MATCH.

Relative error `(W_sim − W_th)/W_th`: c=1, ρ=0.5: (99.33 − 100)/100 = −0.67% (file −0.67%) MATCH; c=8, ρ=0.8: (27.89 − 28.60)/28.60 = −2.49% (−2.49%) MATCH. For c=16, ρ=0.5 the printed values (0.11 vs 0.11) are too rounded to recompute the file's −3.27%: **cannot verify to precision**.

## 5.9 Data statistics

- Priority shares (50M): 45,954,753/50,000,099 = 91.909%; 1,799,165 → 3.598%; 2,246,181 → 4.492%; sum 50,000,099. MATCH.
- Transfer share 14,999,616/50,000,099 = 29.999% against the configured passenger share 0.30. MATCH (per-bag share equals the per-passenger share in expectation because bag counts do not depend on transfer status, `generator.rs:76-77`).
- Special share 1,000,515/50,000,099 = 2.001% against 0.02. MATCH.
- Mean weight 17.895 kg. Configured LogNormal(ln 17, 0.35) has mean 17 × e^{0.35²/2} = 17 × 1.0632 = 18.07 kg before clamping to [3, 32] kg; clamping the upper tail lowers it. Consistent; exact post-clamp mean **not derived**.
- Default generate chunk at 10M: ceil(10,000,000/150) = 66,667 flights estimated; ceil(66,667/4,096) = 17; max(16, 17) = **17**. README "17 at 10M bags". MATCH.
- Sweep size in the form: 96 experiments × 4 passes × 100,000 = 38,400,000 bags (≤ 500,000,000 limit). MATCH with the web form's arithmetic (`web/src/utils/sweep.ts` `sweepSize`).

---

# PART 6: Results

Every result file in `results/` is covered, grouped by experiment. Where runs differ, all runs are shown with their range. Local job records in `data/runs/` are listed at the end (6.11) because they are not in a fresh clone.

## 6.1 Engine checks

### 6.1.1 M/M/c validation of `engine.rs`

Setup: single node, c servers, Poisson arrivals, exponential service mean 100 s, 1,000,000 customers per case, seed 42 (`r6_validation_mmc.txt` header; command `target/release/validate`). Pass rule: |error| < 5%, |util − ρ| < 0.02, all completed.

| c | ρ | W_q theory (s) | W_q sim (s) | Error | Util sim | Result |
|---|---|---|---|---|---|---|
| 1 | 0.50 | 100.00 | 99.33 | −0.67% | 49.9% | PASS |
| 1 | 0.70 | 233.33 | 230.17 | −1.36% | 69.8% | PASS |
| 1 | 0.80 | 400.00 | 392.67 | −1.83% | 79.8% | PASS |
| 2 | 0.50 | 33.33 | 32.84 | −1.49% | 49.9% | PASS |
| 2 | 0.70 | 96.08 | 94.23 | −1.92% | 69.8% | PASS |
| 2 | 0.80 | 177.78 | 173.94 | −2.16% | 79.8% | PASS |
| 4 | 0.50 | 8.70 | 8.73 | +0.37% | 49.9% | PASS |
| 4 | 0.70 | 35.72 | 35.47 | −0.69% | 69.8% | PASS |
| 4 | 0.80 | 74.55 | 73.91 | −0.86% | 79.8% | PASS |
| 8 | 0.50 | 1.48 | 1.46 | −1.13% | 49.9% | PASS |
| 8 | 0.70 | 11.28 | 11.07 | −1.84% | 69.8% | PASS |
| 8 | 0.80 | 28.60 | 27.89 | −2.49% | 79.8% | PASS |
| 16 | 0.50 | 0.11 | 0.11 | −3.27% | 49.9% | PASS |
| 16 | 0.70 | 2.70 | 2.62 | −2.93% | 69.9% | PASS |
| 16 | 0.80 | 9.53 | 9.38 | −1.51% | 79.8% | PASS |

Summary: 15 of 15 within 5%; errors −3.27% to +0.37%; 14 of 15 negative. `validation_mmc.txt` (older) has identical values. `docs/assumptions.md` gives the likely cause: "arrival times quantised to whole seconds … and the empty-system start. Both bias waits downward." This validates **`engine.rs` only**; `engine2` has no theory validation (README, AUDIT §2.1).

### 6.1.2 Pinned `engine2` configurations (250,086 bags, FCFS, ×1)

| Scenario, routing, capacity | Delayed bags | Delayed % | Engine checksum | Sources |
|---|---|---|---|---|
| Normal, dijkstra, 100% | 9,245 | 3.697% | `61aa19cce7723683` | `r6_api.txt`; `crates/bagflow-core/tests/collect.rs:50`; `crates/bagflow-api/tests/api.rs:643`; `engine2_1M_collect.txt` (10 runs); 6 local records |
| SorterOverload, ecmp, 100% | 28,606 | 11.438% | `144494908f029748` | `r6_api.txt`; `collect.rs:51`; `api.rs:644`; 2 local records |
| Normal, congestion, 70% | 134,427 | 53.752% | `29e8786b1e8e3fae` | `r6_api.txt`; `collect.rs:52`; `api.rs:645`; 2 local records |

Dataset checksum for these runs: `168e0a37b06224f9` (250,086 bags, 1,650 flights) (`collect.rs:48`; `api.rs:651`). These are deterministic; every repeat in every source gives the same values.

## 6.2 Routing × queue policy (`engine2`, Normal scenario, 250,086 bags, seed 42)

Columns: delayed %, tight-connection delayed %, mean time in system (s), 95th percentile (s), longest queue at any node, wall time of the run (s, varies by run).

### 6.2.1 Servers ×1, 100% (`r6_compare_100.txt`; identical to `compare_phase4_stressed.txt` except the `sim s` column)

| Routing | Queue | Delayed | Tight delayed | Mean s | p95 s | Max queue | sim s (r6) | sim s (old) |
|---|---|---|---|---|---|---|---|---|
| dijkstra | fcfs | 3.70% | 7.42% | 807 | 2395 | 9743 | 0.67 | 0.64 |
| dijkstra | priority | 3.89% | 0.00% | 806 | 2537 | 9681 | 0.66 | 0.64 |
| dijkstra | edf | 0.00% | 0.00% | 804 | 3654 | 9724 | 0.69 | 0.65 |
| dijkstra | spt | 1.51% | 1.67% | 197 | 99 | 2381 | 0.68 | 0.65 |
| ecmp | fcfs | 3.69% | 7.39% | 806 | 2379 | 9743 | 0.68 | 0.67 |
| ecmp | priority | 3.87% | 0.00% | 805 | 2536 | 9681 | 0.68 | 0.67 |
| ecmp | edf | 0.00% | 0.00% | 803 | 3652 | 9724 | 0.71 | 0.71 |
| ecmp | spt | 0.72% | 0.72% | 122 | 72 | 855 | 0.70 | 0.75 |
| congestion | fcfs | 3.25% | 7.23% | 796 | 2117 | 8437 | 0.69 | 0.68 |
| congestion | priority | 3.42% | 0.00% | 797 | 2286 | 8422 | 0.68 | 0.86 |
| congestion | edf | 0.00% | 0.00% | 794 | 3582 | 8326 | 0.70 | 0.83 |
| congestion | spt | 0.71% | 0.68% | 123 | 76 | 827 | 0.68 | 0.91 |
| deadline | fcfs | 3.34% | 7.42% | 804 | 2151 | 8591 | 0.72 | 0.92 |
| deadline | priority | 3.46% | 0.00% | 803 | 2288 | 8508 | 0.71 | 0.76 |
| deadline | edf | 0.00% | 0.00% | 801 | 3599 | 8581 | 0.73 | 0.74 |
| deadline | spt | 0.72% | 0.72% | 122 | 72 | 799 | 0.72 | 0.86 |

Run wall time over the 16 r6 runs: 0.66–0.73 s; old file 0.64–0.92 s.

Node detail, dijkstra + fcfs (`r6_compare_100.txt`):

| Node | Arrivals | Avg wait s | Max queue | Util |
|---|---|---|---|---|
| CheckIn #0 | 250,086 | 1.3 | 292 | 43% |
| Identification #1 | 250,086 | 0.0 | 11 | 34% |
| Screening #2 (A) | 167,678 | 860.5 | 9,743 | 64% |
| Screening #3 (B) | 82,408 | 549.5 | 2,556 | 65% |
| Sorter #4 | 167,678 | 1.5 | 92 | 57% |
| Sorter #5 | 0 | 0.0 | 0 | 0% |
| Sorter #6 | 82,408 | 0.0 | 3 | 28% |
| Loading #7 | 81,768 | 0.0 | 8 | 37% |
| Loading #8 | 85,910 | 0.0 | 9 | 39% |
| Loading #9 | 82,408 | 0.0 | 5 | 37% |

Node detail, congestion + fcfs: Screening A 167,664 arrivals, 776.9 s, 8,437; Screening B 82,422, 685.3 s, 3,664; Sorter #4 138,048; Sorter #5 53,933; Sorter #6 58,105 (same file). Under Dijkstra, Sorter #5 receives no bags; congestion routing spreads them.

### 6.2.2 Servers ×1, 70% (`r6_compare_70.txt`; identical to `compare_phase4_overload70.txt` except `sim s`)

| Routing | fcfs | priority | edf | spt |
|---|---|---|---|---|
| dijkstra | 77.42% (tight 82.61%) | 73.82% (0.00%) | 79.59% (80.52%) | 23.50% (24.36%) |
| ecmp | 53.92% (62.22%) | 53.52% (0.00%) | 55.34% (56.79%) | 13.62% (14.34%) |
| congestion | 53.75% (61.96%) | 53.40% (0.00%) | 57.40% (58.85%) | 9.09% (9.50%) |
| deadline | 53.92% (62.02%) | 53.64% (0.00%) | 56.84% (58.63%) | 11.68% (12.14%) |

Mean / p95 / max queue are in the file; for example dijkstra fcfs 8,706 s / 20,456 s / 24,677; dijkstra spt 4,799 / 25,747 / 22,998. Run wall time r6: 0.69–0.76 s. Node detail dijkstra + fcfs: Sorter #4 average wait 6,408.5 s, max queue 24,677, util 92%.

### 6.2.3 Servers ×1, 55% (`compare_phase4_overload55.txt`, older, not re-run)

Delayed: FCFS 89.23–89.26%, priority 82.98–83.03%, EDF 89.30–89.37%, SPT 19.93% (congestion) to 29.00% (dijkstra), over the four routings.

### 6.2.4 Servers ×2, 100% (`compare_phase4.txt`, older)

All 16 combinations: 0.00% delayed, mean 47 s, p95 56 s, max queue 30 (16 with SPT). `docs/assumptions.md`: "over-provisioned … kept as a sanity check".

## 6.3 Scenarios (`r6_scenarios.txt`; identical to `scenarios_phase5.txt`)

250,086 base bags (PeakSurge 262,182), 100%, seed 42, window 17:00–19:00, FCFS and EDF only.

| Scenario | Bags | dijkstra fcfs / edf | ecmp fcfs / edf | congestion fcfs / edf | deadline fcfs / edf |
|---|---|---|---|---|---|
| Normal | 250,086 | 3.70 / 0.00 | 3.69 / 0.00 | 3.25 / 0.00 | 3.34 / 0.00 |
| PeakSurge | 262,182 | 16.42 / 13.69 | 16.41 / 13.68 | 16.38 / 14.45 | 16.52 / 14.14 |
| ConveyorFailure | 250,086 | 3.70 / 0.00 | 3.69 / 0.00 | 3.25 / 0.00 | 3.34 / 0.00 |
| ScreeningDelay | 250,086 | 17.94 / 20.62 | 17.93 / 20.62 | 16.50 / 16.30 | 17.54 / 19.77 |
| ConnectingRush | 250,086 | 4.43 / 0.00 | 4.42 / 0.00 | 3.75 / 0.00 | 3.95 / 0.00 |
| SorterOverload | 250,086 | 11.45 / 8.51 | 11.44 / 8.51 | 6.17 / 0.00 | 9.67 / 5.67 |

(Delayed %, FCFS / EDF.) Tight-connection delayed, mean, p95 and max queue are in the file; for example ConnectingRush dijkstra fcfs tight delayed 21.94%; ScreeningDelay dijkstra edf max queue 21,113.

## 6.4 Dataset generation

### 6.4.1 CLI, 10M bags requested (`r6_gen_10M.txt`, 3 separate processes, one timing each)

| Backend | Run 1 s | Run 2 s | Run 3 s | Range | Speedup range | Efficiency range |
|---|---|---|---|---|---|---|
| seq | 3.141 | 3.011 | 2.985 | 2.985–3.141 | 1.00x | — |
| rayon-1 | 3.948 | 4.052 | 4.004 | 3.948–4.052 | 0.74x–0.80x | 74%–80% |
| rayon-2 | 1.967 | 1.988 | 1.974 | 1.967–1.988 | 1.51x–1.60x | 76%–80% |
| rayon-4 | 1.004 | 1.026 | 1.029 | 1.004–1.029 | 2.90x–3.13x | 73%–78% |
| rayon-8 | 0.617 | 0.623 | 0.629 | 0.617–0.629 | 4.74x–5.09x | 59%–64% |

All outputs `identical`; checksum `2fa040bc2723a302`. Median rayon-8 speedup over three runs: 4.83x. Older single run (`bench_phase1b.txt`): seq 3.014 s, rayon-8 0.606 s, 4.97x, 62%.

### 6.4.2 CLI, 50M bags (`r6_gen_50M.txt`, one run)

seq 16.436 s; rayon-1 22.574 s (0.73x); rayon-2 11.704 s (1.40x); rayon-4 7.465 s (2.20x, 55%); rayon-8 5.508 s (2.98x, 37%). Checksum `cad211c3120bddfd`; all identical.

### 6.4.3 Through the API, 10,000,168 bags (`r6_api.txt`)

| Job | Chunk | Reps | Seq median [min–max] ms | Rayon median [min–max] ms | Speedup | Pairing range | Matches |
|---|---|---|---|---|---|---|---|
| demo 1 | 64 flights | 5 | 2,890.44 [2,871.42–3,060.30] | 781.85 [686.77–1,020.41] | 3.70x | 2.81x–4.46x | True |
| demo 2 | 64 | 5 | 2,948.75 [2,867.43–3,122.26] | 964.63 [678.42–1,417.92] | 3.06x | 2.02x–4.60x | True |
| demo 3 | 64 | 5 | 3,540.46 [3,055.62–8,758.98] | 1,200.72 [712.44–2,227.39] | 2.95x | 1.37x–12.29x | True |
| default | 1,042 flights | 5 | 2,943.75 [2,891.98–3,296.61] | 1,426.01 [1,418.91–1,522.42] | 2.06x | 1.90x–2.32x | True |

Range of demo-chunk speedups: 2.95x–3.70x. The 1,042-flight default is the old default; the current default would be 17 flights at this size (5.9).

### 6.4.4 Engine scaling, old `engine.rs` (`scaling_seq.txt`, `scaling_seq_fixed_network.txt`)

| Bags | Network | gen s | sim s | bags/s | events | loaded | delayed |
|---|---|---|---|---|---|---|---|
| 250,086 | scaled | 0.04 | 0.67 | 371,795 | 2,088,212 | 242,563 | 7,523 |
| 1,000,065 | scaled | 0.07 | 3.33 | 299,895 | 8,351,022 | 967,482 | 32,583 |
| 5,000,095 | scaled | 0.34 | 20.84 | 239,872 | 41,751,473 | 4,840,762 | 159,333 |
| 250,086 | fixed | 0.03 | 0.69 | 364,675 | 2,088,212 | 242,563 | 7,523 |
| 1,000,065 | fixed | 0.08 | 2.20 | 453,545 | 8,351,009 | 50,855 | 949,210 |
| 5,000,095 | fixed | 0.33 | 10.04 | 497,913 | 41,751,877 | 49,300 | 4,950,795 |

"Scaled" means servers × ceil(bags/250k) (`docs/assumptions.md` Phase 3b). These are the 6-node chain engine, not `engine2`.

## 6.5 `engine2` time and memory, collection off vs on (`engine2_1M_collect.txt`)

Command `/usr/bin/time -l target/release/measure …`; seed 42, FCFS, ×1, 60 s samples; 5 runs per row.

| Bags | Scenario, routing, pct | Collect | run_s range | peak RSS MB range | history MB | samples | Delayed % | Checksum |
|---|---|---|---|---|---|---|---|---|
| 250,086 | Normal, dijkstra, 100 | off | 0.67–0.69 | 40–41 | 0 | 0 | 3.697 | 61aa19cce7723683 |
| 250,086 | Normal, dijkstra, 100 | on | 0.69–0.92 | 56–58 | 16.5 | 1,222 | 3.697 | 61aa19cce7723683 |
| 1,000,065 | Normal, dijkstra, 100 | off | 2.62–2.76 | 147–160 | 0 | 0 | 94.887 | 447bab1456c505d7 |
| 1,000,065 | Normal, dijkstra, 100 | on | 2.64–2.95 | 204–228 | 66.0 | 3,280 | 94.887 | 447bab1456c505d7 |
| 1,000,065 | SorterOverload, ecmp, 100 | off | 2.71–2.72 | 145–172 | 0 | 0 | 94.886 | 5167d5e18ac053dc |
| 1,000,065 | SorterOverload, ecmp, 100 | on | 2.76–2.86 | 206–236 | 66.0 | 3,373 | 94.886 | 5167d5e18ac053dc |
| 1,000,065 | Normal, congestion, 70 | off | 2.57–2.58 | 159–178 | 0 | 0 | 96.505 | 6563003ead7e1ef7 |
| 1,000,065 | Normal, congestion, 70 | on | 2.65–2.69 | 216–239 | 66.0 | 4,694 | 96.505 | 6563003ead7e1ef7 |
| 1,049,413 | PeakSurge, congestion, 20 | off | 2.13–2.16 | 180–181 | 0 | 0 | 99.086 | 6cdd2b63f06310bb |
| 1,049,413 | PeakSurge, congestion, 20 | on | 2.23–2.24 | 227–256 | 69.3 | 17,727 | 99.086 | 6cdd2b63f06310bb |

Checksums and delayed % are identical with collection off and on in every pair: collection does not change results. At 1M bags with servers ×1, 94.9–99.1% of bags are delayed (saturation).

## 6.6 Deadline-risk kernel, 10,000,168 bags

### 6.6.1 M1, CLI best of 10 (`r6_kernels_10M.txt`, 3 processes)

| Backend | Run 1 ms | Run 2 ms | Run 3 ms | Range ms | Speedup range |
|---|---|---|---|---|---|
| scalar | 14.07 | 14.07 | 14.11 | 14.07–14.11 | 1.00x |
| ilp (x4) | 13.05 | 13.05 | 13.04 | 13.04–13.05 | 1.08x |
| neon | 6.71 | 6.71 | 6.71 | 6.71 | 2.10x |
| openmp-8 | 4.32 | 4.29 | 4.28 | 4.28–4.32 | 3.26x–3.30x |
| metal kernel (GPU) | 3.45 | 3.45 | 3.45 | 3.45 | 4.07x–4.10x |
| metal kernel (wall) | 4.09 | 4.05 | 4.14 | 4.05–4.14 | 3.41x–3.48x |
| metal + copy in/out | 7.46 | 7.35 | 7.39 | 7.35–7.46 | 1.89x–1.91x |
| metal copy in | 3.05 | 2.98 | 2.98 | 2.98–3.05 | — |
| metal copy out + reduce | 0.26 | 0.26 | 0.25 | 0.25–0.26 | — |
| rayon-1+ilp | 13.07 | 13.07 | 13.06 | 13.06–13.07 | 1.08x |
| rayon-1+neon | 6.73 | 6.73 | 6.73 | 6.73 | 2.09x–2.10x |
| rayon-2+ilp | 6.59 | 6.59 | 6.58 | 6.58–6.59 | 2.13x–2.14x |
| rayon-2+neon | 3.41 | 3.41 | 3.40 | 3.40–3.41 | 4.12x–4.15x |
| rayon-4+ilp | 3.34 | 3.34 | 3.35 | 3.34–3.35 | 4.21x–4.22x |
| rayon-4+neon | 1.82 | 1.99 | 1.98 | 1.82–1.99 | 7.08x–7.72x |
| rayon-8+ilp | 2.32 | 2.52 | 2.48 | 2.32–2.52 | 5.57x–6.08x |
| rayon-8+neon | 1.96 | 1.99 | 1.95 | 1.95–1.99 | 7.08x–7.25x |

All CPU rows `identical`; Metal `output identical`.

### 6.6.2 M1, older sessions (best of 10, single runs)

| Backend | `kernels_10M.txt` | `kernels_10M_metal.txt` | `kernels_10M_novec.txt` (vectorisation off) |
|---|---|---|---|
| scalar | 14.11 ms | 14.12 | 21.16 |
| ilp | 13.06 (1.08x) | 13.12 (1.08x) | 23.14 (0.91x) |
| neon | 6.72 (2.10x) | 6.75 (2.09x) | 6.72 (3.15x) |
| openmp-8 | 5.12 (2.76x) | 4.30 (3.29x) | 5.32 (3.98x) |
| rayon-4+neon | 3.81 (3.70x) | 1.89 (7.47x) | 3.31 (6.39x) |
| rayon-8+ilp | 6.85 (2.06x) | 2.32 (6.08x) | 7.00 (3.02x) |
| rayon-8+neon | 3.95 (3.57x) | 2.03 (6.97x) | 2.79 (7.60x) |
| metal kernel / wall / +copy | — | 3.45 / 4.05 / 7.41 ms | — |

These show large session-to-session variation for threaded rows (rayon-4+neon 1.82–3.81 ms across files).

### 6.6.3 M1, through the API (`r6_api.txt`, rayon-neon, 8 threads, 10 reps, chunk 156,250 bags)

| Job | Scalar median [min–max] ms | rayon-neon median [min–max] ms | Speedup | Pairing range |
|---|---|---|---|---|
| 1 | 14.17 [14.15–16.00] | 2.15 [2.07–2.27] | 6.59x | 6.22x–7.75x |
| 2 | 14.19 [14.14–16.54] | 2.23 [2.05–3.69] | 6.37x | 3.83x–8.09x |
| 3 | 14.16 [14.11–16.02] | 2.19 [2.02–2.49] | 6.47x | 5.67x–7.94x |

### 6.6.4 Kaggle, best of 10, **saved, not re-measured** (`kernels_10M_kaggle.txt`)

| Backend | ms | Speedup |
|---|---|---|
| scalar | 26.31 | 1.00x |
| ilp (x4) | 30.50 | 0.86x |
| avx2 | 7.91 | 3.32x |
| openmp-4 | 7.07 | 3.72x |
| cuda naive atomics (GPU) / + PCIe | 24.81 / 45.94 | 1.06x / 0.57x (copy in 18.94, out 2.14) |
| cuda warp shuffle (GPU) / + PCIe | 0.83 / 21.61 | 31.65x / 1.22x (copy in 18.71, out 2.02) |
| cuda warp ptx (GPU) / + PCIe | 0.83 / 21.80 | 31.62x / 1.21x (copy in 18.81, out 2.08) |
| rayon-1+ilp / rayon-1+avx2 | 33.57 / 8.38 | 0.78x / 3.14x |
| rayon-2+ilp / rayon-2+avx2 | 17.27 / 4.59 | 1.52x / 5.74x |
| rayon-4+ilp / rayon-4+avx2 | 15.24 / 3.56 | 1.73x / 7.39x |

## 6.7 MPI (deadline-risk kernel over ranks)

### 6.7.1 M1, 50,000,099 bags (`r6_mpi_50M.txt`, 2 runs)

| Mode | Ranks | Load ms (r1 / r2) | Compute ms (r1 / r2) | Compute speedup (r1 / r2) | End-to-end (r1 / r2) |
|---|---|---|---|---|---|
| read | 1 | 202.4 / 71.6 | 74.01 / 73.94 | 1.00 / 1.00 | 1.00 / 1.00 |
| read | 2 | 51.1 / 48.6 | 36.98 / 38.47 | 2.00 / 1.92 | 3.14 / 1.67 |
| read | 4 | 42.2 / 34.8 | 18.50 / 18.52 | 4.00 / 3.99 | 4.55 / 2.73 |
| read | 8 | 33.6 / 28.8 | 11.95 / 12.56 | 6.19 / 5.89 | 6.07 / 3.52 |
| scatter | 1 | 291.9 / 236.8 | 74.04 / 74.03 | 1.00 / 1.00 | 1.00 / 1.00 |
| scatter | 2 | 139.7 / 138.6 | 36.97 / 36.98 | 2.00 / 2.00 | 2.07 / 1.77 |
| scatter | 4 | 149.1 / 150.3 | 20.93 / 20.95 | 3.54 / 3.53 | 2.15 / 1.81 |
| scatter | 8 | 302.1 / 283.5 | 16.50 / 16.89 | 4.49 / 4.38 | 1.15 / 1.03 |

Reduce times 0.000–0.006 ms. All results identical; class totals 35,861,889 / 9,721,115 / 4,417,095, slack sum 139,195,725,044. README: "End-to-end figures are unreliable. The load time is measured once."

### 6.7.2 Older MPI files

`mpi_50M.txt` (M1): read 8 ranks compute 4.74x, end-to-end 3.47x; scatter 8 ranks compute 4.27x, end-to-end 1.43x. `mpi_10M.txt` (M1, 10,000,168 bags): read 8 compute 6.10x, end-to-end 1.90x; scatter 8 compute 6.17x, end-to-end 0.72x. `mpi_50M_kaggle.txt` (**saved, not re-measured**, 4 cores, `--oversubscribe`): read 4 ranks compute 2.29x, end-to-end 2.23x; scatter 4 ranks compute 2.23x, end-to-end 0.63x.

## 6.8 Pipeline, parallel runs and sweep through the API (`r6_api.txt`)

Header: "Measured through the live API (release build). Jobs run one at a time. Debug build: False."

**Pipeline, baseline config, 3 jobs** (phase times in ms):

| Job | generate (baseline, speedup) | classify (baseline, speedup) | simulate | aggregate (baseline, speedup) | p | Ceiling | Full |
|---|---|---|---|---|---|---|---|
| 1 | 14.3 (68.2, 4.76x) | 0.1 (0.4, 2.54x) | 701.1 | 1.4 (7.9, 5.44x) | 9.8% | 1.109x | 1.084x |
| 2 | 14.4 (67.9, 4.73x) | 0.1 (0.4, 2.53x) | 692.3 | 1.4 (7.9, 5.46x) | 9.9% | 1.110x | 1.085x |
| 3 | 14.5 (67.8, 4.67x) | 0.1 (0.4, 2.55x) | 696.5 | 1.4 (7.9, 5.46x) | 9.8% | 1.109x | 1.084x |

Ranges: simulate 692.3–701.1 ms; p 9.8–9.9%; ceiling 1.109–1.110x; full 1.084–1.085x.

**Sweep**, 6 × 4 × 4 × 100% = 96 experiments, 100,000 bags requested each, 3 identical sweeps:

| Sweep | 1-thread wall ms | 8-thread wall ms | Speedup | Efficiency | Compared | All identical |
|---|---|---|---|---|---|---|
| 1 | 24,544 | 4,718 | 5.20x | 65.0% | 96 | True |
| 2 | 24,233 | 4,742 | 5.11x | 63.9% | 96 | True |
| 3 | 25,265 | 5,607 | 4.51x | 56.3% | 96 | True |

(Parallel runs: 6.4.3 and 6.6.3.)

## 6.9 Figures in the repository

| File | What it shows | Axes and units | How to read it |
|---|---|---|---|
| `results/validation.png` | three histograms of one generated dataset, produced by `analysis/validate.py` | (1) bag arrivals over the day, x = hours (96 bins), y = bags per bin; (2) bag weight, x = kg (60 bins), y = bags; (3) time to deadline at arrival, x = minutes (80 bins), y = bags | (1) morning peaks near 05:30–06:00 and 08:00, a midday lull, and evening peaks near 17:00 and 20:00, following the departure banks shifted earlier by the check-in window; (2) a right-skewed weight distribution with a spike at 32 kg from clamping; (3) 10–155 min to deadline, mostly 40–100 min. Which `.bin` file was plotted is **UNCLEAR** (the bar heights, ~6,000 per bin over 96 bins, suggest about 250k bags, not the 50M file now in `results/`) |
| `docs/benchmark 1.png` | screenshot of the **legacy** "Benchmark lab" tab (removed in R5) in a browser: bar charts of kernel time for "Apple M1 (8 cores)" (scalar … rayon-8+neon, x 0–16 ms) and "Kaggle: Xeon 4 logical cores + Tesla T4" (scalar … cuda ptx kernel) | x = ms, lower is better | consistent with `kernels_10M_metal.txt` and `kernels_10M_kaggle.txt`; not referenced by the README (AUDIT §6.1). The screenshot also shows the author's browser chrome and bookmarks |
| `docs/benchmark 2.png` | second legacy screenshot: end of the Kaggle chart (cuda warp + PCIe ≈ 21.6 ms), a stacked bar "Where the GPU time goes: unified memory vs PCIe" (copy in / kernel / copy out for M1 Metal and T4 CUDA warp, x 0–24 ms), and "MPI end-to-end speedup, 50M bags" (x = ranks 1, 2, 4, 8; y = 0–3.6x; Kaggle read/scatter, M1 read/scatter) | ms; speedup | the MPI lines match `mpi_50M.txt` (M1 read reaching ~3.5x at 8) and `mpi_50M_kaggle.txt` (scatter falling to 0.63x). AUDIT §6.2: this stacked chart "omits launch overhead (6.72 ms drawn, 7.41 ms measured for Metal)" |

## 6.10 Tables in the README

The README's result tables (lines 160–262) are summaries of the files above; each row names its source. They are checked in Part 8.6.

## 6.11 Local job records (`data/runs/`, gitignored)

| Record | Content | Key values |
|---|---|---|
| 6 simulations Normal/dijkstra/fcfs/100%/×1/250k | all 9,245 delayed, checksum `61aa19cce7723683` | 3 with a pipeline: p = 0.0901–0.1154, ceiling 1.099–1.130x, full 1.074–1.099x |
| `sim-1795731446265-1`, `sim-1795756537197-2` | Normal/congestion/70% | 134,427 delayed, `29e8786b1e8e3fae`; second has p 0.0916, ceiling 1.101x, full 1.072x |
| `sim-1795731446321-2`, `sim-1795732178771-1` | SorterOverload/ecmp/100% ×1 | 28,606, `144494908f029748` |
| `sim-1795731889955-3` | ConveyorFailure/dijkstra/100% | 9,249 delayed (3.698%), checksum `5cb8051ec8a81a27` |
| `sim-1795732121966-5` | Normal/dijkstra/100%, 1,000,000 requested | 948,931 delayed (94.887%), `447bab1456c505d7` |
| `sim-1795756847066-16` | SorterOverload/ecmp/100%, **server multiplier 11** | 0 delayed, `d4d01949b6cfb68f`, p 0.1052, ceiling 1.118x, full 1.092x |
| `sweep-1795756596593-6` | 96 experiments, 100k, threads [8] | 1-thread 24,210.0 ms; 8-thread 4,646.4 ms; 5.21x; 65.1%; 96 identical; delayed 0.000–0.0379% |
| `sweep-1795756723279-14` | same grid, threads [2, 4, 8] | 1: 24,274.8 ms; 2: 12,220.8 ms (1.99x, 99.3%); 4: 7,369.8 ms (3.29x, 82.3%); 8: 4,625.5 ms (5.25x, 65.6%); 288 identical; delayed 0.000–0.0379% |
| `par-1795756543292-3` | generate, rayon, 8 thr, 10M, 5 reps, chunk 64 | seq 2,899.73 ms, rayon 854.20 ms, 3.395x, match |
| `par-1795756580977-4` | classify, rayon-neon, 8 thr, 10M, 10 reps | 14.17 vs 2.28 ms, 6.227x |
| `par-…-7` to `par-…-13` | classify at 250,086 bags, 3 reps, chunk 3,907, one per backend | rayon-neon 1.48x, openmp 1.53x, scalar 1.00x, ilp 1.68x, neon 2.09x, rayon-ilp 1.58x, metal 1.12x |
| `bench-1795756785813-15` | 1,000,000 requested, 10 reps, 1 warm-up, backends scalar ilp neon openmp rayon-ilp rayon-neon metal, threads 1/2/4/8 | median ms: scalar 3.399; ilp 2.772 (1.23x); neon 1.804 (1.88x); openmp(8) 3.359 (1.01x, eff 12.6%); rayon-ilp 1/2/4/8: 3.129/1.746/1.060/0.964 (1.09/1.95/3.21/3.53x); rayon-neon 1/2/4/8: 1.689/0.933/0.505/0.435 (2.01/3.64/6.73/7.82x; eff 106.8/96.6/89.3/51.9%); metal 1.471 (2.31x); all identical to scalar |

---

# PART 7: Ablations, baselines and comparisons

| # | Comparison | What changed | Numbers | What it shows | Source |
|---|---|---|---|---|---|
| 1 | Sequential vs Rayon generator | threads 1, 2, 4, 8 | CLI rayon-8 4.74x–5.09x; rayon-1 0.74x–0.80x | Parallel generation scales sublinearly; one Rayon thread is slower than the sequential code (overhead) | `r6_gen_10M.txt` |
| 2 | Generator workload size | 10M vs 50M | rayon-8 4.74x–5.09x vs 2.98x (efficiency 59–64% vs 37%) | Efficiency falls at 50M; cause **not measured** | `r6_gen_10M.txt`, `r6_gen_50M.txt` |
| 3 | Generator chunk (API) | 64 flights vs 1,042 flights | 2.95x–3.70x vs 2.06x | Large chunks leave threads idle (README "Known issue") | `r6_api.txt` |
| 4 | CLI vs API generator | same 10M size | 4.74x–5.09x vs 2.95x–3.70x | API path slower; "Why the API is slower than the CLI was not investigated" (README) | `r6_gen_10M.txt`, `r6_api.txt` |
| 5 | Scalar baseline, vectorisation on vs off | compiler auto-vectorisation | scalar 14.11 vs 21.16 ms; NEON speedup 2.10x vs 3.15x | Every speedup depends on its baseline; the repo uses the harder (vectorised) baseline | `kernels_10M.txt`, `kernels_10M_novec.txt` |
| 6 | ILP (4 accumulators) vs scalar | manual unrolling | M1 1.08x; Kaggle 0.86x; novec 0.91x | ILP gains little or loses | kernel files |
| 7 | SIMD alone | NEON / AVX2 | M1 2.10x; Kaggle 3.32x | Vector lanes on one thread | kernel files |
| 8 | Threads × SIMD | Rayon 1, 2, 4, 8 over NEON | 2.09x, 4.12–4.15x, 7.08–7.72x, 7.08–7.25x | Stops improving beyond 4 threads; cause **not measured** (README) | `r6_kernels_10M.txt` |
| 9 | Threads × ILP | Rayon 1–8 over ILP | 1.08x, 2.13–2.14x, 4.21–4.22x, 5.57–6.08x | Scales further than ×NEON in absolute terms but slower | same |
| 10 | OpenMP vs Rayon | thread library | OpenMP-8 3.26–3.30x vs rayon-8+ilp 5.57–6.08x | Different kernels inside (plain loop vs ILP); not a pure library comparison | same |
| 11 | GPU kernel-only vs with copies | include copy in/out | Metal 4.07–4.10x vs 1.89–1.91x; CUDA warp 31.65x vs 1.22x | Data movement dominates, especially over PCIe | `r6_kernels_10M.txt`, `kernels_10M_kaggle.txt` |
| 12 | CUDA reduction variants | naive atomics / warp shuffle / inline PTX | 24.81 / 0.83 / 0.83 ms | Atomic contention costs ~30×; hand PTX gives nothing over shuffle | `kernels_10M_kaggle.txt` |
| 13 | MPI read vs scatter | data distribution | 8 ranks end-to-end read 3.52–6.07x vs scatter 1.03–1.15x | Communication outweighs compute in scatter | `r6_mpi_50M.txt` |
| 14 | MPI rank count | 1, 2, 4, 8 | compute 2.00, 3.99–4.00, 5.89–6.19x | Compute scales; end-to-end does not | same |
| 15 | Pipeline: parallel phases vs all sequential | parallel phase implementations on/off | full 1.084–1.085x, ceiling 1.109–1.110x | Amdahl limit from the sequential simulation | `r6_api.txt` |
| 16 | Sweep 1 thread vs 8 | thread pool size | 4.51x–5.20x (r6); local 2/4/8: 1.99x / 3.29x / 5.25x | Parallelism across experiments pays off | `r6_api.txt`, `data/runs/sweep-1795756723279-14.json` |
| 17 | Routing strategies | dijkstra / ecmp / congestion / deadline | FCFS 100%: 3.70 / 3.69 / 3.25 / 3.34% | Routing matters little at 100% load in Normal | `r6_compare_100.txt` |
| 18 | Queue policies | fcfs / priority / edf / spt | dijkstra 100%: 3.70 / 3.89 / 0.00 / 1.51% | Policy matters more than routing at moderate load | same |
| 19 | Capacity | 100% / 70% / 55% | dijkstra fcfs 3.70 / 77.42 / 89.26% | Overload; EDF stops helping (79.59% at 70%) | `r6_compare_*`, `compare_phase4_overload55.txt` |
| 20 | Server multiplier | ×1 vs ×2 | 3.70% vs 0.00% (all 16) | Over-provisioning removes all delay | `compare_phase4.txt` |
| 21 | Scenarios | six | see 6.3 | ScreeningDelay and PeakSurge hurt most; ConveyorFailure barely matters; SorterOverload has the largest routing effect | `r6_scenarios.txt` |
| 22 | Collection on vs off | observation | identical checksums; run time +0–0.33 s and peak RSS +15–91 MB (extreme off/on pairings of the 5 runs each) | Observation does not change results | `engine2_1M_collect.txt` |
| 23 | Bag count at fixed servers | 250k vs 1M | 3.697% vs 94.887% delayed | Saturation, not an engine fault | same; `scaling_seq_fixed_network.txt` for `engine.rs` |
| 24 | Old engine vs new | `engine.rs` chain vs `engine2` layered | 250,086 bags: 7,523 delayed (engine.rs) vs 9,245 (engine2) | Different networks; not a like-for-like comparison | `scaling_seq.txt`, `r6_api.txt` |

**Dropped or abandoned alternatives recorded in the repo:**

- A* routing: "not implemented: with an exact distance heuristic on this layered graph it expands the same nodes as Dijkstra" (`docs/assumptions.md` Phase 4).
- CUDA `sm_60`: "dropped from the build because CUDA 13 no longer supports Pascal" (`docs/backends.md`).
- Legacy web tabs (Replay of `engine.rs`, Scale, Journey, Arena, Airport/Movie/Compute, Benchmark lab): removed or replaced (AUDIT §7; README Phases R1–R6). `docs/benchmark 1.png`, `2.png` are screenshots of the old Benchmark lab.
- Endpoints `/api/info`, `/api/run`: removed (`crates/bagflow-api/tests/api.rs:119-125` `legacy_endpoints_are_gone`).
- The "5.08x" sweep figure and "50M bags generate in about 6.5 s": withdrawn as untraceable (README).

**Expected ablations that are missing:**

- Results at the current generate default chunk (16/17 flights): not measured (README).
- More than one seed: every result uses seed 42; no variability across seeds is reported.
- Kernel throughput as a function of size (only 10M in files; 1M and 250k only in local records).
- OpenMP thread scaling (fixed at OpenMP's default in the CLI and benchmarks).
- Sweep at several thread counts in a `results/` file (only in a local record).
- Repeated runs of the generator at 50M (one run only).
- Theory validation of `engine2` (README: "`engine2` has no theory validation of its own").
- Cause of the API vs CLI generation gap, the 4-thread plateau of Rayon+NEON, and the 50M efficiency drop: not measured.
- Memory and GPU utilisation per backend: not collected (`web/src/components/performance/BenchResults.tsx` "Not collected").

---

# PART 8: Validation and rigour audit

Status key: **Verified** (evidence in the repo or re-derived here), **Not verified** (claimed but not checked in this session), **Concern** (a weakness or inconsistency).

## 8.1 Tests

Tests were **not run in this session** (no long commands were run). Counts are from the source.

| File | Tests | What they assert |
|---|---|---|
| `crates/bagflow-core/src/rng.rs` | 3 | same seed same numbers; streams differ; flight streams differ |
| `generator.rs` | 6 | same seed identical (checksum and full equality); different seed differs; target reached and columns agree; arrival < deadline, sorted, weight 30–320 dg; parallel = sequential (1, 2, 4 threads); traced runs match and task sizes cover every bag |
| `events.rs` | 1 | heap order: time, then kind, then bag, then seq |
| `state.rs` | 6 | 12 states; legal happy path; inspection and transfer paths; terminal states final; illegal jumps rejected; any live state can become Delayed |
| `engine.rs` | 3 | conservation; every transition legal, chained and time-ordered; same seed same log, different seed differs |
| `engine2.rs` | 3 | Dijkstra reaches only the bag's own loader; all 16 strategy × policy combinations conserve bags (no unfinished, loaded + delayed = n, all reach loaders); same inputs same checksum |
| `queueing.rs` | 3 | Erlang C known values; M/M/1 W_q = 400 s; engine within 8% of M/M/c for 5 cases (400,000 customers) and utilisation within 0.02 |
| `scenarios.rs` | 4 | every scenario conserves bags; surge adds bags; screening outage raises sojourn; edge outage diverts Dijkstra traffic from Sorter 1 |
| `crates/bagflow-core/tests/collect.rs` | 8 | pinned checksums with collection off and on (dataset `168e0a37b06224f9`; 9,245 / 28,606 / 134,427 delayed and the three engine checksums, lines 46–52); collection changes nothing in any scenario; histories reproduce the run; series match histories; series show the capacity outage; inspection time recoverable; options off collect nothing; progress rises to total and changes nothing |
| `crates/bagflow-kernels/src/lib.rs` | 2 (+1 Metal, +1 CUDA, compiled only when built) | every backend matches scalar on lengths 0, 1, 3, 7, 8, 9, 17, 1000, n−3 (counts, slack sum and class array); classes not degenerate; Metal and CUDA variants match scalar on awkward lengths (skip if no device) |
| `crates/bagflow-kernels/src/traced.rs` | 1 | traced kernels match scalar and cover every chunk |
| `crates/bagflow-api/src/bench.rs` | 2 | statistics; plan adds baselines once and expands thread counts |
| `parallel.rs` | 2 | default generate chunk equals the pipeline chunk at every size; default chunk gives more than two tasks per batch |
| `static_results.rs` | 2 | parses every row of every file; values match the files |
| `sweep.rs` | 2 | grid covers every combination once; a different or failed result is a mismatch |
| `crates/bagflow-api/tests/api.rs` | 15 | health lists options and backends; unavailable backends give a reason and are refused; legacy endpoints are gone; every run reports a measured pipeline; parallel runs return task records and match sequential; aggregation can use a retained run; sweep runs every experiment and matches one thread; rejects bad input; simulation views agree; redirected bags keep their own flight; keeps recent runs and persists history; full queue is refused; benchmark runs real kernels; static results are flagged; three fixed configs keep their results |
| `crates/bagflow-core/src/operational.rs` | 2 | `plan` covers every bag once, contiguously, with at least `min(workers × 4, n)` tasks; on 15,000 bags, sequential = parallel precompute for every routing (routes only for dijkstra and ecmp), and for every routing × policy `run_with_pre` gives the same checksum, delayed count and arrivals as `run_with` |
| `crates/bagflow-core/tests/operational.rs` | 2 | `pinned_results_for_workers_1_2_4_8`: for the three pinned configurations (250,086 bags) and workers 1, 2, 4, 8, the parallel precompute equals the sequential one, routes present only for dijkstra and ecmp, task count = kinds × workers × 4, every worker id < workers and end ≥ start, check-in and flight-grouping task sizes sum to the bag count, and the run reproduces the exact checksum (`61aa19cce7723683`, `144494908f029748`, `29e8786b1e8e3fae`), delayed count and delayed %. `bags_are_conserved`: on 30,000 bags at 40% capacity, for all 6 scenarios × 4 routings, loaded + delayed + unfinished = bags and check-in arrivals = bags, with and without the precompute; both give the same checksum, delayed and arrivals; with routes, total precomputed hops = total node visits |
| `crates/bagflow-api/tests/api.rs` (`operational_parallel_keeps_results_and_reports_tasks`) | 1 | through HTTP with 4 workers: Normal/dijkstra/100% and Normal/congestion/70% keep their pinned checksum and delayed count; `operational` has `enabled`, `workers` 4, `routes_precomputed` true/false, identical precompute, 3 or 2 × 4 × 4 tasks with valid worker ids and times; the pipeline has a `precompute` phase; `workers: 0` is refused with 400 |
| Web (`web/`) | 0 | README: "The web app has no automated tests." CI runs `npm run build` and `npm run lint` only |

Total Rust test functions: 29 core unit + 8 core integration + 5 kernels (2 of them conditional) + 8 API unit + 15 API integration = **65**. Pass/fail counts: **Not verified** in this session. AUDIT §5.1 (older commit `dcf0d98`) reported "28 passed" (core) and "3 passed" (kernels); the numbers differ from today's code, so they are stale. CI configuration exists (`.github/workflows/ci.yml`); CI results are **NOT FOUND** in the repo.

## 8.2 Audit table

| Item | Status | Evidence |
|---|---|---|
| Parallel generator reproduces the sequential dataset | Verified | tests 8.1; CLI "identical" for every row of `r6_gen_*`; API `matches sequential True`; `pipeline.rs` fails the job otherwise |
| Every kernel backend matches scalar | Verified | tests; every row `identical` in kernel files; runner checks every repetition |
| Parallel aggregation matches sequential and the engine | Verified | `pipeline.rs` `matches_engine`; job fails otherwise |
| Sweep results identical across thread counts | Verified | `r6_api.txt` "all identical True" ×3; local records 96 and 288 compared |
| `engine2` determinism | Verified | identical checksums in every repeat (6.1.2, 6.5) |
| Collection does not change results | Verified | tests; `engine2_1M_collect.txt` paired checksums |
| `engine.rs` vs M/M/c theory | Verified (for `engine.rs`) | 15/15 within 5% (`r6_validation_mmc.txt`) |
| `engine2` vs theory | **Concern** | none exists (README, AUDIT) |
| Bag conservation in `engine2` | Verified | `all_sixteen_combinations_conserve_bags`, `every_scenario_conserves_bags`; `compare.rs` asserts `unfinished == 0` |
| Checksum strength | Concern (minor) | FNV-1a 64 is a non-cryptographic hash; collisions possible in principle; kernels also compare the full class array |
| Seed control | Verified | ChaCha8 streams and stateless hashes; seed 42 fixed in the API (`sim.rs:19`) |
| Variation across seeds | **Concern** | only seed 42 is ever reported |
| Timing repetitions and spread | Verified (reported) / Concern (noise) | medians and ranges in `r6_api.txt`; README: timings "noisy", single sequential repetition 8.76 s; sweep passes timed once each |
| Benchmark interference | Concern | AUDIT §12: "Read requests are still served during a job and can disturb benchmark timings" |
| Comparisons across machines | Verified (labelled) | Kaggle marked "saved, not re-measured"; static rows flagged `"static": true` |
| Kaggle results reproducible here | Not verified | needs an NVIDIA GPU and x86 AVX2 |
| MPI end-to-end | Concern | load timed once; run 1 1-rank load 202 ms vs 72 ms (README) |
| Cross-validation, held-out test, tuning on test, leakage, class-imbalance handling | Not applicable | no learned model |
| Reproducibility from saved files | Partly verified | result files carry commands and headers; `bags_seed42.bin` is regenerable; `r6_api.txt` requests are not scripted (NOT FOUND) |
| Dataset checksum of the 50M file vs `cad211c3120bddfd` | Not verified | not recomputed (FNV over 1.2 GB) |
| Status colours | Concern (by design, labelled) | display rule, not engine output (`sim.rs:136`) |

## 8.3 Numbers that cannot be traced to a file

| Claim | Where | Status |
|---|---|---|
| Guided Demo "about 70 s in total … about 31 s each" | README "Guided Demo" | no result file |
| "every experiment delays under 0.04% of bags in the demo's runs" | README "Parallel sweep" | not in `results/`; supported by local records (max 0.0379%) |
| 1M through the API: "2.2-2.8 s per run", "601 MB", "1,010 MB", `/network` "1.0-5.8 MB, 11-56 ms", `/baggage` "14-76 ms" | AUDIT §12 | "not saved in `results/`" (AUDIT itself). The related 1M run times and delayed rates *are* in `engine2_1M_collect.txt` (CLI, not API) |
| "about 16 MB per 250k bags" | AUDIT §9 (estimate) | supported by `engine2_1M_collect.txt` `history_mb=16.5` |
| "5.08x" sweep | README says it could not be traced and is not used | withdrawn |
| "50M bags generate in about 6.5 s" | README "Figures removed" | withdrawn |
| "Kernel is memory-bound (26-36 GB/s)" | `docs/backends.md` | README: "not measured" |
| "Threaded timings vary ~30%" | `docs/backends.md` | contradicted: up to ~2× in files (AUDIT §1 finding 7) |
| "Kernel ~120 GB/s (about 40% of T4 peak)" | `docs/backends.md` | 120.3 GB/s is in `kernels_10M_kaggle.txt`; the "40% of peak" is not traced |
| "pageable copy-in 18.7 ms (~4.8 GB/s)" | `docs/backends.md` | 18.71 ms traced; 4.8 GB/s recomputes as 9 bytes × 10,000,168 / 18.71 ms = 4.81 GB/s if 9 input bytes per bag are copied (assumption; UNCLEAR) |

---

# PART 9: Interfaces

## 9.1 HTTP API (`crates/bagflow-api/src/lib.rs:66-87`)

Base address `http://127.0.0.1:3001`. JSON, snake_case. Times are milliseconds. Unknown request fields are rejected (`deny_unknown_fields`). Errors: `{ "error": { "code", "message" } }` with codes `invalid_request` (400), `not_found` (404), `queue_full` (429), `backend_unavailable` (400), `run_not_retained`, `internal` (500) (`error.rs`, `jobs.rs`, `bench.rs:24`). CORS is fully permissive (`CorsLayer::permissive()`, `lib.rs:90`). Any other path returns 404 `no such endpoint`.

| Method and path | Input | Output |
|---|---|---|
| `GET /api/health` | — | `status`, `version`, `engine`, `debug_build`, `machine {os, arch, logical_cores}`, `backends[] {id, available, detail, reason, takes_threads, gpu}`, `queue {running, queued, max_queued}`, `last_simulation`, `options {scenarios, routings, policies, parallel_workloads, parallel_limits, sweep_defaults, sweep_limits, simulation_defaults, simulation_limits, benchmark_limits}` (`lib.rs:126-186`) |
| `POST /api/simulations` | `SimConfig {scenario, routing, policy, capacity_pct, server_multiplier, bag_count, threads, classify_backend}`, all optional (defaults in Part 4) | `202 {id, status: "queued"}` |
| `POST /api/simulations` (operational parallel mode) | also `operational_parallel` (bool, default false) and `workers` (default logical cores, same range as `threads`); see 3.15a | as above; the result gains an `operational` block (also in `GET /api/simulations/:id` and `/metrics`) and, with the mode, a `precompute` pipeline phase |
| `GET /api/simulations/:id` | — | job record without result + `dataset`, `engine_checksum`, `sim_wall_s`, `summary`, `pipeline`, `retained` |
| `GET /api/simulations/:id/events` | — | SSE stream (9.2) |
| `GET /api/simulations/:id/metrics` | — (finished runs) | full stored result: `dataset`, `engine_checksum`, `nodes[]`, `pipeline`, `sim_wall_s`, `status_rule`, `summary`, `wait_histogram_bounds_ms`, plus `id`, `config`, `retained` |
| `GET /api/simulations/:id/network?at_ms=` | retained run only | nodes with positions and stats, edges with travel time and traffic, outages, time-series |
| `GET /api/simulations/:id/baggage?page&page_size&status&flight&node&q&sort&order&at_ms` | retained run; `page_size` ≤ 500 (`MAX_PAGE_SIZE`) | a page of bags, total, counts |
| `GET /api/simulations/:id/baggage/:bag_id?at_ms=` | retained run | one bag's attributes and hop timeline |
| `POST /api/benchmarks` | `BenchConfig {bag_count, backends[], threads[], repetitions, warmup}` (defaults 1,000,000, all available, all cores, 10, 1) | `202 {id, status}` |
| `GET /api/benchmarks/:id`, `/events`, `/metrics` | — | record; SSE; result `{bags_requested, workload_size, seed, repetitions, warmup, results[], data_footprint_bytes_computed, definitions, machine, debug_build, static}` |
| `POST /api/parallel-runs` | `ParallelConfig {workload, backend, threads, bag_count, chunk_size, repetitions, simulation_id}` (defaults classify, auto, all cores, 250,000, auto, 3) | `202 {id, status}` |
| `GET /api/parallel-runs/:id`, `/events`, `/metrics` | — | record; SSE; result `{workload, backend, threads, bags, chunk, repetitions, sequential, selected, speedup, matches_sequential, sequential_checksum, result_checksum, output, simd, gpu, task_note, definitions, machine, debug_build}` |
| `POST /api/sweeps` | `SweepConfig {scenarios[], routings[], policies[], capacity_pcts[], server_multiplier, bag_count, threads[]}` | `202 {id, status, experiment_count}` |
| `GET /api/sweeps/:id`, `/events`, `/metrics` | — | record; SSE; result `{experiment_count, experiments[], passes[], consistency, dataset, prepare_ms, definitions, machine, debug_build}` |
| `GET /api/static-results` | — | `{static: true, note, rows[]}` parsed from `kernels_10M_kaggle.txt`, `kernels_10M_metal.txt`, `mpi_10M.txt`, `mpi_50M.txt`, `mpi_50M_kaggle.txt` (`static_results.rs:40-46`) |
| `GET /api/history?kind=` | optional `simulation`/`benchmark`/`parallel`/`sweep` | `{items[]}`: each record without result, plus a short `summary` and `retained` |

**Real examples** (taken from local records in `data/runs/`; a record is exactly what `GET …/:id` and `/metrics` serve, as `lib.rs` shows):

Simulation request body and record header (`data/runs/sim-1795756506633-1.json`):

```json
{"bag_count": 250000, "capacity_pct": 100, "classify_backend": "rayon-neon", "policy": "fcfs",
 "routing": "dijkstra", "scenario": "Normal", "server_multiplier": 1, "threads": 8}
```
```json
{"id": "sim-1795756506633-1", "kind": "simulation", "status": "done",
 "created_at_ms": 1795756506633, "started_at_ms": 1795756506633, "finished_at_ms": 1795756508026,
 "config_hash": "a058fa289f15745e", "error": null}
```

Its `summary` and `dataset`:

```json
{"average_waiting_time_s": 760.4189762481706, "congested_facilities": 4, "delayed_bags": 9245,
 "delayed_pct": 3.6967283254560432, "end_ms": 80679374, "in_transit": 0, "loaded_on_time": 240841,
 "max_queue": 9743, "max_utilisation": 0.6525583463255614, "mean_sojourn_s": 807.3695888614317,
 "on_time_loading_rate": 0.9630327167454396, "p95_sojourn_s": 2395.0, "processed_bags": 250086,
 "tight_delayed": 837, "tight_delayed_pct": 7.424820367249179, "tight_total": 11273,
 "total_bags": 250086, "unfinished_bags": 0}
{"bags_generated": 250086, "bags_requested": 250000, "bags_simulated": 250086,
 "checksum": "168e0a37b06224f9", "flights": 1650, "seed": 42}
```

One `nodes[]` entry (Screening A):

```json
{"arrivals": 167678, "avg_wait_s": 860.5488116210832, "capacity": 10, "completions": 167678, "id": 2,
 "max_queue": 9743, "max_wait_ms": 2678899, "mean_service_ms": 1800, "name": "Screening A",
 "peak_window_utilisation": 1.0, "processing_rate_per_s": 5.555555555555555, "status": "congested",
 "total_service_ms": 470035614, "type": "Screening", "utilisation": 0.6417974707831551,
 "wait_histogram": [42629, 2772, 2530, 3654, 2638, 1085, 2903, 7354, 21046, 43656, 37411],
 "was_offline": false, "x": 470.0, "y": 90.0}
```

`processing_rate_per_s` = servers / mean service = 10 / 1.8 s = 5.556. **MATCH**. Wait histogram sums to 167,678 = arrivals. **MATCH** (42,629 + 2,772 + 2,530 + 3,654 + 2,638 + 1,085 + 2,903 + 7,354 + 21,046 + 43,656 + 37,411 = 167,678).

Parallel run (`data/runs/par-1795756580977-4.json`): config `{"backend": "rayon-neon", "bag_count": 10000000, "chunk_size": 156250, "repetitions": 10, "simulation_id": null, "threads": 8, "workload": "classify"}`; result `selected.wall_ms` 2.276292, 65 tasks on 8 workers; first task `{"end_ms": 0.232125, "id": 0, "size": 156250, "start_ms": 0.034417, "worker": 0}`; worker 0 `{"busy_ms": 2.05021, "size": 1718750, "tasks": 11, "worker": 0}`; `sequential_checksum` = `result_checksum` = `3f7ba14f1b08ad81`; `output` `{"at_risk": 1944284, "critical": 883694, "on_track": 7172190, "slack_sum_s": 27835824747}` (the same class counts as `r6_kernels_10M.txt`).

Sweep experiment (`data/runs/sweep-1795756596593-6.json`, experiment 0):

```json
{"capacity_pct": 100, "error": null, "index": 0, "policy": "fcfs", "routing": "dijkstra", "scenario": "Normal",
 "result": {"bags_simulated": 100212, "delayed_bags": 0, "delayed_pct": 0.0, "engine_checksum": "f7dbe72df3e07bf7",
  "loaded_on_time": 100212, "max_queue": 12, "max_utilisation": 0.26986304477919637, "mean_sojourn_s": 46.982876302239255,
  "p95_sojourn_s": 56.0, "tight_delayed_pct": 0.0, "unfinished_bags": 0}}
```

Health response: **no saved example** in the repo. Its shape is in the table above; on an M1 the unavailable backends and reasons are `avx2`, `rayon-avx2` ("AVX2 needs an x86_64 CPU with AVX2"), `cuda-naive`, `cuda-warp`, `cuda-ptx` ("CUDA was not built: CUDA is only built on Linux with nvcc"), `mpi` ("live MPI runs are not wired into the runner; see the static results") (`runner.rs:86-104`, `build.rs:40`).

## 9.2 Server-sent events

`GET /api/{simulations|benchmarks|parallel-runs|sweeps}/:id/events`. Each message has an event name and a JSON `data` payload of the `Progress` struct (`jobs.rs` `Progress`; `lib.rs` `sse`):

```
event: progress
data: {"status":"running","phase":"<phase>","done":<n>,"total":<n>,"error":null}
...
event: done            (or: event: failed)
data: {"status":"done","phase":"done","done":<n>,"total":<n>,"error":null}
```

Sweeps add a `detail` object: `pass_index`, `passes`, `pass_threads`, `experiments`, `completed`, `running`, `failed`, `active[] {index, worker, start_ms}`, `finished[] {index, worker, start_ms, end_ms, status}` (`sweep.rs:209-226`). No recorded SSE transcript exists in the repo; the lines above give the format, not captured values.

## 9.3 Command-line tools

| Command | Arguments | Output |
|---|---|---|
| `bagflow-sim gen` | `[--seed 42] [--bags 250000] [--mode seq\|par\|bench] [--threads N] [--out results]` (`crates/bagflow-sim/src/main.rs`) | `seq`/`par`: writes `bags_seed{seed}.bin`, `bags_seed{seed}_sample.csv` (2,000 rows), `flights_seed{seed}.csv` and prints counts, shares, an arrival histogram and the checksum; `bench`: the table in `r6_gen_10M.txt` |
| `compare` | `<bags=250000> <k=1> <pct=100>` | 16-row routing × policy table and two node-detail tables (`r6_compare_100.txt`) |
| `scenarios` | `<bags=250000> <pct=100>` | 6 scenarios × 4 routings × {fcfs, edf} (`r6_scenarios.txt`) |
| `validate` | — | 15-case M/M/c table (`r6_validation_mmc.txt`) |
| `scale` | `[sizes…]` | old-engine scaling table (`scaling_seq.txt`) |
| `slice` | flags (`arg`) | writes `web/public/{network.json,events.bin,summary.json}` from `engine.rs` (AUDIT §2.2) |
| `bagflow-kernels` | `[n=10000000]` | best-of-10 kernel table (`r6_kernels_10M.txt`) |
| `measure` (bagflow-core bin) | `<bags> <scenario> <routing> <capacity_pct> <off\|on> [server_multiplier]` | one line `bags=… checksum=…` (`engine2_1M_collect.txt`) |
| `operational_bench` (bagflow-core bin) | `[bags...]` (default 250000 1000000) | TSV per bag count and worker count 1/2/4/8: plain, precompute seq/par, loop, total, speedups, precompute fraction, checksum (medians of 3; output not saved to `results/`) |
| `scripts/run_mpi.sh` | `[bags.bin] [max ranks]`, env `MPI_EXTRA` | builds `bin/risk_mpi`, runs ranks 1, 2, 4, 8 in both modes, prints the table (`r6_mpi_50M.txt`) |
| `bin/risk_mpi` | `<bags.bin> [mode 0=read 1=scatter]` | one line `RESULT mode ranks n load_ms compute_ms reduce_ms on_track at_risk critical slack_sum` |
| `analysis/validate.py` | `<bags.bin>` | `results/validation.png` and one summary line |

Real command and output (`r6_gen_10M.txt` run 1): `target/release/bagflow-sim gen --bags 10000000 --mode bench` printed `rayon-8 0.617 16211492 5.09x 64% identical` (columns: time s, bags/s, speedup, efficiency, output).

## 9.4 Web app pages (`web/src/config/navigation.ts`, `web/src/app/router.tsx`)

| Path | Page | Built? |
|---|---|---|
| `/` | Main Dashboard | yes |
| `/operations/stages` | Stage Explorer | yes |
| `/operations/network` | Airport Network | yes |
| `/operations/parallel-studio` | Parallel Execution Studio (views A, B, C) | yes |
| `/operations/parallel-operations` | Parallel Airport Operations: sequential vs operational-parallel run of one configuration, checksum match, replay of recorded precompute tasks, facility cards (check-in registration and flight grouping Parallel; queues Sequential) | yes |
| `/operations/baggage` | Baggage Tracker | yes |
| `/operations/congestion` | Congestion Analysis | yes |
| `/performance` | Performance Lab | yes |
| `/performance/backends` | Backend Comparison | yes |
| `/performance/profiler` | Resource Profiler | **no**: `PlaceholderPage` with status `Planned` |
| `/experiments/scenarios` | Scenario Studio | yes |
| `/experiments/sweeps` | Parallel Sweeps | yes |
| `/experiments/history` | Simulation History | yes |
| `/guided-demo` | Guided Demo (6 steps) | yes |

Full page-by-page descriptions with on-screen labels are in `docs/PRESENTATION.md` Part 2. The web app requests `/api` on its own origin; Vite forwards it to `BAGFLOW_API_URL` (`web/vite.config.ts`).

Notebooks: **NOT FOUND** (none in the repo).

---

# PART 10: Limits, known issues and open items

Quoted from the repository where a note exists.

**Model scope**
- "Everything is one synthetic day." (README "Limits")
- "Early-bag storage, transfers with minimum connection times, loader limits, random equipment failures and edge capacity limits are not modelled. Misrouted bags never occur." (README)
- Transfer is "Not modelled" as a stage; "`NodeKind::Transfer` unused … `TransferPending` exists only in `engine.rs`" (AUDIT §3). Transfer bags enter at check-in.
- "With no live alternative a bag **uses the failed edge anyway**." (AUDIT §3; `engine2.rs:218`)
- Edge `capacity_per_min`, node `queue_capacity` and `Node.online` are never read (AUDIT §6.1).
- Screening inspection is extra time on the same server, "no separate start time" (`engine2.rs:61-62`); "the engine rejects no bags" (AUDIT §11.3).
- "Dijkstra costs and the congestion wait estimate use base mean service, without the extra inspection time." (AUDIT §6.3)
- "By design, 2% of origin bags arrive up to 15 min after the 45 min arrival cutoff (still before the 20 min loading deadline)." (AUDIT §6.3)
- "Server counts do not grow with the bag count, so more bags means more load unless you raise the server multiplier." (README). At 1M bags ×1, 94.9–99.1% delayed (`engine2_1M_collect.txt`).
- Utilisation uses nominal servers even during outages; windowed utilisation "can pass 1 just after an outage starts" (AUDIT §4, §11.3).
- "Facility colours and the 'congested' count are a display rule of the API, not engine output." (README)
- "There are no flight codes or destinations, so the UI must not invent any." (AUDIT §4)

**Validation**
- "This validates `engine.rs` only. **`engine2` has no theory validation of its own.**" (README)
- Only seed 42 is reported anywhere.

**Parallel results**
- "The kernel is a separate analysis of the bag table. **The simulation does not use its output.**" (README)
- Amdahl ceiling for one pipeline about 1.11x; measured full pipeline about 1.08x; "Both are computed from sums of separately timed phases, not from an end-to-end timing." (README)
- "Generation keeps some serial steps, so this is an upper bound" (on p) (`pipeline.rs:265`).
- "The API figures are **noisy**. … Why the API is slower than the CLI was not investigated." (README)
- "**Known issue:** the API's default chunk for `generate` allows only two tasks per generator batch of 2,048 flights … The measurements below were taken before the API's default `generate` chunk changed from about 1,042 flights to 16 … the new one has not been re-measured." (README)
- "On the M1, Rayon with NEON stops improving beyond 4 threads. The cause was not measured." (README)
- "M1 timings can differ much more between sessions than within one." (README)
- "**End-to-end figures are unreliable.** The load time is measured once." (MPI, README)
- Sweep: "each pass is timed once per sweep, and timings move on a fanless laptop" (README); the sweep grid at 100k/100% "demonstrates wall-time gain more than operational differences" (README).
- Kaggle figures "were **not re-measured**" (README).
- "Read requests are still served during a job and can disturb benchmark timings." (AUDIT §12)
- "The OpenMP thread count is still not selectable from the API (it uses the OpenMP default)" for benchmarks and the pipeline (AUDIT §12; `pipeline.rs` "this kernel uses OpenMP's own thread count").

**Not built** (README "Phases"; AUDIT §12 "Open")
- Resource Profiler page; `POST /api/scenarios`; scenario descriptions from the API; history delete and export; live MPI runs; a link between benchmarks and simulation runs; memory metrics and GPU utilisation.

**Operational**
- "Full bag histories stay in memory for the 3 newest simulations only." (README)
- "Jobs still queued or running at shutdown are not saved. Nothing prunes the folder." (AUDIT §12)
- "The API allows any origin (CORS is fully open), so while it runs, any web page open in your browser can call it and start jobs." (README)
- "The web app has no automated tests." (README)
- "On narrow screens, wide tables scroll sideways and the network graph is small" (README)
- `crates/bagflow-bench` is a dead "Hello, world!" crate; `kernels/CMakeLists.txt` is unused (AUDIT §6.1).
- `LICENSE`: no licence chosen.

**Operational parallel mode**
- Only per-bag precompute is parallel (check-in registration, flight grouping, and for dijkstra and ecmp without an edge outage, route and service times). The event loop, queues (screening and sorting included), server allocation and event order stay sequential; the whole-run gain is about 1.3x at 8 workers.
- Congestion and deadline routing, and any routing in ConveyorFailure, precompute only check-in registration and flight grouping.
- The measurement is stats only, not on a fully quiet machine (load average about 4.1), and not saved to `results/`. The 1M-bag checksum is not pinned.
- The browser check of the page covered only 100,000 bags with 4 workers. The complete test suite was not re-run after the last API change (adding `operational` to `GET /api/simulations/:id`).

---

# PART 11: Appendices

## Appendix A: Glossary of terms and symbols

| Term / symbol | Meaning in this project |
|---|---|
| a = λ/μ | offered load in M/M/c |
| Amdahl ceiling | 1 / (1 − p), the pipeline speedup limit if parallel phases took zero time |
| at-risk / critical / on-track | kernel classes: slack < 1,800 s / slack < 600 s / otherwise |
| baseline | the reference implementation in the same job: sequential generator, scalar kernel, sequential aggregation, 1-thread sweep pass |
| BFLW0001 | magic header of the binary bag file |
| best of 10 | minimum time over 10 repetitions (CLI kernel tool, MPI compute) |
| c | number of servers |
| capacity % | scales every node's servers, at least one each |
| chunk | a unit of work given to one task: flights (generate) or bags (classify, aggregate, Rayon kernel) |
| collection | optional recording of bag histories and node samples in `engine2` |
| delayed | loading finished after the bag's deadline |
| ECMP | equal-cost multipath routing (within 0.1%), chosen by bag id |
| EDF | earliest-deadline-first queue policy |
| efficiency | 100 × speedup / threads (sweeps, generator); benchmarks use the one-thread run of the same kernel as the numerator's baseline |
| engine checksum | FNV-1a 64 over all bag finish times |
| `engine.rs` / `engine2` | older 6-node chain engine / main 10-node engine |
| Erlang C | probability that an arriving customer waits in M/M/c |
| FCFS | first-come-first-served queue policy |
| FNV-1a | 64-bit Fowler–Noll–Vo hash, offset 0xcbf29ce484222325, prime 0x100000001b3 |
| full pipeline speedup | baseline_total / parallel_total (sum of phase medians) |
| ILP | instruction-level parallelism: 4 independent accumulators |
| λ, μ | arrival rate, service rate per server (1/100 s⁻¹ in validation) |
| median | middle value; mean of the two middle values for even counts (`bench.rs`, pipeline); lower-middle run for even counts (parallel runs) |
| MPI read / scatter | each rank reads its slice / rank 0 reads all and sends slices |
| NEON / AVX2 | ARM 128-bit / x86 256-bit SIMD instruction sets |
| p | parallelisable fraction: eligible baseline time / baseline total |
| p95 | 95th-percentile time in system |
| pairing range | [min(seq)/max(par), max(seq)/min(par)] over repetitions |
| priority policy | tight connections first, then priority, then standard |
| ρ | utilisation λ/(cμ) |
| Rayon | Rust data-parallel library with work stealing |
| retained run | one of the 3 newest simulations whose full data is in memory |
| scalar | the plain one-bag-at-a-time kernel (may be auto-vectorised by the compiler) |
| server multiplier (k) | multiplies every node's servers |
| slack | deadline − arrival − est (seconds) |
| sojourn | time from arrival to end of loading |
| SPT | shortest-processing-time queue policy |
| sweep | a grid of independent simulations run on 1 thread, then on more threads |
| SSE | server-sent events, the API's progress stream |
| tight connection | priority class 2 |
| utilisation (run) | busy server-time / (servers × span) |
| W_q | mean wait in queue |

## Appendix B: File-by-file index

| Path | Purpose | Key functions / items |
|---|---|---|
| `crates/bagflow-core/src/types.rs` | core types | `Node`, `Edge`, `Flight`, `NodeKind`, `Scenario`, `PRIO_*`, `FLAG_*` |
| `rng.rs` | seeded streams | `Stream`, `stream_rng`, `flight_rng` |
| `soa.rs` | bag table | `BagSoA::push`, `checksum`, `write_bin`, `write_csv` |
| `generator.rs` | data generation | `gen_flight`, `gen_bags`, `generate`, `generate_traced`, `generate_par`, `generate_on` |
| `trace.rs` | task/stage records | `Task`, `Stage`, `task`, `stage` |
| `network.rs` | networks | `slice_network`, `airport_network` |
| `events.rs` | event ordering | `EventKind`, `ScheduledEvent`, `LogEvent` |
| `engine2.rs` | main engine | `Strategy`, `Policy`, `inspection_ms`, `dijkstra_table`, `run`, `run_with`, `run_collected`, `RunStats`, `Outage` |
| `scenarios.rs` | scenarios | `ALL`, `build`, `Setup` |
| `collect.rs` | observation | `CollectOptions`, `History`, `Hop`, `WAIT_BOUNDS_MS` |
| `aggregate.rs` | aggregation | `sequential`, `sequential_traced`, `parallel`, `Aggregate::merge`, `checksum` |
| `engine.rs`, `state.rs` | old engine and state machine | `simulate`, `simulate_cfg`, `slice_bags`, `log_checksum`, `BagState` |
| `queueing.rs` | theory | `erlang_c`, `mmc_wq`, `poisson_bags`, `run_case` |
| `src/bin/measure.rs` | time/memory of one run | `main` |
| `crates/bagflow-sim/src/main.rs` | `gen` CLI | `report`, `main` |
| `crates/bagflow-sim/src/bin/{compare,scenarios,validate,scale,slice}.rs` | experiment CLIs | `main` |
| `crates/bagflow-kernels/build.rs` | optional backend build | `openmp`, `find_openmp`, `metal`, `cuda`, `skip` |
| `crates/bagflow-kernels/src/lib.rs` | kernels | `scalar`, `ilp`, `par`, `openmp`, `neon`, `avx2`, `simd_kernel`, `metal::Metal`, `cuda::Cuda`, `Out` |
| `src/runner.rs` | benchmark runner | `Backend`, `availability`, `efficiency_baseline`, `measure`, `measure_alternating`, `gpu_session` |
| `src/traced.rs` | kernels with task records | `single`, `openmp`, `rayon` |
| `src/main.rs` | `bagflow-kernels` CLI | `bench`, `main` |
| `kernels/cpu/openmp/risk_omp.cpp` | OpenMP | `bf_risk_omp`, `bf_risk_omp_traced`, `bf_omp_threads` |
| `kernels/gpu/metal/risk_metal.mm` | Metal | MSL `risk`, `bf_metal_create/upload/dispatch/download` |
| `kernels/gpu/cuda/risk_cuda.cu` | CUDA | `k_naive`, `k_warp`, `k_ptx`, `bf_cuda_*` |
| `kernels/mpi/risk_mpi.cpp` | MPI | `risk`, `main` |
| `crates/bagflow-api/src/main.rs` | server binary | `main` (address, data folders) |
| `lib.rs` | routes and handlers | `app`, `health`, `create_*`, `history`, `sse` |
| `jobs.rs` | job queue | `Jobs::start`, `submit`, `worker`, `save`, `config_hash`, `MAX_QUEUED` |
| `sim.rs` | simulation jobs and views | `SimConfig`, `execute`, `scale_servers`, `sample_statuses`, `node_name`, `BaggageQuery` |
| `pipeline.rs` | measured pipeline | `generate_phase`, `classify_phase`, `aggregate_phase`, `matches_engine`, `Report::json` |
| `parallel.rs` | telemetry runs | `ParallelConfig::validate`, `execute`, `median_run`, `task_note` |
| `sweep.rs` | sweeps | `SweepConfig`, `grid`, `passes`, `Pass::run`, `execute`, `mismatches` |
| `bench.rs` | benchmarks | `BenchConfig`, `stats`, `execute`, `logical_cores` |
| `static_results.rs` | saved-results parser | `load`, `parse_kernels`, `parse_mpi` |
| `error.rs` | error JSON | `ApiError` |
| `crates/bagflow-api/tests/api.rs` | HTTP tests | 15 `#[tokio::test]` functions |
| `crates/bagflow-core/tests/collect.rs` | collection and pinned configs | 8 tests |
| `web/src/config/*.ts` | navigation, stages text, demo settings, ops labels | `SECTIONS`, `STAGES`, `demoRequests`, `SCENARIO_NOTES` |
| `web/src/pages/*.tsx` | 13 pages + placeholder + 404 | see 9.4 |
| `scripts/setup.sh`, `start.sh`, `run_mpi.sh`, `check_env.sh` | setup, start, MPI table, toolchain check | — |
| `analysis/validate.py` | histograms | — |

## Appendix C: Result files

| File | Description |
|---|---|
| `r6_api.txt` | live API on the M1: 3 pinned configs, 3 pipeline jobs, 7 parallel runs (generate, classify), 3 sweeps |
| `r6_compare_100.txt` | 4 routings × 4 policies, ×1, 100%, 250,086 bags, plus node detail |
| `r6_compare_70.txt` | same at 70% capacity |
| `r6_gen_10M.txt` | generator seq vs Rayon 1/2/4/8, 10M, 3 processes |
| `r6_gen_50M.txt` | same at 50M, 1 run |
| `r6_kernels_10M.txt` | kernel table, best of 10, 3 processes, incl. Metal |
| `r6_mpi_50M.txt` | MPI read/scatter, ranks 1–8, 50M, 2 runs |
| `r6_scenarios.txt` | 6 scenarios × 4 routings × {fcfs, edf} |
| `r6_validation_mmc.txt` | 15 M/M/c cases for `engine.rs` |
| `bench_phase1b.txt` | older generator table, 10M, 1 run (4.97x) |
| `compare_phase4.txt` | routing × policy at servers ×2 (all 0%) |
| `compare_phase4_stressed.txt` | older copy of `r6_compare_100` content |
| `compare_phase4_overload70.txt` | older copy of `r6_compare_70` content |
| `compare_phase4_overload55.txt` | routing × policy at 55% |
| `scenarios_phase5.txt` | older copy of `r6_scenarios` content |
| `engine2_1M_collect.txt` | engine2 time and peak memory, collection off/on, 250k and 1M |
| `kernels_10M.txt` | older M1 CPU kernel table |
| `kernels_10M_novec.txt` | M1 CPU kernel table with auto-vectorisation off |
| `kernels_10M_metal.txt` | older M1 CPU + Metal table |
| `kernels_10M_kaggle.txt` | Kaggle Xeon + T4: CPU, AVX2, CUDA (saved, not re-measured) |
| `mpi_10M.txt`, `mpi_50M.txt` | older M1 MPI tables |
| `mpi_50M_kaggle.txt` | Kaggle MPI table (saved, not re-measured) |
| `scaling_seq.txt`, `scaling_seq_fixed_network.txt` | `engine.rs` scaling, scaled vs fixed servers |
| `validation_mmc.txt` | older M/M/c table (same values as r6) |
| `validation.png` | dataset histograms (6.9) |
| `bags_seed42.bin`, `bags_seed42_sample.csv`, `flights_seed42.csv` | the 50M dataset and samples (gitignored) |

## Appendix D: Discrepancy log

| # | Where | Disagreement | Assessment |
|---|---|---|---|
| 1 | AUDIT §12 vs code | AUDIT: "`/api/info` and `/api/run` remain". Code: no such routes (`lib.rs:66-87`); test `legacy_endpoints_are_gone` expects 404 | AUDIT stale |
| 2 | AUDIT §5.1 vs code | AUDIT: core "28 passed", kernels "3 passed". Code now has 29 core unit + 8 core integration tests and 5 kernel tests (2 conditional) | AUDIT stale (older commit) |
| 3 | AUDIT §12 "Open: trace sample" vs web | The Airport Network draws sampled bags with real histories (`web/src/hooks/useBagSample.ts`, Simplified label) | AUDIT partly stale; serving endpoint not traced (UNCLEAR) |
| 4 | OpenMP thread count | AUDIT §12 and Performance Lab: not selectable. `parallel.rs:79` accepts `threads` for OpenMP classify and `traced::openmp(threads, …)` uses it; web `takesThreads` includes `openmp`, while Rust `Backend::takes_threads` excludes it (health reports `takes_threads: false`) | Inconsistent between endpoints |
| 5 | Median definitions | `bench.rs` and pipeline: mean of two middle values for even n. Parallel runs: lower-middle run (`parallel.rs:174`). Web text says "lower middle" for the studio only | Two definitions; documented in each place |
| 6 | `docs/design/parallel-studio.md` §3 vs README | design: "4.97x at 8 threads on the M1"; README: 4.97x is one CLI run, re-measured 4.74x–5.09x; API 2.95x–3.70x | design doc outdated; app shows no fixed number (`config/stages.ts`) |
| 7 | `docs/backends.md` vs README/AUDIT | "Kernel is memory-bound", "vary ~30%", "AVX2 … pending Kaggle", "web/: three tabs", "MPI Kaggle to follow" | backends.md stale (README: "parts are out of date") |
| 8 | README "Known issue" vs code | describes the 1,042-flight default; code default is 16 (17 at 10M) | README states this itself; current default unmeasured |
| 9 | Kernel statistics | CLI best-of-10 vs API medians vs older sessions (rayon-4+neon 1.82–1.99 ms in r6, 1.89 ms metal file, 3.81 ms `kernels_10M.txt`) | not an error; never quote as one number |
| 10 | Metal parts vs total | r6 run 1: 3.05 + 4.09 + 0.26 = 7.40 ms vs total 7.46 ms | separate minima; UNCLEAR |
| 11 | Pipeline values r6 vs local records | r6: ceiling 1.109–1.110x, full 1.084–1.085x; local (5 records with a pipeline, three configurations): ceiling 1.099–1.130x, full 1.072–1.099x | run-to-run and configuration variation, not an error |
| 12 | `docs/PRESENTATION.md` vs results | PRESENTATION says the 1M "95–99% delayed" figure is "AUDIT §12, not in a result file". `results/engine2_1M_collect.txt` does contain 94.886–99.086% (CLI `measure`, not the API) | Error in PRESENTATION.md (written earlier in this session); only the API-specific 1M timings are untraced |
| 13 | `docs/PRESENTATION.md` vs records | PRESENTATION marks "under 0.04% delayed in every sweep experiment" as README-only; local sweep records show a maximum of 0.0379% | Supported by local (gitignored) records |
| 14 | README M/M/c error range | "−3.3% to +0.4%" vs file −3.27% to +0.37% | rounding; consistent |
| 15 | Naming | `docs/assumptions.md` "edge screening A -> sorter 4" vs app "Screening A → Sorter 1"; compare files print "Sorter #4" | node id 4 is named "Sorter 1" by the API; same edge |
| 16 | Crate editions | `bagflow-bench` edition 2024; others 2021 | AUDIT §6.1 notes it; harmless |
| 17 | `docs/benchmark 2.png` | stacked Metal bar omits launch overhead: 6.72 ms drawn vs 7.41 ms measured | AUDIT §6.2; image is of the removed legacy tab |
| 18 | `validation.png` source | which `.bin` file was plotted is not recorded; bar heights suggest ~250k bags, while the file now in `results/` has 50M | UNCLEAR |
| 19 | README "What is in here" vs `.gitignore` | README lists `results/` as "Raw output of measured runs"; `results/*.bin` and `results/*.csv` are gitignored, so the dataset and samples are absent from a clone | expected; regenerable with `bagflow-sim gen` |
| 20 | 8.1 test counts vs code | 8.1 counts 65 Rust tests and says tests were not run. Operational parallel mode added 2 core unit, 2 core integration and 1 API integration test; one `cargo test --release --workspace` run in the session that added them reported 69 passed, 0 failed | 8.1 count predates the feature |
| 21 | 3.15 and 5.4 "four phases" vs code | With `operational_parallel` the pipeline report has a fifth phase, `precompute`, included in the Amdahl eligible phases | Both correct for runs without the mode |
| 22 | Operational parallel mode figures | Reported in the session that measured them; no file in `results/` holds them | Untraced to a result file |

---

## Final pass: verification report

Every number in Parts 2, 5, 6 and 9 was re-read against its source file in this session. Counts:

- **Numbers re-derived arithmetically** (Part 5 and the checks in Parts 2 and 9): about 140 (delayed percentages 6; generator speedups, efficiencies and rates 16; parallel-run medians and pairing ranges 21; pipeline/Amdahl 15; sweep ratios 15; kernel speedups, rates and bandwidths 32; MPI ratios 16; M/M/c 7; data shares and sizes 10; histogram sum and processing rate 2).
- **Mismatches beyond rounding: 0.**
- **Last-digit differences explained by rounded inputs:** 15 (for example classify pairing 8.07 vs 8.09; rayon-4+neon 7.73 vs 7.72; AVX2 3.33 vs 3.32; MPI scatter 1.82 vs 1.81).
- **Could not verify:** the Metal phase sum vs total (separate minima); the c = 16, ρ = 0.5 validation error (inputs printed as 0.11); the 50M dataset checksum `cad211c3120bddfd` (not recomputed); test pass/fail counts (tests not run); CI results (not in the repo); the exact `r6_api.txt` request sequence (not scripted); `validation.png`'s source file; the parallel-run checksum definition per workload; OS version of the M1; Python package versions.
