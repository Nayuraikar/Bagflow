# BagFlow audit (Phase 0)

Audited at commit `dcf0d98` on `main`, 27 November 2026, Apple M1, rustc 1.100.0, Node 26.13.1. No code was changed. This file is the only addition to the repo.

Sections 1-7 describe the code as audited. Sections 8-10 are the Phase 0 proposal and decisions. Section 11 checks `docs/design/blueprint.md` against the engine, and section 12 is the current Phase 1 status.

## 1. Top findings

| # | Finding | Consequence |
|---|---|---|
| 1 | `engine2` (the engine behind the API and all results tables) returns aggregates only. It keeps no event log, per-bag route or state, time-series, edge counts or wait distribution. It does not use `BagState`. | Network animation, Baggage Tracker and Congestion Analysis all need new instrumentation. |
| 2 | The batch deadline-risk kernel is not connected to the simulation. Its estimate is a fixed formula (`1200 + 600*special + 300*transfer` s) and its output feeds neither routing nor queueing. No simulation stage uses any parallel backend. | The UI must present the kernel as a separate batch analysis of the bag table. |
| 3 | The Replay tab plays a static 6,000-bag file from the older engine (`engine.rs`, 6-node chain, 0 delayed). `replay.ts` assumes a straight chain, so it cannot play the 10-node layered network. | It cannot be reused as the playback layer for `engine2`. The README says it runs the real engine, which is only true of a precomputed snapshot of the old one. |
| 4 | Airport, Journey, Scale and the Compute panel are in-browser models. `Landing.tsx` says its data comes from "the same distributions as the Rust generator". It does not. | This statement is false and should be fixed whatever else happens. |
| 5 | Benchmark numbers are copied by hand into three TypeScript files, with inconsistent definitions (section 6.2). | Replace them with parsed `results/*.txt` served by the API. |
| 6 | There is no benchmark runner callable from the API. The kernel binary reports best-of-10 only. MPI is a separate C++ program run by a shell script. OpenMP's thread count cannot be set from Rust. | Phase 4 needs a new runner in `bagflow-kernels`. |
| 7 | M1 timings vary far more than the documented "about 30%". `rayon-4+neon` is 1.89 ms in one result file and 3.81 ms in another; `rayon-8+ilp` is 2.32 ms against 6.85 ms. | Repetition statistics are essential, and simulations must not run during a benchmark. |
| 8 | Server counts are fixed in the API. More bags in the same single day means more load: the old engine's fixed-network run goes to 95-99% delayed at 1M+ bags. | A "bag count" option needs an explicit server multiplier, or it is only a load slider. |
| 9 | Tests, release build and web build pass. `npm run lint` fails with 15 errors. There is one unused Rust dependency, a 747 kB JS chunk, and some dead files. There are no API or web tests. | Small cleanup, plus new tests in Phases 1 and 6. |

## 2. Inventory

### 2.1 `crates/bagflow-core`

| Module | What it does |
|---|---|
| `types.rs` | `Node`, `Edge`, `Flight`, `NodeKind` (7 kinds), `Scenario` (6), priority and flag constants. |
| `rng.rs` | ChaCha8 streams per purpose and per (purpose, flight). `Stream::Failures` and `Stream::Routing` are unused. |
| `soa.rs` | `BagSoA` columns (id, pax, flight, weight, priority, flags, arrival, deadline), checksum, `.bin` and CSV writers. |
| `generator.rs` | Synthetic single-day workload. `generate` (sequential) and `generate_par` (Rayon), tested bit-identical. |
| `state.rs` | 12-state `BagState` and legal transitions. Used only by `engine.rs` and its two CLI tools. |
| `events.rs` | `ScheduledEvent` ordering (time, kind, bag, seq) and `LogEvent`. |
| `network.rs` | `slice_network` (6-node chain) and `airport_network(k)` (10 nodes, 18 edges: check-in, identification, 2 screening, 3 sorter, 3 loading). |
| `engine.rs` | Phase 2 FCFS engine with state machine, event log and `events.bin` writer. Chain only. |
| `engine2.rs` | Main engine. 4 routings (`dijkstra`, `ecmp`, `congestion`, `deadline`), 4 policies (`fcfs`, `priority`, `edf`, `spt`), timed node and edge outages. Returns `RunStats`. |
| `scenarios.rs` | `Normal`, `PeakSurge`, `ConveyorFailure`, `ScreeningDelay`, `ConnectingRush`, `SorterOverload`. Fixed 17:00-19:00 windows. |
| `queueing.rs` | Erlang C and M/M/c validation of `engine.rs`. **`engine2.rs` has no theory validation of its own.** |

### 2.2 Other crates, binaries, kernels, scripts

| Item | What it does |
|---|---|
| `bagflow-sim` (`main.rs`) | `gen`: dataset generation and generator thread benchmark. |
| `bin/slice` | Runs `engine.rs` and writes `web/public/{network.json,events.bin,summary.json}`. |
| `bin/validate` | 15 M/M/c cases. |
| `bin/scale` | Sequential scaling of `engine.rs`. |
| `bin/compare` | `engine2`: 4 routings x 4 policies (args: bags, server multiplier, capacity %). |
| `bin/scenarios` | `engine2`: 6 scenarios x 4 routings x FCFS and EDF. |
| `bagflow-kernels` lib | `scalar`, `ilp`, `neon`, `avx2`, `openmp`, `par` (Rayon over any kernel), `metal`, `cuda` (naive, warp shuffle, warp PTX). Returns class counts and slack sum. |
| `bagflow-kernels` bin | Best-of-10 table (one extra warm-up for GPU only). |
| `kernels/mpi/risk_mpi.cpp` | MPI `read` and `scatter` modes, compute best-of-10, one load measurement. Prints one `RESULT` line. |
| `kernels/CMakeLists.txt` | Unused. Cargo builds through `build.rs`, MPI through `scripts/run_mpi.sh`. |
| `bagflow-bench` | "Hello, world!". Dead. |
| `scripts/check_env.sh`, `scripts/run_mpi.sh`, `kaggle/setup.sh` | Toolchain check, MPI build and table, Kaggle dependency setup. |
| `analysis/validate.py` | Dataset histograms to `results/validation.png`. |

### 2.3 API (`bagflow-api`, Axum, 127.0.0.1:3001)

| Endpoint | Behaviour |
|---|---|
| `GET /api/info` | Bag count and the lists of scenarios, routings, policies. |
| `GET /api/run?scenario&routing&policy&pct` | Synchronous `engine2` run on a dataset built once at startup (env `BAGS`, default 250,000). Seed fixed at 42, `pct` clamped to 20-300. Returns aggregates and per-node rows. |

No ids, history, persistence, progress, health check, validation of `pct` text (bad input silently becomes 100) or tests. CORS is fully permissive. Concurrent runs are unbounded (the Scenarios tab starts 4 at once, which inflates `sim_seconds`).

### 2.4 Web (`web/src`)

| File | What it does | Data source |
|---|---|---|
| `App.tsx`, `main.tsx` | Six tabs in React state. No router. | |
| `ScenariosPage.tsx` | Run one config or compare 4 routings. | **Real `engine2`** via API |
| `ReplayPage.tsx`, `replay.ts` | Pixi playback and node table. | Static output of **old `engine.rs`** |
| `BenchPage.tsx` | Kernel, transfer and MPI charts. | Hand-copied static results |
| `ScalePage.tsx` | Per-minute fluid model up to 50M bags. | In-browser model |
| `Arena.tsx` | Animated backend race (inside Scale). | Static results, linearly scaled |
| `JourneyPage.tsx`, `journeySim.ts` | Narrated suitcase journey, up to 400 bags. | In-browser model |
| `AirportApp.tsx`, `airportData.ts`, `Landing.tsx` | Dashboard, booking, boarding pass. | In-browser generator |
| `Movie.tsx`, `PlaneArt.tsx` | Scene-by-scene journey and aircraft art. | In-browser model |
| `Compute.tsx` | Backend "re-planning window" panel (inside Movie). | Static rates |
| 8 CSS files | `index.css` is dark; `light.css` and `skin.css` override it. | |

### 2.5 Result files

| File | Content | Produced by |
|---|---|---|
| `bench_phase1b.txt` | Generator, 10M, sequential vs Rayon (M1) | `gen --mode bench` |
| `validation_mmc.txt`, `validation.png` | 15/15 M/M/c cases; dataset plots | `validate`, `validate.py` |
| `scaling_seq.txt`, `scaling_seq_fixed_network.txt` | Old engine at 250k, 1M, 5M | `scale` |
| `compare_phase4.txt` | 16 combinations, servers x2 (all 0% delayed) | `compare` |
| `compare_phase4_stressed.txt`, `_overload70.txt`, `_overload55.txt` | 100%, 70%, 55% capacity | `compare` |
| `scenarios_phase5.txt` | 6 scenarios x 4 routings x 2 policies | `scenarios` |
| `kernels_10M.txt`, `kernels_10M_novec.txt` | M1 CPU kernels, with and without auto-vectorisation | kernel bin |
| `kernels_10M_metal.txt` | M1 CPU and Metal | kernel bin |
| `kernels_10M_kaggle.txt` | Xeon (4 vCPU) and T4: CPU, AVX2, CUDA | kernel bin, header hand-annotated |
| `mpi_10M.txt`, `mpi_50M.txt` | M1 MPI | `run_mpi.sh` |
| `mpi_50M_kaggle.txt` | Kaggle MPI | `run_mpi.sh` |

Local and ignored by git: `results/bags_seed42.bin` (1.2 GB, size matches 50M bags), `flights_seed42.csv`, sample CSV, `bin/risk_mpi`, `target-novec/`.

## 3. Reality map: the 7 baggage stages

**Modelled** = a queued service stage in `engine2` with its main mechanism present. **Simplified** = present, but the main real-world mechanism is reduced or missing. **Not modelled** = no stage in the engine.

| Stage | Code | Status | What exists | What is missing | Parallel backends in the simulation |
|---|---|---|---|---|---|
| Check-in | `engine2::arrive/start/complete`, node 0 (40 servers, 5 s mean); arrival times from `generator::gen_bags` | Simplified | One pooled queue, lognormal service (sigma 0.4), queue policy applies | Per-airline or per-flight counters, bag drop, passengers. **Transfer bags also enter here.** | None |
| Identification | node 1 (4 servers, 0.4 s) | Simplified | Same queueing | Tag reads, read failures, manual coding | None |
| Screening | nodes 2 and 3 (10 x 1.8 s, 6 x 2.5 s); hold in `dur_ms` | Modelled (hold Simplified) | Two lines, route choice, 5% inspection adding about 20 s on the same server, capacity outage in `ScreeningDelay` | Separate inspection station, multi-level screening, rejection | None |
| Transport | `Edge.travel_ms`, `next_hop`, `Outage` on an edge | Simplified | Fixed travel time, edge outage that diverts routing | Edge capacity (`capacity_per_min` is never read), jams, MTBF failures. With no live alternative a bag **uses the failed edge anyway**. | None |
| Sorting | nodes 4-6 (4 servers, 1 s each) | Modelled | Queueing, 4 routing strategies, 4 queue policies | Diverters, chutes, missorts (`Misrouted` is never produced), early-bag storage | None |
| Transfer | `FLAG_TRANSFER`, `PRIO_TIGHT` in generator; `ConnectingRush` | Not modelled | Attributes only: arrival window, 15 min deadline, priority mix | Transfer node (`NodeKind::Transfer` unused), minimum connection time, inbound flights. `TransferPending` exists only in `engine.rs`. | None |
| Loading | nodes 7-9 (12 x 4 s); `flight % 3`; delayed if finish > deadline | Simplified | Three loading areas, on-time or delayed outcome | Departures, per-flight loading, ULDs, loader or tug limits | None |

### Where parallelism really is

| Work | Parallel? |
|---|---|
| Dataset generation | Rayon (`generate_par`) |
| Batch deadline-risk kernel | scalar, ILP, Rayon (optionally over ILP or SIMD), OpenMP, NEON, AVX2, Metal, CUDA naive/warp/PTX, MPI read/scatter |
| Discrete-event simulation | Sequential |
| Independent runs (compare views) | Separate API tasks can run concurrently. This is not engine parallelism. |

On this Mac: scalar, ILP, Rayon, OpenMP (libomp present), NEON and Metal run. Open MPI 5.0.11 is installed. AVX2 and the three CUDA variants can only be static results.

Auto-vectorisation affects the baseline: scalar is 14.11 ms normally and 21.16 ms with vectorisation off, so NEON speedup reads 2.1x or 3.15x. Every speedup must name its baseline.

## 4. Data gaps blocking the blueprint

| Blueprint need | Today | Needed |
|---|---|---|
| Per-bag history (Tracker) | `finish[]` is internal and dropped; no route | Optional per-hop record: node, arrive, service start, service end |
| Bag statuses | Final outcome is only on-time or delayed | `LOADED`, `DELAYED` as final; held interval recoverable because the inspection draw is a stateless hash; in-progress states derived at a playback time. **`MISROUTED` cannot occur** and should be labelled Not modelled, with no count. |
| Queue over time, in vs out (Congestion) | Run totals only | Sampled queue, busy servers, capacity, cumulative arrivals and completions per node |
| Waiting-time distribution | Mean per node only | Per-node histogram |
| Utilisation colouring and offline state | Whole-run average. The denominator uses nominal servers over first arrival to last event, even during outages. | Per-sample `busy / capacity`; outage list in the response. Note busy can exceed capacity just after an outage starts (in-service bags finish). |
| Edge stats | None | Traffic count per edge |
| Playback animation | `engine2` emits no events | Hop records for a bounded bag sample |
| Flights (filter, drawer) | `generate_par` returns flights; the API discards them | Keep them. Departure time is available. There are no flight codes or destinations, so the UI must not invent any. `PeakSurge` clones keep the original flight and passenger id. |
| Progress (SSE) | `run_with` is a single blocking call | Optional progress callback |
| Benchmarks from the API | Binary only, best-of-10 | Library runner with warm-up, per-repetition times, availability detection, output check against scalar |
| Thread-count control | Rayon yes; OpenMP only through `OMP_NUM_THREADS` | Add a thread argument to the OpenMP kernel |
| GPU phase split | `Timing {upload, gpu, wall, download}` exists | Pass through. Show launch overhead (`wall - gpu`) separately. Metal "copy" is a memcpy and Metal download includes the CPU partial sum. |
| MPI live | Best-of-10 only, load measured once, needs a `.bin` on disk | Print per-repetition times and run through `mpirun`, or keep MPI static |
| Memory metric | Not collected | Only a computed data footprint (about 10 bytes per bag plus buffers), labelled computed; otherwise omit the memory chart |
| Parallel efficiency | Defined only in the generator bench | Report for thread and rank counts only; `--` for ILP, SIMD and GPU |
| History and jobs | None | Job registry, JSON records in a gitignored `data/` |

## 5. Verification run

### 5.1 `cargo test`

Debug twice more after the first run, and once with `--release`: no failures or flakes seen.

```
bagflow-core     test result: ok. 28 passed; 0 failed; 0 ignored (finished in 8.99 s debug, 0.79 s release)
bagflow-kernels  test result: ok. 3 passed; 0 failed; 0 ignored (includes metal_matches_scalar_on_awkward_lengths)
bagflow-sim, bagflow-api, bagflow-bench: 0 tests
```

CUDA tests are compiled out on macOS, so they were not run. The AVX2 path is also not exercised here.

### 5.2 `cargo build --release`

Succeeds.

```
warning: unused dependency `serde_json`
  --> crates/bagflow-core/Cargo.toml:11:1
warning: `bagflow-core` (manifest) generated 1 warning
    Finished `release` profile [optimized] target(s) in 6.65s
```

(Incremental build.) `cargo clippy --workspace --all-targets` reports style warnings only (manual range contains, empty format literal, index loops, one `abs()` cast).

### 5.3 `npm run build`

Succeeds.

```
vite v8.3.8 building client environment for production...
✓ 1176 modules transformed.
dist/assets/index-RuF_5MFa.css                     21.28 kB │ gzip:   5.12 kB
dist/assets/RenderTargetSystem-qkDBo_0s.js         79.14 kB │ gzip:  22.34 kB
dist/assets/Geometry-COkE5-_o.js                  113.72 kB │ gzip:  34.31 kB
dist/assets/ReplayPage-C06RufsB.js                295.91 kB │ gzip:  88.20 kB
dist/assets/index-DJSXQ7Sb.js                     747.40 kB │ gzip: 220.97 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 373ms
```

(Smaller chunks omitted.)

### 5.4 `npm run lint` (not requested; fails)

15 errors: `react-hooks/refs` 8 in `Movie.tsx` and 1 in `Arena.tsx`; `set-state-in-effect` 1 in `Movie.tsx`; `no-useless-assignment` 3 in `Arena.tsx` and 1 in `ScalePage.tsx`; `only-export-components` 1 in `Compute.tsx`. All are in demo pages.

### 5.5 Fixed configs and regression baseline

The three configs were run through the live API. Checksums came from a temporary harness outside the repo that calls `bagflow-core` directly. Dataset: seed 42, 250,086 bags, 1,650 flights, checksum `168e0a37b06224f9`.

| Config | Delayed | Rate | `RunStats.checksum` |
|---|---|---|---|
| Normal / dijkstra / fcfs / 100% | 9,245 | 3.697% | `61aa19cce7723683` |
| SorterOverload / ecmp / fcfs / 100% | 28,606 | 11.438% | `144494908f029748` |
| Normal / congestion / fcfs / 70% | 134,427 | 53.752% | `29e8786b1e8e3fae` |

All three delayed rates match the result files (which record no `engine2` checksums). Each run took about 0.7 s. The checksum covers finish times only. No existing test pins these values.

## 6. Duplicates, dead code, inconsistencies

### 6.1 Dead or duplicate

- `crates/bagflow-bench` (hello world, and edition 2024 while the rest use 2021).
- `kernels/CMakeLists.txt` and 9 placeholder `.gitkeep` files under `kernels/` (six of those folders hold nothing else).
- `serde_json` in `bagflow-core`.
- Unused model fields: `queue_capacity`, `capacity_per_min`, `Node.online` (never false or read), `NodeKind::Transfer`, two RNG streams. `NodeKind::Conveyor` is used only by the old chain.
- Two engines with duplicated constants and slice/checksum logic. `engine.rs` is still needed by `slice`, `scale`, `validate` and tests.
- The risk formula is written 5 times (Rust, NEON/AVX2, OpenMP, Metal, CUDA/MPI). This is expected for backends and is guarded by equality tests, except for MPI, which is compared only between rank counts in the script and manually against Rust.
- Two seeded JS generators (`airportData.ts`, `journeySim.ts`).
- `docs/benchmark 1.png` and `benchmark 2.png`: tracked, about 1.25 MB, not referenced by the README.
- Empty `configs/` and `docs/papers/`.

### 6.2 Docs and UI against code and data

| Claim | Reality |
|---|---|
| README: "Every number comes from a file in `results/`" | No result file supports "50M bags generate in about 6.5 s". |
| README: Replay and Scenarios run the real engine | Replay shows a saved run of the old engine. |
| README overview: 12-state bag machine | Not used by `engine2`, which produced the routing and scenario results. |
| README: M/M/c "engine correctness" | Validates `engine.rs` only. |
| README: about 30% timing variation | Result files differ by up to about 3x for the same M1 backend. |
| `backends.md`: AVX2 "pending Kaggle", MPI Kaggle "to follow", dashboard has "three tabs" | All stale. |
| `assumptions.md`: failures not modelled (Phase 4) | Scheduled outages now exist; MTBF failures and edge capacity still do not. |
| `Landing.tsx`: same distributions as the Rust generator | False. 900 departures a day, different bag, delay and transfer logic, invented delay causes. |
| `Movie.tsx`: "As staffed today" | A baseline computed from target stage times, not any real airport. |
| `Compute.tsx` ranking | Mixes M1 and T4 rates. MPI rates are 50M runs including file load; the CPU rates are 10M compute only. |
| `Arena.tsx`, Metal "kernel" 4.14 ms | Derived as total minus copies. The measured GPU time is 3.45 ms (wall 4.05 ms). |
| `Arena.tsx`, Kaggle MPI | 50M results divided by 5: an estimate (noted in its footnote). |
| `BenchPage.tsx` transfer chart | Stacks copy, GPU and copy, which omits launch overhead (6.72 ms drawn, 7.41 ms measured for Metal). |
| Scenario name `SorterOverload` | It redirects flights to loading area 7. Sorter congestion follows from routing toward it. The UI description should say this. |

### 6.3 Engine caveats to show in the UI

- Dijkstra costs and the congestion wait estimate use base mean service, without the extra inspection time.
- Delayed means loading finished after the deadline. By design, 2% of origin bags arrive up to 15 min after the 45 min arrival cutoff (still before the 20 min loading deadline).
- Everything is one synthetic day. Nothing is calibrated to a real airport.

## 7. Existing web tabs: what to do

| Tab | Data | Recommendation |
|---|---|---|
| Scenarios | Real | **Replace** with Scenario Studio in Phase 5. Reuse the option loading and comparison chart. Keep until then. |
| Replay | Old engine, static | Move to **Concept demos**, labelled "legacy 6-node engine, saved run". Remove once Airport Network has playback. Reuse only the colour and animation ideas. |
| Benchmark lab | Static | **Replace** with Performance Lab fed by `/api/static-results` and live runs. Delete the hard-coded arrays. |
| Arena | Static, scaled | **Concept demos**, labelled "estimate from static measurements". |
| Scale | Browser model | **Concept demos**, labelled "illustrative flow model, not the engine". |
| Journey | Browser model | **Concept demos**, same label. |
| Airport, Movie, Compute | Browser model | **Concept demos**, same label. Correct the generator claim and rename "As staffed today". |

Their global CSS would clash with Tailwind and the new theme, so each demo needs to be scoped and lazy-loaded in Phase 2.

## 8. Proposed API contract

Conventions: JSON, snake_case on the wire, converted to the UI models in one adapter. Times are integer simulation milliseconds. Unavailable values are `null` and render as `--`. Errors are `{ "error": { "code", "message" } }`. `/api/info` and `/api/run` stay until the old Scenarios tab is removed. This proposal predates the blueprint. Where they differ, the blueprint wins (section 11.4).

| Endpoint | Request / response | Engine or crate work |
|---|---|---|
| `GET /api/health` | status, version, `options` (scenarios, routings, policies, limits), machine (cores), backends with `available` and reason | Backend detection |
| `GET /api/scenarios` | id, description, window, affected nodes or edges, parameters | Scenario metadata next to `scenarios.rs` |
| `POST /api/simulations` | `{scenario, routing, policy, capacity_pct, bag_count, server_multiplier}` -> `202 {id, status}` | Job registry, one simulation worker, strict validation |
| `GET /api/simulations/:id` | status, config, `config_hash`, engine checksum, wall time | |
| `GET /api/simulations/:id/events` (SSE) | progress, done, error | Progress callback |
| `GET /api/simulations/:id/metrics` | totals (delayed, tight delayed, mean, p95, max queue), node rows, `series` (`interval_s`, per-node queue, busy, capacity, arrivals, completions), wait histograms | Sampler and histograms |
| `GET /api/simulations/:id/network` | nodes with positions and stats, edges with travel time and traffic, outages | Edge counters, outage export |
| `GET /api/simulations/:id/baggage?page&page_size&status&flight&node&q` | page of bags and total | Retained per-bag outcome and route |
| `GET /api/simulations/:id/baggage/:bag_id` | attributes, flight departure, hop timeline, held interval | Hop trace |
| `GET /api/simulations/:id/trace?limit` (extension) | hops for a bounded sample, for animation | Same trace |
| `POST /api/benchmarks` | `{bag_count, backends[], threads[], repetitions, warmup}` -> `202 {id}` | Runner in `bagflow-kernels` |
| `GET /api/benchmarks/:id` and `/events` | status, progress | |
| `GET /api/benchmarks/:id/metrics` | per backend: mean, median, std, min, max, throughput, speedup (named baseline), efficiency or null, output identical, GPU copy-in/kernel/copy-out, launch overhead | Statistics |
| `GET /api/static-results` | rows with source file, machine, `static: true` | Parser for the kernel and MPI formats, with tests against the files |
| `GET /api/history`, `GET/DELETE /api/history/:id` | id, kind, timestamp, config, `config_hash`, summary | JSON files in gitignored `data/` |

CSV and JSON export can be produced in the web app from these responses.

## 9. Proposed plan

**Phase 1 (backend).**
- Instrumentation is observation only: the sampler reads state when the clock crosses a sample time. It adds **no events to the heap**, draws no random numbers and does not change `end_ms`. Existing `run` and `run_with` signatures stay. The three checksums in 5.5 become tests, with instrumentation both off and on.
- Per-bag trace: the brief asks for a random sample of about 5,000 bags plus any looked-up bag. Recommended: keep compact hop records for **all** bags in memory for the few most recent runs (about 16 MB per 250k bags, estimate). This meets lookup and node filtering without re-running. Older runs are recomputed deterministically from their saved config. The 5,000 sample then only limits animation.
- Bag limit: start at 1,000,000 per API run (proposal, to be confirmed by measuring time and memory). `server_multiplier` defaults to 1 and is shown in the UI, with a note that more bags at the same servers means more load. Results for 250k stay unchanged.
- One job queue for simulations and benchmarks so they never run at the same time.
- Benchmarks: in-process backends first. MPI live only when `mpirun` and the built binary exist, after adding per-repetition output; otherwise it is reported unavailable and the static rows are shown.
- Add `data/` to `.gitignore`.

**Phase 2.** New app shell, router, theme, Dashboard. Old tabs go under Concept demos, scoped and lazy-loaded. Fix the false generator statement.

**Phase 3.** Stage Explorer with the badges in section 3, then Network, Baggage Tracker, Congestion. `MISROUTED` is shown only as Not modelled.

**Phase 4.** Performance Lab. Memory shown only as a computed footprint or omitted. Efficiency only for thread and rank counts.

**Phase 5.** Scenario Studio, history, shared run selector. Remove the old Scenarios and Benchmark lab tabs.

**Phase 6.** Polish; the three fixed configs as end-to-end tests; fix remaining lint errors; remove dead items in 6.1; update README and docs.

## 10. Decisions needed before Phase 1 (answered, see below)

1. **Contract:** which governs, the design blueprint or section 8?
2. **Bag trace:** approve the all-bags compact trace, or keep strictly to the 5,000 sample plus lookups.
3. **Bag count:** approve fixed servers with a visible multiplier, instead of automatic server scaling.

**Answers (27 November 2026).**
1. Follow the blueprint. Where section 8 differs, follow the blueprint and list the differences (section 11.4).
2. Approved: compact histories for all bags in the few most recent runs, about 16 MB per 250k bags. The 5,000-bag sample limits animation only.
3. Approved: fixed servers with a visible multiplier; limit starts at 1M bags, confirmed by measurement.

The false generator statement in `Landing.tsx` is to be fixed in Phase 2.

## 11. Blueprint check

Checked against `docs/design/blueprint.md`. **Yes** = the engine and API supply the data. **Partly** = some of it is missing; the missing part must show `--` or a Not modelled label. **No** = nothing supplies it yet.

### 11.1 Pages

| Page | Support | What the engine cannot supply yet |
|---|---|---|
| Dashboard | Partly | A finished run has 0 bags in transit, so that KPI needs a playback time (`baggage?at_ms=`, `counts`) or another label. "Active bottlenecks" comes from an API display rule (11.3). A simulation has no backend: the activity table can only say "sequential engine". |
| Stage Explorer | Partly | Live metrics exist only for stages with nodes. Transport has edge traffic totals and no queue. Transfer is not modelled. Stage text and badges are web content based on section 3. |
| Airport Network | Partly | Edge capacity and maximum throughput are not enforced (`null`). Edge load is a run total, not a value over time. No conveyor nodes: conveyors are edges. Node names are labels made by the API. Animated markers need a bounded trace sample, which no endpoint serves yet (only one bag at a time). |
| Baggage Tracker | Yes, with limits | No flight codes or airport destinations: "destination" is the loading area. Passenger ids are synthetic numbers. `MISROUTED` and `TRANSFER_PENDING` never occur. Inspection has a duration but no start or end time. |
| Congestion Analysis | Yes, with limits | Series are sampled every 60 simulation seconds, so shorter peaks can fall between samples (run `max_queue` is exact). Facility status is the display rule in 11.3. |
| Performance Lab | Partly | Memory is not measured: omit the memory chart, or show only the computed data footprint with that label. On this Mac, AVX2 and CUDA are static results only. MPI cannot run live yet. A scalability chart needs one benchmark job per workload size. |
| Benchmark Analytics | Partly | Live statistics and GPU copy-in, kernel, launch and copy-out are available. "CPU compute" is only the CPU backends' total time. Saved files give best-of-10 only, with no mean, median or spread, and stop at 10M (kernels) or 50M (MPI). |
| Resource Profiler | Partly | Available: CPU core and thread counts, execution time, GPU transfer times. Not collected: RAM, GPU utilisation, GPU memory. |
| Scenario Studio | Partly | Infrastructure: only bag count, server multiplier and capacity percentage can be set. Flight count follows from bag count; facilities, per-facility capacity and service rates are fixed. Step 4 (backend) cannot apply: the simulation is sequential. Per-run speedup, efficiency and memory do not exist; speedup comes only from a separate benchmark job. "Logs" are progress phases and counts only. Comparison is done in the web app from two runs' metrics. |
| Simulation History | Partly | List, ids, timestamps, config and summary are persisted. No delete or export endpoint. Only the 3 most recent runs keep histories and series; reopening an older one means submitting its config again, which creates a new id. |
| Settings | No | The blueprint defines no content. |

**Global run selector.** It cannot make Operations and Performance show "the same run" today. A benchmark times the batch kernel on its own base dataset (seed 42, no scenario changes), is a separate job, and has no link to a simulation id. The kernel also never feeds the simulation (finding 2).

### 11.2 API endpoints

| Blueprint endpoint | Status |
|---|---|
| `GET /api/health` | Built |
| `POST /api/simulations`, `GET /api/simulations/:id`, `/metrics`, `/network`, `/baggage` | Built |
| `POST /api/benchmarks`, `GET /api/benchmarks/:id`, `/metrics` | Built |
| `GET /api/history` | Built |
| Progress by SSE or WebSocket | Built as SSE: `/api/simulations/:id/events` and `/api/benchmarks/:id/events` (`progress`, `done`, `failed`) |
| `POST /api/scenarios` | **Not built.** The blueprint gives no request or response, it was not in the Phase 1 list, and the engine has only six fixed scenarios with no custom parameters. The names are in `/api/health` options. |

Built from the Phase 1 brief although the blueprint does not list them: `/api/simulations/:id/baggage/:bag_id` (the tracker drawer needs it) and `/api/static-results`.

### 11.3 TypeScript models

The wire format is snake_case with integer ids and milliseconds. The blueprint allows an adapter, which must do the renaming, id-to-string conversion and unit labels.

| Model and field | Source, or why it cannot be filled |
|---|---|
| `Baggage.id`, `passengerId`, `flightId`, `priority` | `id`, `passenger_id`, `flight_id`, `priority` (`standard`, `priority`, `tight_connection`). `SorterOverload` works by rewriting the engine's flight column; the API reports the original flight and sets `redirected`. |
| `Baggage.currentLocation` | `current_node`; `null` while travelling (`next_node` is set) or before arrival. In the final state it is the loading area. |
| `Baggage.destination` | `loading_node`. There is no destination airport. |
| `Baggage.status` | Derived from the bag history at the end of the run or at `at_ms`. It is `null` before arrival, which the union has no value for. `DELAYED` means loaded after the deadline; an overdue bag still in the system keeps its stage status with `overdue: true`. At a sorter it is `CLEARED`. `IDENTIFIED` and `SORTED` appear only in the timeline, because the bag leaves as soon as that service ends. `HELD_FOR_INSPECTION` covers a held bag's whole screening service. `CLEARED` only means screening ended: the engine rejects no bags. `MISROUTED` and `TRANSFER_PENDING` are never produced. |
| `Baggage.arrivalTime`, `departureTime` | `arrival_ms`, `departure_ms`. The blueprint's sort by deadline needs `deadline_ms`, which the model lacks. |
| `AirportNode.id`, `type`, `capacity`, `utilisation`, `name` | Engine values, except `name` (made by the API). `capacity` is parallel servers. `utilisation` is the whole-run average, or with `at_ms` a 15-minute windowed value; it can pass 1 just after an outage starts. |
| `AirportNode.queueLength` | Only with `at_ms`; otherwise `null` (use `max_queue`). The model needs `number \| null`. |
| `AirportNode.processingRate` | Nominal: servers / base mean service. Not a measured throughput, and it leaves out inspection time. |
| `AirportNode.status` | API display rule, not engine output: windowed utilisation over 15 samples; `high` at 0.75, `congested` at 0.95, `offline` at zero capacity. Whole-run status is the worst sample. The thresholds are a choice and are returned in `status_rule`. |
| `AirportEdge` | `travelTime` and `available` are real. `capacity` is `null` (needs `number \| null`). `trafficLoad` is the run total. |
| `SimulationMetrics` | All filled. `onTimeLoadingRate` is a fraction (0-1). `averageWaitingTime` is total queue wait per bag, in seconds. `inTransit` is 0 for a finished run. |
| `BenchmarkResult.backend` | Union must be extended: `scalar`, `ilp`, `neon`, `avx2`, `openmp`, `rayon-ilp`, `rayon-neon`, `rayon-avx2`, `metal`, `cuda-naive`, `cuda-warp`, `cuda-ptx`, `mpi`. Thread count is a separate field. |
| `BenchmarkResult.executionTimeMs`, `throughput`, `speedup` | Median time, bags/s, and median scalar time / median time. |
| `BenchmarkResult.parallelEfficiency` | `number \| null`; thread backends only. |
| `BenchmarkResult.memoryUsage` | Always `null`. |

### 11.4 Differences from the section 8 proposal

| Topic | Section 8 | Now (blueprint, or the Phase 1 brief where the blueprint is silent) |
|---|---|---|
| Scenarios endpoint | `GET /api/scenarios` with metadata | Blueprint has `POST /api/scenarios` instead. The GET was not built; the POST is not built either (11.2). Scenario descriptions are not served. |
| History | `GET/DELETE /api/history/:id` | Blueprint lists only `GET /api/history`. No per-item routes. The History page's delete still needs one. |
| Trace sample | `GET .../trace` | Not in the blueprint; not built. Needed for the blueprint's animated markers. |
| Bag statuses | Final outcome plus derived states, no fixed list | Blueprint's 12-value union, with the limits in 11.3 |
| Facility status | Not defined | "Computed by the backend": the rule in 11.3, coloured by utilisation |
| Time-series | In `/metrics` | In `/network` (Phase 1 brief). Wait histograms are in `/metrics`. |
| Parallel efficiency | Thread and rank counts only | Blueprint `E = S / P x 100`, where S is against a one-thread run of the **same kernel** (`rayon-neon` against `neon`). The blueprint does not name `T_seq`; against scalar, SIMD gain would push efficiency past 100%. `speedup` is always against scalar. |
| Simulation backend | None | The blueprint's activity table and Scenario Studio expect one; the engine cannot supply it (11.1). |

## 12. Phase 1 status

**Engine side** (earlier): `collect.rs` and `engine2::run_collected` give bag histories, node time-series, wait histograms, edge traffic and progress. `run` and `run_with` keep their signatures. The blueprint sets no histogram bins, so `WAIT_BOUNDS_MS` stands. No engine file changed in the API step.

**API side** (`crates/bagflow-api`):

- Endpoints as in 11.2. `/api/info` and `/api/run` remain for the old Scenarios tab, and `/api/run` now takes the same run lock as jobs.
- One worker thread runs simulations and benchmarks in order, so they never overlap. At most 8 jobs wait; more get 429. Read requests are still served during a job and can disturb benchmark timings.
- Limits: bag count 1,000 to 1,000,000; capacity 20-300%; server multiplier 1-20 (whole numbers, default 1). Benchmarks: 1,000 to 10,000,000 bags, 1-50 repetitions, 0-10 warm-up, 1-64 threads. Out-of-range values and unknown fields are rejected, not clamped (old `/api/run` still clamps).
- The 3 most recent runs keep full data. Config and summary of every finished or failed job are saved in `data/runs/` (gitignored). Jobs still queued or running at shutdown are not saved. Nothing prunes the folder.
- Benchmarks use `bagflow-kernels/src/runner.rs`. Every repetition is checked against scalar. MPI is reported unavailable for live runs. The OpenMP thread count is still not selectable from the API (it uses the OpenMP default).
- `/api/static-results` parses the five named files into 53 rows. For `kernels_10M_metal.txt`, `mpi_10M.txt` and `mpi_50M.txt` the machine name "Apple M1" is not fully stated in the file; it comes from section 2.5.

**Tests:** three fixed configs through the HTTP routes give 3.697%, 11.438% and 53.752% delayed with the checksums in 5.5 (debug and release).

**1M bags through the API** (one session, release build, M1 8 GB, load average about 6.8; peak resident memory sampled every 50 ms; not saved in `results/`):

| Measure | Observed |
|---|---|
| Job time per 1M-bag run, 4 configs, FCFS | 2.2-2.8 s |
| Peak memory after 4 such runs, 3 retained | 601 MB |
| Peak memory after also loading the old 250k dataset and running a 10M benchmark | 1,010 MB |
| `/network` response | 1.0-5.8 MB, 11-56 ms (longer runs have more samples) |
| `/baggage` page, including a sorted and filtered one | 14-76 ms |

This supports the 1M limit on this machine. At 1M with servers x1, 95-99% of bags were delayed in these four runs, so the UI must show the multiplier note. The other queue policies were not measured at 1M.

**Open:** `POST /api/scenarios`, scenario descriptions, trace sample, history delete and export, live MPI, a link between benchmarks and simulation runs, memory metrics. CORS is still fully permissive, so any web page open in the same browser can call this local API, including the endpoints that start jobs and write records.
