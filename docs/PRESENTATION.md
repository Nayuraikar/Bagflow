# BagFlow: evaluator presentation and explanation script

This is a script for presenting BagFlow aloud to evaluators who may know little about parallel computing. On-screen labels are quoted from the components in `web/src`. Numbers come only from `README.md` and `results/r6_*.txt`. Where a number on screen comes from a live run, this script says what it *usually* looks like and gives the traced range from the result files, never one headline value.

How to read this file:

- Text in a **"Say:"** block is meant to be spoken. Sentences are short on purpose.
- `Monospace` text is what you will see on screen, word for word.
- "M1" means the Apple M1 MacBook Air (fanless, 8 GB, 8 logical cores) on which the `r6_*` files were measured on 27 November 2026.

---

# PART 1: Pitch and story

## 1.1 One-paragraph pitch

Say:

> BagFlow is a parallel computing study built around airport baggage. It creates a synthetic day of airport bags, sends every bag through a queueing model of an airport, and measures where parallel computing makes the work faster and where it cannot. The simulation itself has to run one event at a time, in time order, so it stays sequential. We parallelise the work around it: generating the bags, a batch risk calculation over every bag, and summarising the results. The biggest gain comes from running many independent simulations at the same time, which we call a sweep. Every speedup in the app is measured on this machine, checked against the sequential answer, and labelled with where it came from.

## 1.2 Thirty-second version

Say:

> BagFlow simulates a synthetic airport day of about a quarter of a million bags. The simulation must stay sequential, because each event changes what happens next. So we parallelise the workload around it, we prove the parallel answers match the sequential ones, and we run many whole simulations side by side. On one pipeline run Amdahl's law limits us to about 1.1x. On a sweep of 96 simulations we measured 4.5x to 5.2x on eight threads.

## 1.3 The three-sentence story

Memorise these three sentences. Every page in the app supports one of them.

1. **Parallelise the workload.** Generating bags, classifying their deadline risk, and aggregating results are split into chunks and run on many threads, vector lanes or a GPU.
2. **Preserve simulation correctness.** The discrete-event simulation stays sequential, and every parallel result is checked with a checksum against the sequential one.
3. **Parallelise experimentation.** Independent simulations (scenarios × routings × queue policies) run side by side on a thread pool, which is where parallelism pays off most.

## 1.4 Architecture in plain English

There are four parts. Say what each one does, in this order.

**1. The Rust engine (`crates/bagflow-core`).**
Say:

> The engine is written in Rust, a fast, memory-safe systems language. It has three jobs. First, a seeded generator makes a synthetic day of flights and bags. "Seeded" means the same seed always gives the same bags, so results are repeatable. Second, a discrete-event simulation moves every bag through ten facilities: check-in, identification, two screening lines, three sorters and three loading areas. Third, it supports four routing strategies, four queue policies and six scenarios. There are two engines. `engine2` is the main one: it is behind the app and all routing and scenario results. The older `engine.rs`, a six-node chain, is still used by the M/M/c validation tool.

**2. The API (`crates/bagflow-api`).**
Say:

> The API is a small web server, also in Rust, built with a library called Axum. The web app talks to it over HTTP on port 3001. It runs simulations, parallel runs, sweeps and benchmarks as jobs. It has a job queue that runs one job at a time, so that two timings never overlap and disturb each other. It saves a record of every finished job to disk, and it keeps full bag histories in memory for the three newest simulations.

**3. The web app (`web/`).**
Say:

> The web app is written in React. It never invents a number. Every value comes from the API, and every value carries a small label saying where it came from: Measured, Real, Static, Simplified, Implemented, Planned or Unavailable. A value that does not exist shows two dashes.

Explain the labels once, here. They are defined in `web/src/components/common/status.ts`:

| Label | Meaning on hover (exact text) |
|---|---|
| `Implemented` | Implemented and runnable on this machine |
| `Real` | Real engine runs by the API on the named machine |
| `Measured` | From a run by the API on this machine, or computed only from such a run |
| `Static` | Saved result from an earlier run, possibly on another machine |
| `Simplified` | A simplified model or display rule, not a direct engine measurement |
| `Planned` | Not built yet |
| `Unavailable` | Unavailable on this machine |

**4. The kernels (`crates/bagflow-kernels`, `kernels/`).**
Say:

> A kernel is a small, tight piece of code that does one calculation over a lot of data. Ours is a deadline-risk classifier: for each bag it estimates how much slack it has before its deadline and puts it in one of three classes, on track, at risk or critical. We wrote the same kernel many ways: a plain scalar loop, an unrolled version, vector instructions (NEON on Apple, AVX2 on Intel), threads with OpenMP and Rayon, the Apple GPU with Metal, NVIDIA GPUs with CUDA, and separate processes with MPI. Every version must give exactly the same answer as the scalar loop. Important: this kernel is a separate batch analysis. The simulation does not use its output.

## 1.5 Map of the app

The sidebar groups pages exactly as in `web/src/config/navigation.ts`. The Guided Demo sits on its own at the bottom of the sidebar. The top bar says `Parallel Airport Processing & Optimisation Studio` on the left and the API state on the right: `API connected`, `Checking API…` or `API unreachable`.

**OVERVIEW**

- **Main Dashboard** (`/`): engine status, a one-click baseline run, the four measured pipeline phases, the Amdahl analysis and the latest sweep.

**OPERATIONS & PARALLELISM**

- **Stage Explorer** (`/operations/stages`): the seven baggage stages, what each does, whether it can be parallelised and what was measured.
- **Airport Network** (`/operations/network`): the engine's ten-facility graph from a saved run, with queues played back over simulation time.
- **Parallel Execution Studio** (`/operations/parallel-studio`): one workload run sequentially and on a chosen backend, replayed from the recorded start and end of every task. Three views: A, B, C.
- **Baggage Tracker** (`/operations/baggage`): a searchable table of every bag in a saved run, and one bag's full timeline.
- **Congestion Analysis** (`/operations/congestion`): where bags queued: bottleneck ranking, utilisation, queues over time, flow in and out, and wait distribution.

**PERFORMANCE**

- **Performance Lab** (`/performance`): live benchmarks of the deadline-risk kernel on every backend this machine has, plus saved results from other machines.
- **Backend Comparison** (`/performance/backends`): one card per backend of this machine from one benchmark run, plus unavailable backends and saved results.
- **Resource Profiler** (`/performance/profiler`): **not built.** It shows a `Planned` page that lists what it would show and says `Not built yet.`

**EXPERIMENTS**

- **Scenario Studio** (`/experiments/scenarios`): configure and run one simulation.
- **Parallel Sweeps** (`/experiments/sweeps`): many independent simulations on a thread pool, checked against the 1-thread pass.
- **Simulation History** (`/experiments/history`): every saved run; reopen any of them, or compare two.

**Guided Demo** (`/guided-demo`, bottom of the sidebar): six steps: Problem, Workload, Parallel kernel, Simulation, Experiment sweep, Results.

Say about the profiler, plainly:

> One page in the sidebar, Resource Profiler, is not built. If you click it, it says Planned and lists what it would show. We do not collect memory or GPU utilisation, so we did not fake that page.

---

# PART 2: Full guided walkthrough (about 25 to 30 minutes)

## 2.0 Timing table

| # | Screen | Minutes | Running total |
|---|---|---|---|
| 1 | Main Dashboard (engine status, baseline, KPIs, pipeline, Amdahl, sweep card, recent runs) | 4.5 | 4.5 |
| 2 | Guided Demo step 1: Problem | 1.5 | 6.0 |
| 3 | Guided Demo step 2: Workload | 2.0 | 8.0 |
| 4 | Guided Demo step 3: Parallel kernel | 1.5 | 9.5 |
| 5 | Guided Demo step 4: Simulation | 1.0 | 10.5 |
| 6 | Guided Demo step 5: Experiment sweep | 1.5 | 12.0 |
| 7 | Guided Demo step 6: Results | 2.0 | 14.0 |
| 8 | Airport Network | 2.0 | 16.0 |
| 9 | Baggage Tracker | 1.5 | 17.5 |
| 10 | Congestion Analysis | 1.5 | 19.0 |
| 11 | Parallel Execution Studio (views A, B, C) | 3.0 | 22.0 |
| 12 | Stage Explorer (7 stages) | 2.0 | 24.0 |
| 13 | Parallel Sweeps | 2.0 | 26.0 |
| 14 | Performance Lab | 1.5 | 27.5 |
| 15 | Backend Comparison | 0.75 | 28.25 |
| 16 | Scenario Studio | 0.75 | 29.0 |
| 17 | Simulation History | 1.0 | 30.0 |

**Prepare before you start** (see Part 9): the Guided Demo's five jobs take about 70 s in total with nothing saved (README, one walkthrough on the M1; the workload and sweep steps were about 31 s each). Run them once before the evaluators arrive, so that each step shows `Reused saved run with the same settings` and you do not wait on stage. Press `Run it again now` live only if you have time.

---

## 2.1 Main Dashboard (`/`), about 4.5 minutes

### What is on screen

Top to bottom (from `DashboardPage.tsx`):

1. Heading `Main Dashboard`.
2. **`Engine status`** card:
   - `Machine`: for example `macos / aarch64, 8 logical cores` with a `Measured` label.
   - `Engine`: the engine name, `API` and its version, `Implemented`. If the API was built without `--release`, a red line: `Debug build: timings are not representative.`
   - `Job queue (one job runs at a time)`: `idle` or `running <job id>`, then `0 of 8 waiting`, `Measured`.
   - `Last simulation finished`: a date and time.
   - **`Kernel backends available`** (`Implemented`): chips such as `scalar`, `ilp`, `neon`, `openmp · 8 threads`, `metal · Apple M1`, `rayon-ilp`, `rayon-neon`. A chip shows a detail after a dot when the API gives one (the OpenMP thread count, the GPU name).
   - **`Not available`** (`Unavailable`): each missing backend with its reason. On an M1 the reasons come from `crates/bagflow-kernels/src/runner.rs`:
     - `avx2`, `rayon-avx2` — `AVX2 needs an x86_64 CPU with AVX2`
     - `cuda-naive`, `cuda-warp`, `cuda-ptx` — `CUDA was not built: CUDA is only built on Linux with nvcc`
     - `mpi` — `live MPI runs are not wired into the runner; see the static results`
3. **`Baseline run`** card: the settings line `Normal · dijkstra · fcfs · 100% capacity · server multiplier 1 · 250,000 bags requested` and the green button `Run baseline`. While it runs, the button reads `A simulation is in progress` and a progress bar appears with phase text:
   - `Generating the dataset (timed sequentially and in parallel)`
   - `Classifying deadline risk (timed scalar and selected kernel)`
   - `Simulating (sequential, events in time order)` with a percentage and `(done / total bags)`
   - `Aggregating results (timed sequentially and in parallel)`
   - `Summarising`, then `Run <id> finished.`
4. **`Latest finished simulation`**: a settings line, then four KPI cards:
   - `Total baggage` (`bags simulated`, `Measured`)
   - `Loaded on time` (`… of bags`, `Measured`)
   - `Delayed bags` (`… of bags`, `Measured`)
   - `Congested facilities` (`API display rule on engine samples`, `Simplified`)
5. **`Where Parallel Computing Makes a Difference`** section:
   - A line: `250,086 bags generated, 250,086 simulated · 8 threads · macos / aarch64, 8 logical cores`, `Measured`.
   - **Four phase cards**, each with a coloured square: `1. Dataset generation` (`Parallel: Rayon`), `2. Deadline-risk classification` (`Selected kernel: rayon-neon` on an M1), `3. Discrete-event simulation` (`Sequential`), `4. Result aggregation` (`Parallel reduction: rayon`).
   - An amber note: `The simulate time includes collection (bag histories and node time-series). Sweep runs use collection off, so this time is not comparable with per-run times in a sweep.`
   - **Chart card** `Full pipeline: sum of phase times, not an end-to-end timing` with two stacked horizontal bars, `All sequential` and `With parallel phases`, and a table below it.
   - **Card** `Amdahl’s law: why the whole pipeline gains so little` with three figures.
   - **Card** `Where parallelism pays off: many simulations at once` (the sweep card).
6. **`Recent runs`** table: up to 8 rows.

### What to click, in order

1. Point at `Engine status` first. Do not click anything.
2. Click `Run baseline`. It takes a few seconds (the simulation phase is about 0.7 s of it on the M1). Talk over the progress bar.
3. When it finishes, scroll slowly: KPI cards, phase cards, chart, Amdahl, sweep card, recent runs.
4. Optional: hover a status label to show its meaning.

### What to say

**Engine status.**

> This first card tells you what machine we are on and what it can run. This is an Apple M1 with eight logical cores. The engine is the Rust `engine2` behind a local API. The job queue line matters: the API runs one job at a time. If I start a sweep and a benchmark together, the second one waits. That way two timings never compete for the same cores.
>
> Below that are the kernel backends. A backend is one way of running the same calculation: one thread, vector instructions, many threads, or the GPU. These are the ones this machine can run, so they are labelled Implemented. Underneath are the ones it cannot run, each with its reason. AVX2 is an Intel vector instruction set, and this is an ARM chip. CUDA needs an NVIDIA GPU and is only built on Linux. MPI, which runs separate processes, is only run from the command line, not live from the app. We show these honestly instead of hiding them. The saved CUDA and AVX2 results appear later, labelled Static.

**Baseline run.**

> Now I run the baseline: the normal day, Dijkstra shortest-path routing, first-come-first-served queues, full capacity, 250,000 bags requested. Watch the progress text. The job has four phases. Generating and classifying are each timed twice, once sequentially and once in parallel, on the same input. The simulation runs once and is sequential. Aggregation is timed both ways again.

**KPI cards.**

> The engine actually simulates 250,086 bags. The request is 250,000, and the generator produces whole flights, so the total is slightly higher. Of those, 9,245 bags, which is 3.697 percent, missed their loading deadline. This number is deterministic: run it again and you get exactly 9,245. The fourth card, congested facilities, is labelled Simplified. It is not an engine output. It is a display rule in the API: a facility counts as congested if its servers were at least 95 percent busy over a 15-minute window.

**Phase cards.**

> This section is the heart of the dashboard. It answers one question: where does parallel computing make a difference in one run?
>
> Each card is one phase. The big number is the time with the parallel version. The grey bar is the sequential baseline, one thread. The coloured bar is the parallel time. The bars only compare the two times inside one card. They do not compare phases with each other.
>
> Dataset generation: about 68 milliseconds on one thread, about 14 milliseconds on eight Rayon threads, roughly 4.7 times faster. Classification is tiny at this size, well under a millisecond either way. Aggregation goes from about 8 to about 1.4 milliseconds, roughly 5.4 times faster.
>
> Now look at the simulation card. About 700 milliseconds. It says "No parallel implementation, so no speedup", and it gives the reason: events must be processed in time order, because each one can change the queues that later events see.
>
> Under each parallel card it says the median of several repetitions and "Output identical to the sequential one." For aggregation it also says "Also matches the engine’s own totals." Classification adds "This is a batch analysis; the simulation does not use its output."

**Amber note.**

> This amber note is a warning against a mistake. The simulate time here includes recording bag histories for the other pages. Sweeps switch that recording off. So do not compare this 700 milliseconds with the time of one simulation inside a sweep.

**Full pipeline chart.**

> This chart adds up the phase times. The top bar is everything sequential. The bottom bar uses the parallel version of every phase that has one. The purple block, the simulation, is almost the whole bar in both. Making the other phases five times faster barely shortens the total. The title is careful: this is a sum of separately measured phases, not one stopwatch from start to end. The table under it has the exact milliseconds, because very short phases are too thin to see.

**Amdahl panel.**

> This is Amdahl's law. It says: if only part of a job can be made parallel, the rest sets a hard limit on the total speedup.
>
> Here the parallelisable fraction p is about 10 percent. The ceiling is one divided by one minus p, so about 1.11 times. That is the best we could ever get, even if the parallel phases took zero time. The measured full-pipeline speedup is about 1.08 times. The line underneath says the eligible phases run several times faster, but about 90 percent of the time stays sequential.

**Sweep card.**

> So where does parallelism pay off? This card answers that. Each simulation stays sequential, but independent experiments do not depend on each other, so a sweep can run many of them at the same time. The table shows the latest sweep: threads, wall time, speedup against one thread, efficiency and time saved. The last line says whether every result on many threads matched the one-thread result. In our saved sweeps of 96 experiments on the M1, eight threads gave 4.5 to 5.2 times. That is four to five times more than the single-pipeline ceiling.

**Recent runs.**

> At the bottom is the log of recent jobs: simulations, sweeps, parallel runs and benchmarks, with their status, a short result and the time. Every result carries a Measured label.

### What to point at, and what the numbers mean

| Point at | Typical value (M1, traced) | Meaning |
|---|---|---|
| `Delayed bags` | `9,245`, `3.697% of bags` | Deterministic (README; `r6_api.txt`). Should match exactly. |
| `Total baggage` | `250,086` | Bags actually simulated from 250,000 requested. |
| Generation card | about 14 ms vs about 68 ms, 4.67x–4.76x | `r6_api.txt`, three baseline jobs. |
| Classification card | 0.1 ms vs 0.4 ms, 2.53x–2.55x | At 250k bags the kernel is tiny. |
| Simulation card | 692–701 ms | The sequential bottleneck. |
| Aggregation card | 1.4 ms vs 7.9 ms, 5.44x–5.46x | Parallel reduction. |
| `Parallelisable fraction p` | 9.8%–9.9% | Share of the all-sequential sum. |
| `Amdahl ceiling, 1 / (1 − p)` | 1.11x (1.109–1.110) | Upper limit for one run. |
| `Measured full-pipeline speedup` | about 1.08x (1.084–1.085) | Ratio of sums of phase times. Two-decimal rounding can show 1.08x or 1.09x. |
| Sweep card, 8 threads | 4.51x–5.20x, efficiency 56.3%–65.0% | `r6_api.txt`, three identical sweeps. |

If the phase card shows `Noisy.` with a range, say: "the repetitions spread by more than 10 percent, so the app shows the range of speedups you get by pairing the fastest and slowest repetitions."

### Key term

**Amdahl's law**: the total speedup is limited by the part of the work that cannot be parallelised; with parallel fraction p the limit is 1 / (1 − p).

### Why it matters

This screen shows the whole argument in one page: parallel phases are real and verified, the simulation is the bottleneck, and the sweep is where the gain is.

### What the evaluator might misread, and how to prevent it

- *"The simulation is slow because you did not optimise it."* Say: it is sequential by nature, not by neglect. Events must be processed in order.
- *"1.08x means parallelism failed."* Say: 1.08x is close to the 1.11x ceiling. The ceiling is set by the sequential share, not by poor parallel code.
- *"Congested facilities is a measurement."* Point at the `Simplified` label: it is a display rule on engine samples.
- *"The bars across phases compare phases."* They do not; each card's bars compare only that phase's two times.
- *Debug build*: if the red `Debug build` line appears, stop and say timings are not representative, then restart with `scripts/start.sh`.

### Transition

> The dashboard gives the argument in one page. The Guided Demo tells the same story step by step, with each step backed by a real API run.

---

## 2.2 Guided Demo: overview (`/guided-demo`)

### What is on screen (every step)

- Heading `Guided Demo` and the line `Six steps, each backed by a real API run. Nothing runs until you press its button.`
- A row of six step buttons: `1. Problem`, `2. Workload`, `3. Parallel kernel`, `4. Simulation`, `5. Experiment sweep`, `6. Results`. Under each: `Result ready` (with a tick), `Skipped`, `No result`, or `Summary` for step 6.
- A heading such as `Step 1 of 6: Problem — Airport congestion`.
- Each running step has a **run panel** card with:
  - The API call in words, for example `POST /api/simulations: …`.
  - A green button: `Run it now`, `Run it again now`, `In progress` or `Submitting…`.
  - A grey hint about the wait.
  - After a result: `Run during this visit` or `Reused saved run with the same settings`, `finished <time>` and the run id.
  - If the API is busy: `The API is busy with <id>. It runs one job at a time, so a new one would wait in the queue. You can queue it, wait, or skip this step.`
  - If the API is down: `API unreachable, so this step cannot run.`
- At the bottom: `Back`, `Step n of 6`, and `Next` (green, when the step has a result) or `Skip this step` (amber, when it does not).

Say once, at the start:

> Each step is one real job on the API. If a step was already run with exactly these settings, the demo reuses the newest saved run and says so in plain words: "Reused saved run with the same settings". If I press "Run it again now", it measures again and says "Run during this visit".

---

## 2.3 Guided Demo step 1: Problem, about 1.5 minutes

### What is on screen

- A card with: `Every bag has a deadline for being loaded. It queues at check-in, identification, screening, sorting and loading. When a facility cannot keep up, its queue grows and bags miss their flights. An operator wants to know which routing, queue rule or capacity change helps, and that means simulating many alternatives.` and, in grey, `All data is synthetic. This is a simulation study, not a real airport.`
- Run panel: `POST /api/simulations: Normal · congestion · fcfs · 70% capacity · …` and `Capacity is cut to 70% on purpose, to make congestion appear. It is a stress setting chosen for this demo.` Hint: `One job on the API: dataset, kernel, simulation and aggregation.`
- Result card `With 70% of the servers` (`Real`) with four figures:
  - `Bags that missed their deadline` (for example `53.752%`, `134,427 of 250,086 bags`)
  - `Mean queueing time per bag` (minutes, `simulated time`)
  - `Longest queue: <facility>` (`bags waiting at one moment`)
  - `Congested facilities` (`Simplified`, `API display rule on engine samples`)
- A bar list `Longest queue at each facility over the run (bags)`, one bar per facility.

### What to click

1. If the step shows `Result ready`, do not rerun. Point at the reuse line.
2. Otherwise press `Run it now` and talk through the text card while it runs (a few seconds).

### What to say

> This is the problem. Every bag must be loaded before a deadline. On its way it queues at five kinds of facility. If a facility cannot keep up, the queue grows, and bags miss their flights.
>
> To make that visible, this step cuts capacity to 70 percent of the servers. That is a stress setting I chose for the demo, not a real airport.
>
> The result: more than half the bags miss their deadline. In our saved run it is 53.752 percent. The bar list shows where the queues formed. The longest queues are at screening, which is the slowest service in the model. Once screening backs up, everything after it is late.
>
> An operator would now ask: which routing, which queue rule, which capacity fixes this? Answering that means running many simulations. Keep that in mind; it is why the sweep matters later.

### What to point at

- The delayed percentage. Traced value for this exact configuration: `53.752%`, 134,427 delayed, engine checksum `29e8786b1e8e3fae` (`r6_api.txt`). It is deterministic.
- The longest bar. The command-line comparison of the same configuration (`r6_compare_70.txt`, congestion + FCFS) shows Screening A with a longest queue of 20,318 bags and Screening B 8,371. The app's bar should agree because it is the same engine and settings; if it differs, say so and trust the screen.
- A saturation banner may appear on other pages for this run (more than 50% delayed). That is expected.

### Key term

**Queue**: bags waiting for a free server at a facility; it grows whenever bags arrive faster than the servers can serve them.

### Why it matters

It motivates the whole project: decisions need many simulations, and many simulations need compute.

### What the evaluator might misread

- *"BagFlow says real airports lose half their bags."* No: synthetic data, deliberately cut capacity.
- *"Mean queueing time is the time to load."* It is total time in queues per bag, in simulated time, not wall-clock time.

### Transition

> Before we can simulate anything, we need a day of bags. That is the first workload we parallelise.

---

## 2.4 Guided Demo step 2: Workload, about 2 minutes

### What is on screen

- Text: `Before anything can be simulated there has to be a day of bags. Each flight’s bags can be generated independently, so the flights are split into chunks that several threads work through at once.`
- Run panel: `POST /api/parallel-runs: generate, rayon, 8 threads, 10,000,000 bags requested, 5 repetitions per side, 64 flights per chunk.` Hint: `Both sides are timed several times on the same input.`
- While running: `Timing both sides`, `n / total executions, warm-ups included`.
- Result card `Sequential against Rayon` with a `Real` banner naming the machine and `10,000,168 bags`. Figures:
  - `Sequential: sequential, 1 thread (median)` with `5 repetitions: … to …`
  - `rayon, 8 threads (median)` with its range
  - `Speedup (sequential ÷ parallel)` with a note: either `Range over the repetitions: …` or, if noisy, the range is the headline and the note says `Noisy, so shown as a range. The headline run gave …`
  - `Throughput at the median` (`bags per second`, in millions)
  - `Parallel efficiency` (`speedup ÷ threads, against the sequential generator`)
- Possibly an amber warning: `The top of the speedup range is above 8x on 8 threads. That comes from pairing an unusually slow sequential repetition (…) with the fastest parallel one. It is timing noise, not extra scaling. Run the step again for a cleaner measurement.`
- `How rayon shared out 10,000,168 bags: N chunks over M threads`, a bar per thread, and the note `Rayon threads take more chunks when they run out (work stealing), so faster cores can end up with more bags.`
- `Recorded timeline of the median repetitions, on one clock`: a `Sequential` timeline and a `rayon` timeline with one row per thread, a time axis and a legend (`merge (one thread)`, `other one-thread stage`, `generate-bags stage (its tasks are in the thread rows)`, `parallel stage without per-task records`).
- A green checksum box: `Checksum match: every timed repetition on both sides gave the sequential result`, with `Sequential checksum` and `rayon checksum`.
- Link: `Replay this run in the Parallel Execution Studio`.

### What to click

1. Point at the reuse line, or press `Run it now` (about 31 s with nothing saved, per the README).
2. Scroll to the thread bars, then the timeline, then the checksum box.
3. Hover one coloured block in the timeline to show its tooltip (`chunk … · thread … · … to … · … bags`).

### What to say

> Here we generate ten million bags. Each flight has its own random stream, so the bags of different flights can be made independently. The flights are split into chunks of 64, and Rayon, a Rust library for data parallelism, hands the chunks to eight threads.
>
> Both sides run on the same input, five times each, and we show the median. The median is the middle value, so one unusually slow run does not distort it.
>
> On the M1 the sequential side takes about three seconds and the Rayon side well under one second. In our saved runs through the app the median speedup was 2.95 to 3.70 times. The command-line tool, without the web server around it, reaches 4.7 to 5.1 times. We did not investigate why the API is slower, and we say so.
>
> These bars show how many bags each thread produced. They are not equal. Rayon uses work stealing: when a thread finishes its chunks, it steals unfinished ones from busy threads. Faster cores therefore end up doing more.
>
> This timeline is recorded, not animated. Every block is one real chunk, drawn from its measured start to its measured end. Both runs share one clock, so you can see the parallel run finish first. The dark block at the end is the merge, which runs on one thread and does not shrink with more threads.
>
> Finally, the green box: every repetition on both sides gave the same checksum. A checksum is a fingerprint of the whole dataset. If even one bag differed, the fingerprints would differ.

If the amber warning shows:

> This warning is the app being honest. Pairing one unusually slow sequential repetition with the fastest parallel one gives a figure above eight times on eight threads. That is noise, not magic scaling.

### What to point at

- Speedup: through the API at 10M bags with 64-flight chunks, medians 2.95x–3.70x; pairing extremes 1.37x–12.29x (`r6_api.txt`, job 3 shows the >8x noise case).
- CLI, for contrast: 4.74x–5.09x at 8 threads (`r6_gen_10M.txt`).
- Efficiency = speedup ÷ 8, so about 37%–46% at the API medians (derived from the medians above, not printed in the file).
- Checksum: the CLI prints `2fa040bc2723a302` for 10M bags, seed 42 (`r6_gen_10M.txt`). The app's checksum may be computed differently; do not promise they match.

### Key term

**Work stealing**: idle threads take queued tasks from busy threads, so the load balances itself without a fixed plan.

### Why it matters

It shows real, verified parallel speedup on a real workload, and it shows the limits (serial merge, noise) instead of hiding them.

### What the evaluator might misread

- *"3x on 8 threads is poor."* Explain efficiency: overheads, a serial merge and unequal cores (the M1 has performance and efficiency cores; this is general hardware knowledge, not measured here).
- *"The timeline is an animation."* It is a replay of recorded times.
- *"Unequal thread bars mean a bug."* They are work stealing working as intended.

### Transition

> Generation is parallel across flights. Next is a calculation that is the same tiny step repeated millions of times: the risk kernel.

---

## 2.5 Guided Demo step 3: Parallel kernel, about 1.5 minutes

### What is on screen

- Text: `Classifying every bag’s deadline risk is the same small calculation millions of times. The scalar kernel does one bag after another; the accelerated one uses more threads, and vector instructions where the backend has them. This is a batch analysis of the bag table: the simulation does not use its output.`
- Run panel: `POST /api/parallel-runs: classify, rayon-neon, 8 threads, 10,000,000 bags requested, 10 repetitions per side.` (On an Intel machine with AVX2 it would pick `rayon-avx2`.) If no accelerated backend: `This machine reports no accelerated classification backend.`
- Result card `Scalar against rayon-neon`: sequential median, `rayon-neon, 8 threads (median)`, speedup, throughput. No efficiency.
- Grey note: `The baseline is the scalar loop as the compiler builds it, which may already be auto-vectorised. The speedup mixes vector instructions with threads, so dividing it by the thread count would not be a parallel efficiency, and none is shown.`
- Checksum box and the replay link.

### What to click

Point at the reuse line, or press `Run it now`. Then the speedup, the grey note and the checksum box.

### What to say

> The kernel looks at each bag and estimates its slack before the deadline, then puts it into one of three classes. One bag does not depend on another, so this is ideal for parallel hardware.
>
> The baseline is the scalar loop: one bag after another on one thread. The accelerated version, rayon-neon, splits the bags across eight threads, and inside each thread uses NEON vector instructions, which process several bags in one instruction.
>
> At ten million bags, scalar takes about 14 milliseconds. Rayon with NEON takes about 2. In our saved app runs the median speedup was 6.4 to 6.6 times.
>
> Notice there is no efficiency figure. Efficiency means speedup divided by threads. Here part of the speedup comes from vector lanes, not threads, so that division would be meaningless. The app refuses to show it.
>
> And again: the simulation does not use this output. It is a separate batch analysis of the bag table.

### What to point at

- Scalar median about 14.2 ms; rayon-neon about 2.2 ms; speedup medians 6.37x–6.59x; pairing extremes 3.83x–8.09x (`r6_api.txt`).
- Command-line best-of-10, for contrast: Rayon 4 + NEON 7.08x–7.72x (`r6_kernels_10M.txt`).

### Key term

**SIMD (single instruction, multiple data)**: one CPU instruction that works on several values at once; NEON (ARM) and AVX2 (Intel) are SIMD instruction sets.

### Why it matters

It shows two different kinds of parallelism stacked: threads across cores, and vector lanes inside one core.

### What the evaluator might misread

- *"This kernel makes the simulation faster."* No. Say it plainly.
- *"The baseline is unfair."* The scalar loop may already be auto-vectorised by the compiler, which makes our speedup smaller, not larger. With vectorisation switched off, scalar took 21.16 ms on the M1 (`kernels_10M_novec.txt`, saved, cited in the README).

### Transition

> Now the part we cannot parallelise: the simulation itself.

---

## 2.6 Guided Demo step 4: Simulation, about 1 minute

### What is on screen

- Text: `The engine moves each bag through the network one event at a time. Events must happen in time order, because who is served next depends on everything that happened before, so this part stays sequential.`
- Run panel: `POST /api/simulations: Normal · dijkstra · fcfs · 100% capacity · …` and `Full capacity: the Dashboard’s baseline.`
- Result card `Movement, queues and deadlines` (`Real`): `Bags simulated`, `Missed their deadline`, `Mean queueing time per bag`, `Longest queue at one facility`.
- `Longest queue at each facility over the run (bags)` bar list.
- `Wall time of the simulation on this machine`: the simulation phase card (sequential, no speedup, with the reason).
- Links: `Watch it on the Airport Network`, `Congestion over time`.

### What to say

> This is the baseline day at full capacity. 3.697 percent of bags miss their deadline. The longest queue is at screening again, but far shorter than at 70 percent.
>
> This card is the honest part. The simulation took about 0.7 seconds and has no parallel version. Who is served next depends on everything that happened before, so events must be handled in time order. You cannot hand the next event to another core without knowing the result of the previous one.

### What to point at

- `3.697%`, 9,245 bags (deterministic).
- Longest queue: the command-line run of this configuration shows Screening A at 9,743 bags (`r6_compare_100.txt`).
- Simulation wall time 692–701 ms on the M1 (`r6_api.txt`), including collection.

### Key term

**Discrete-event simulation**: a simulation that jumps from one event (a bag arrives, a service ends) to the next in time order, instead of ticking a clock.

### Why it matters

It is the reason the single-pipeline speedup is capped, and the reason we parallelise experiments instead.

### What the evaluator might misread

*"You could just split the bags between cores."* Bags share queues. A bag served earlier changes when the next one starts. Splitting them would change the answer. (See Part 8 for parallel discrete-event simulation.)

### Transition

> If one simulation cannot be split, what can? Many simulations.

---

## 2.7 Guided Demo step 5: Experiment sweep, about 1.5 minutes

### What is on screen

- Text: `An operator does not need one simulation but many: every scenario against every routing and queue rule. These experiments do not depend on each other, so several can run at the same time even though each one is sequential inside.`
- Run panel: `POST /api/sweeps: 6 scenarios × 4 routings × 4 queue policies × 1 capacity, 100,000 bags each, on 1 and 8 threads.` Hint: `The longest step: the whole grid runs on 1 thread, then again on all threads.`
- While running: `Live: pass 1 of 2, 1 thread.` with `Completed in this pass`, `Running`, `Failed`, `Finished over all passes`, a progress bar and the experiment grid.
- Result card `96 experiments, one thread against 8`, `Real` banner, `100,000 bags requested per experiment`. Figures: `1 thread, wall time (this sweep)`, `8 threads, wall time (this sweep)`, `Wall-time speedup`, `Parallel efficiency (this sweep)` (`speedup ÷ threads`).
- Table `Threads | Sweeps | Shortest wall | Longest wall` and the line `Wall times over saved sweeps with these settings`.
- Possibly `One sweep only. Each pass was timed once, and timings move with heat and background load. Press “Run it again now” to measure the spread before quoting this speedup.` or `Noisy timings. Wall times of N saved sweeps with these settings differ by more than 10% at …`
- `Which worker ran each experiment at 8 threads`: the experiment grid, one cell per experiment, filled in its worker's colour. Legend: `Grey outline: not started. Thick outline: running. Filled: completed, in its worker’s colour. ✕: failed.`
- Green line `All 96 compared runs gave the 1-thread results.`
- `Time saved in this sweep: … (…x). Each simulation was sequential; only the grid was split across threads.`
- Link `Replay this sweep`.

### What to say

> This is the payoff. Six scenarios, four routings, four queue policies: 96 independent simulations of 100,000 bags each. Each simulation is still sequential inside. But they do not depend on each other, so eight can run at once.
>
> The sweep runs the whole grid on one thread first, then again on eight threads, on the same machine, in the same job. On the M1 the one-thread pass takes about 24 to 25 seconds and the eight-thread pass about 5. Over three saved sweeps that is 4.5 to 5.2 times faster.
>
> Each coloured cell is one experiment, coloured by the worker thread that ran it. And this green line is the correctness proof: all 96 results on eight threads were identical to the one-thread results, including a checksum over every bag's finish time.
>
> If only one sweep is saved, the app warns me not to quote the speedup yet, because each pass is timed once. That is why I quote a range.

### What to point at

- `r6_api.txt`, three identical sweeps: 1 thread 24.23–25.27 s; 8 threads 4.72–5.61 s; speedup 4.51x–5.20x; efficiency 56.3%–65.0%; all 96 identical each time.

### Key term

**Embarrassingly parallel**: work made of independent pieces that need no communication, so they can run side by side with almost no coordination.

### Why it matters

It is the system-level answer: parallelism cannot shorten one simulation, but it shortens the time to evaluate many alternatives by four to five times here.

### What the evaluator might misread

- *"Efficiency of 60% means wasted cores."* Cores are not equal in speed, and experiments have different lengths, so the last ones leave some threads idle. The API's definition text says `Cores need not be equal in speed`.
- *"The grid shows big operational differences."* At 100,000 bags and full capacity the load is light; the README says every experiment delayed under 0.04% of bags in the demo's runs. This grid demonstrates wall-time gain more than operational differences.

### Transition

> The last step gathers everything into one summary.

---

## 2.8 Guided Demo step 6: Results, about 2 minutes

### What is on screen

- If any step has no result, an amber note: `Some steps have no result, so their cells show --.` with links to those steps (marked `(skipped)` if skipped).
- **`Amdahl’s ceiling, and where parallelism pays off`**: `In the baseline run, p of the all-sequential time is in phases with a parallel implementation. The Amdahl ceiling for one pipeline run is therefore 1 / (1 − p) = …x, however many cores are added. The measured full-pipeline speedup, a ratio of sums of phase times, was …x.` Possibly `The N newest saved baseline runs agree to two decimals: …` Then the teal box: `The sweep is where parallelism pays off. One pipeline is held back by its sequential simulation. A sweep’s experiments are independent, so whole simulations run side by side and the pipeline ceiling does not apply to the grid. Measured here: …` ending with either `Even the lowest saved sweep speedup is above the pipeline ceiling.` or `In these saved runs the sweep speedup does not clearly exceed the pipeline ceiling, so measure again before relying on it.`
- **`Speedup and efficiency`**: four rows, `Dataset generation`, `Risk kernel: rayon-neon vs scalar`, `One full pipeline`, `Experiment sweep (grid)`, each with detail text (threads, range or `timed once, no spread`, efficiency). Footer: `The rows have different baselines and workloads, so do not add or multiply them. Ranges wider than 10% are marked noisy. The kernel has no efficiency figure because its speedup can include vector instructions.`
- **`Throughput`**: `Generating bags`, `Classifying bags`, `Simulating bags (sweep)`, each in `M bags/s` with slowest-to-fastest detail.
- **`Operational outcomes`** (`Real`): a table `Measure | 70% capacity | 100% capacity` with rows `Bags`, `Delayed`, `Longest queue`, `Congested (display rule)`. Note: `The two runs also use different routing (congestion at 70%, dijkstra at 100%), so the difference is not the effect of capacity alone.` Then the best and worst sweep experiments, with `Here even the worst experiment delays under 1% of bags: …` when that is true.

### What to say

> This page brings the five steps together.
>
> First, Amdahl. In the baseline run only about 10 percent of the time is in parallel phases, so one pipeline can never be more than about 1.11 times faster, however many cores we add. We measured about 1.08.
>
> Second, the sweep. Its experiments are independent, so the pipeline ceiling does not apply to the grid. We measured four and a half to five times. The app checks this for me: it says whether even the lowest saved sweep speedup beats the ceiling.
>
> The speedup table has a warning I want to read out: the rows have different baselines and workloads, so do not add or multiply them. Generation is against the sequential generator. The kernel is against the scalar loop. The sweep is against one thread.
>
> The throughput rows say how many bags per second each part handles.
>
> And the operational outcomes: at 70 percent capacity over half the bags are late; at 100 percent under 4 percent. The app reminds us these two runs also differ in routing, so this is not the effect of capacity alone.

### What to point at

- Ceiling 1.11x, full pipeline about 1.08x (`r6_api.txt`).
- Sweep 4.51x–5.20x.
- Delayed 53.752% vs 3.697%.

### Key term

**Throughput**: work done per unit of time; here, bags generated, classified or simulated per second.

### Why it matters

It is the one-page conclusion: verified parallel phases, a capped pipeline, and a large gain from parallel experiments.

### What the evaluator might misread

- *"Multiply the speedups for a total."* No; the footer says so.
- *"Capacity alone explains 53% vs 3.7%."* No; routing differs too.

### Transition

> The demo showed the numbers. Now let me show what one simulation looks like inside: the Airport Network.

---

## 2.9 Airport Network (`/operations/network`), about 2 minutes

### What is on screen

- Heading `Airport Network`, subtitle `The engine’s airport graph, with queues over simulation time.`
- **Run selector** (top of every Operations page): `Selected simulation` drop-down of finished runs, a `Real` label, and, for a run with more than 50% delayed, the amber **saturation banner**: `Saturated run: … bags (…%) were delayed in simulation <id>.` followed by an explanation that servers do not grow with the bag count, and `Read these results as an overloaded system, not normal operation.`
- **Toolbar card**:
  - Buttons `Zoom in`, `Zoom out`, `Fit`.
  - Tick boxes `Labels`, `Congestion`, `Flow`, `Sampled bags`.
  - `Types shown:` one tick box per facility type (check-in, identification, screening, sorter, loading).
  - `View` drop-down: `Playback time` or `Whole run`. `Play`/`Pause`. `Speed`: `1`, `5`, `15`, `60`, `600 sim s per s`. A time slider and the simulated clock with `Real`.
  - Note: `Playback shows saved simulation results, not a live airport. Times are simulation time.` and `Facility values come from the engine sample at hh:mm; there is one every 60 simulation seconds.`
  - With sampled bags on, a `Simplified` note: `N markers shown, from M sampled bags with their real histories: a small sample, not every bag, so marker density shows nothing about load. Bags are drawn in straight lines along each link at even speed between the real departure and arrival; at a facility they are drawn in a ring beside it.`
- **Graph card**: `Queue figures on the graph are engine samples` (`Measured`), `colours are the BagFlow display rule, not an airport standard` (`Simplified`). The graph: check-in on the left, loading areas on the right. Each node label shows its name, `queue N` and the status word.
- **Legend**: `Normal` (green), `High` (amber), `Congested` (red), `Offline` (grey); `Link (width: bags over the whole run; arrow: direction)`; `Link down at this time (whole run: had an outage)` (dashed red); `Sampled bag` (blue dot); `Sampled bag redirected by SorterOverload` (purple diamond).
- Status rule note: `Facility colours: BagFlow display rule, not an airport standard. The API takes utilisation over the last 15 samples (15 simulation minutes): High from 75%, Congested from 95%, Offline when capacity is zero. The engine itself has no facility status.`
- `Drag the background to pan; scroll to zoom. Node positions and names are BagFlow’s layout. Conveyors are the links, not facilities.`
- **Facility panel** on the right: `Selected facility or link` drop-down. For a facility: `Id / type`, `Capacity (servers)`, `Busy servers`, `Incoming`, `Outgoing`, `Queue length`, `Longest queue (run)`, `Average wait (run)`, `Utilisation (window)` (`Simplified`), `Utilisation (run)`, `Peak window utilisation (run)`, `Status at this time`, `Arrived so far`, `Completed so far`, and `Capacity cut` if there was an outage. For a link: `Source`, `Destination`, `Travel time (fixed)`, `Maximum throughput` = `-- not enforced by the engine`, `Bags over the whole run`, `Availability`, `Outages`.

### What to click

1. In `Selected simulation`, choose the baseline run (Normal · dijkstra · fcfs · 100%). It should be one of the 3 newest simulations, or its detail has expired.
2. Leave `View` on `Playback time` (it starts at 18:00, the evening peak). Set `Speed` to `60` or `600` and press `Play`.
3. Click `Screening A`. Read two or three rows of the panel.
4. Click the link from Screening A to Sorter 1 to show a link panel.
5. Switch `View` to `Whole run` to show worst status per facility.
6. Optional: choose the 70% run to show red nodes and the saturation banner.

### What to say

> This is the engine's airport: ten facilities. One check-in hall with 40 servers, identification with 4, two screening lines, A and B, three sorters and three loading areas. The lines between them are conveyor links with a fixed travel time.
>
> This is a replay of a saved run, not a live airport. The clock is simulation time. Every 60 simulated seconds the engine recorded each facility's queue and busy servers, and that is what drives the numbers on the nodes.
>
> The colours are our display rule, not an airport standard and not an engine output: amber when a facility is at least 75 percent busy over the last 15 minutes, red at 95 percent.
>
> The blue dots are a small sample of real bags with their real histories. They are drawn moving in straight lines at even speed between their real departure and arrival times. The density of dots does not show load, because it is only a sample.
>
> If I click Screening A, the panel shows its servers, queue now, longest queue in the run, average wait and utilisation. Utilisation is the share of servers busy. Rows marked "run" cover the whole day; the others are at this playback time.
>
> A link panel shows travel time and how many bags used it. Maximum throughput says "not enforced by the engine". Links have no capacity limit in this model, and we say that rather than invent one.

### What to point at and what the numbers mean

- Screening A's queue in the evening: in the baseline its longest queue over the run is 9,743 bags (`r6_compare_100.txt`, node `Screening #2`). Average wait about 860 s and utilisation 64% over the whole run in that file.
- Under Dijkstra one sorter gets no bags (`Sorter #5`, 0 arrivals, in `r6_compare_100.txt`). Say: Dijkstra always picks the single shortest path, so a parallel sorter can sit idle. Congestion-aware routing spreads the load (the same file shows that sorter with 53,933 arrivals under congestion routing).
- Whole-run utilisation looks low (for example check-in 43%) because a whole-day average includes quiet hours. The Congestion page says this too.

### Key term

**Utilisation**: the share of a facility's servers that are busy; near 100% means queues grow quickly.

### Why it matters

It makes the sequential simulation concrete and shows where the bottleneck is (screening).

### What the evaluator might misread

- *"This is live."* It is a replay.
- *"Colours are measurements."* They are a display rule.
- *"Dots are all the bags."* A small sample.
- *"Links have a capacity."* Not enforced.

### Transition

> The network shows facilities. The Baggage Tracker shows individual bags.

---

## 2.10 Baggage Tracker (`/operations/baggage`), about 1.5 minutes

### What is on screen

- Heading `Baggage Tracker`, subtitle `Search bags and follow one through the run. All bags, flights and passengers are synthetic.`
- Run selector (as above).
- Time card: `Show bags` = `At a playback time` or `At the end of the run`, a slider and the clock.
- Four cards: `Total bags` (`N not arrived yet` or `All bags in the run`), `In transit (on a link)` (`N more are in service`), `Waiting (in a queue)`, `Delayed` (`Loaded after the deadline so far; overdue bags still in the system are not counted`, or `Loaded after the deadline` at the end).
- Note ending with `The engine does not produce MISROUTED or TRANSFER_PENDING, so there is no count for either.`
- `Bags` table (`Real`): filters `Bag id (exact)`, `Flight number`, `Status`, `At facility now` (or `Facility visited`), `Clear filters`. Note: `The API sorts by bag id, arrival or deadline; use those column headers.` Columns: `Bag id`, `Flight`, `Current location` (or `Final location`), `Status`, `Priority`, `Arrival`, `Deadline`, `Departure`. A status can carry `overdue`. For a SorterOverload run, a `◆ Redirected` badge.
- Footer: `N matching bags. Page x of y.` (`Measured`), `Rows per page` 25/100/500, `First`, `Previous`, `Next`, `Last`.
- **Bag drawer** (click a row): `Bag <id>`; `Every value here is from this run’s engine history of one synthetic bag.` (`Real`); facts: status, `Location`, `Flight`, `Departure`, `Loading area`, `Priority`, `Passenger id (synthetic)`, `Weight`, `Attributes` (transfer, special handling), `Arrived`, `Deadline`, `Queue wait so far`/`Total queue wait`. Then `State timeline (whole run)` with entries such as `Checked in`, `Identified`, `Screening`, `Held for inspection` (`During screening (no time of its own)` · `extra inspection …`), `Cleared (at sorter)`, `Sorted`, `Loading`, `Loaded on time` or `Delayed`, each with time, facility and `waited …`.

### What to click

1. Keep the playback time at 18:00. Read the four cards.
2. Filter `Status` = `Waiting`-type statuses such as `Screening`, or pick `At facility now` = `Screening A`.
3. Switch `Show bags` to `At the end of the run`, filter `Status` = `Delayed`.
4. Click a delayed bag's id. Walk down its timeline.

### What to say

> Every bag in the run can be looked up. At six in the evening, these cards show how many bags have not arrived yet, how many are travelling on a link, how many are being served, and how many are waiting in a queue.
>
> Let me open one delayed bag. This drawer is that bag's real history from the engine: when it checked in, how long it waited at each facility, whether it was held for inspection, and when loading started. Its deadline was here; loading finished after it, so it is Delayed.
>
> Two honest notes. The engine never produces a misrouted bag or a pending transfer, so those statuses have no count. And "Cleared" only means screening ended; the engine rejects no bags.

### What to point at

- `Delayed` at the end of the baseline run: 9,245.
- In the drawer, the `waited` values: usually the big one is at screening.

### Key term

**Deadline**: the latest time a bag's loading may finish; a bag loaded after it counts as delayed.

### Why it matters

It shows the simulation is a real per-bag model, not just totals, and it shows what is not modelled.

### What the evaluator might misread

- *"Flight numbers and passengers are real."* Synthetic numbers. There are no flight codes or destinations.
- *"In transit is zero at the end, so the counter is broken."* At the end every bag is loaded.

### Transition

> From single bags to the whole picture of where they queued: Congestion Analysis.

---

## 2.11 Congestion Analysis (`/operations/congestion`), about 1.5 minutes

### What is on screen

- Heading `Congestion Analysis`, subtitle `Where bags queued in this run.`
- Four cards: `Facilities congested at some point` (`Simplified`, `Counted by the display rule below`), `Average queue wait per bag` (`Total time in all queues`), `Highest run utilisation` (facility name, `A long idle day lowers a whole-run average.`), `Delayed bags`.
- The status rule note (as on the network page).
- **`Bottleneck ranking`** (`Simplified`): `Ranked by total queue time (average wait × arrivals): a BagFlow ranking rule. Click a facility to select it on the network.` Columns: `Facility`, `Rank`, `Worst status`, `Total queue time`, `Average wait`, `Longest queue`, `Utilisation (run)`, `Peak window`, `Source of values`. Footer: `Total and average wait, longest queue and run utilisation are measured. Peak window uses the display rule’s window.`
- **`Utilisation by facility, whole run`** bar list: `Average share of servers busy.`
- **`Peak window utilisation by facility`** bar list (`Simplified`): `The highest value of the display rule’s 15-sample window.`
- **`Queue length over time`**: `Engine samples, one per simulation minute. Long runs are drawn with each point the highest sample of its stretch. A shorter peak between samples is not in the series; the ranking’s longest queue is exact.` Tick box `Same vertical scale for every facility`. Ten small line charts, each titled with the facility, `highest sample N`, `Measured`.
- **`Incoming vs outgoing`** (`Measured`): `Bags arriving at and finishing at one facility per 15 simulation minutes. Bin edges are accurate to one sample.` `Facility` picker, `Show on the network` link, a line chart (`Incoming` solid blue, `Outgoing` dashed orange), and `Show the values as a table`.
- **`Waiting-time distribution`**: `Queue wait of each service start over the whole run; a bag counts once at each facility it visits. Bins have different widths.` `Facility` picker with `All facilities`, and a bar list of wait bins (the API's bin edges are 0, 1 s, 5 s, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 30 min).

### What to click

1. Point at the bottleneck ranking: Screening A on top.
2. Scroll to `Queue length over time`; untick `Same vertical scale` to see small facilities' shapes, then tick it again.
3. In `Incoming vs outgoing`, keep Screening A selected.
4. In `Waiting-time distribution`, switch from `All facilities` to `Screening A`.

### What to say

> This page answers: where did bags wait? The ranking multiplies average wait by the number of bags that arrived, so a facility that makes many bags wait a little and one that makes a few bags wait a lot are compared fairly. That ranking rule is ours, so it is labelled Simplified.
>
> Screening is the bottleneck. In the baseline, Screening A has the largest total queue time.
>
> These small charts are queue length over the day, one point per simulated minute. The evening peak stands out at screening; the other facilities stay almost flat.
>
> The incoming versus outgoing chart explains why. When the blue line, bags arriving, is above the orange line, bags finishing, the queue grows. When orange catches up, it drains.
>
> The distribution shows most service starts wait almost nothing, and a long tail waits many minutes. That tail is screening.

### What to point at

- Baseline (`r6_compare_100.txt`, dijkstra + FCFS): Screening A average wait 860.5 s, longest queue 9,743; Screening B 549.5 s, 2,556; all other facilities under 2 s average wait.
- `Highest run utilisation`: 65% (Screening B) in that file; say it looks low because it averages the whole day.

### Key term

**Bottleneck**: the stage with the least spare capacity, which limits the flow through the whole system.

### Why it matters

It shows the operational question the sweeps answer: what change relieves screening?

### What the evaluator might misread

- *"Highest utilisation 65% means no problem."* It is a whole-day average; the peak window is the better sign.
- *"The queue chart misses nothing."* It samples once a minute; the ranking's longest queue is exact.

### Transition

> Those were operations. Now back to parallelism, in detail: the Parallel Execution Studio.

---

## 2.12 Parallel Execution Studio (`/operations/parallel-studio`), about 3 minutes

### What is on screen (all views)

- Heading `Parallel Execution Studio`, subtitle `One workload run sequentially and on a chosen backend, with the record of every task.`
- Run selector bar.
- **`Workload`** form: `Workload` (`Generate dataset`, `Classify deadline risk`, `Aggregate node stats`), `Backend` (with unavailable ones greyed out as `(unavailable)`), `Threads` (or `Threads (not selectable)` for backends without a thread count), `Bags requested`, `Timed repetitions`, button `Measure`. Defaults: classify, rayon-neon, 250,000 bags, 3 repetitions. Under it, `Not selectable` (`Unavailable`) with reasons.
- Three tabs: `A. Workload distribution`, `B. Backend comparison`, `C. Execution timeline`.
- When a run is shown: `Showing <workload> on <backend>, N bags · machine · id` (`Measured`), then the **`Sequential vs selected`** card: `Sequential baseline: …, 1 thread`, the backend with its threads, `Speedup (sequential ÷ selected)`. A spread line or a `Noisy timings.` warning. `Same input (N bags). R timed repetitions per side, alternating, after one warm-up each. Each wall time is the median repetition (the lower middle one for an even count).` The raw repetition times for each side. A box **`What this run shows`** with sentences built only from this run's numbers, for example `Up to 8 recorded tasks ran at the same instant on 8 threads: … of task time inside … of wall time.` and `Combining the partial results took … on one thread; that part does not shrink with more threads.`

### What to click

1. Click `Replay this run in the Parallel Execution Studio` from the Guided Demo workload step, or open the studio and set `Workload` = `Generate dataset`, `Backend` = `rayon`, `Bags requested` = `1000000`, then `Measure`. (A smaller size is quicker on stage.)
2. View A: press `Play replay`, set `Speed` slower if needed, then `Show full run`.
3. View B: switch `Workload` to `Classify deadline risk` and look at the cards; press `Measure` on `metal` if there is time.
4. View C: look at the two Gantt charts.

### View A: Workload distribution

On screen, after `Replay of a measured run, not a live view. Positions come from the recorded start and end times. Speed changes only how fast the replay moves, never a measured value.` and the replay controls (`Play replay`, `Show full run`, `Speed`, `Elapsed job time`, `shown about N× slower than it ran`, slider):

1. `1. Original workload`: `Bags` (`… requested`) and the result figures (for example `Result: bags`, `Result: flights`).
2. `2. Partition into chunks`: `N chunks of up to S flights` (or bags), then `At the playhead: x done, y running, z not started.` and a row of numbered chunk boxes: grey outline = waiting, thick coloured outline = running, filled colour = done (colour = thread).
3. `3. Worker assignment`: `x of 8 threads ran at least one chunk.` and a table `Thread | Chunks | Bags | Task time | Source`.
4. `4. Concurrent execution`: `Both runs share one clock starting at 0, so the shorter one finishes first.` A `Sequential` timeline and a `Selected` timeline with a red playhead.
5. `5. Result merge`: `Merge time (append (merge), …), one thread` and `At the playhead`: `waiting for chunks`, `merging`, `complete`.
6. `6. Checksum verification`: the checksum box.

Say:

> This view tells the parallel story in six steps, all from recorded data. First the workload. Second, it is cut into chunks. Watch the chunk boxes: as I play, each lights up in the colour of the thread that took it. Third, which thread did how much. Fourth, the two timelines on one clock: the sequential one is a single lane; the parallel one has eight lanes running at once, and it finishes far earlier. Fifth, the merge: partial results are combined on one thread. This part does not get faster with more threads, which is Amdahl's law in miniature. Sixth, the checksum: the parallel result equals the sequential one.
>
> Speed only changes how fast the replay moves. It never changes a measured number.

Caution to say if asked: with the API's default chunk for generate, very few tasks may exist per batch and threads sit idle. The README records this as a known issue measured with the old default of about 1,042 flights per chunk; the default is now 16 flights, not yet re-measured. The Guided Demo asks for 64-flight chunks.

### View B: Backend comparison

On screen: `Classify deadline risk, 250,000 bags requested (change these in the form). Each card is the newest finished run of that backend at this size. Its speedup is against the sequential side of that same run. Check thread and repetition counts before comparing cards.` Then one card per backend this machine has, each titled with its id and `Implemented`, with a family line:

- `One thread` — `One thread, chunk after chunk.` (scalar) or `One thread running the instruction-level-parallel kernel.` (ilp)
- `Threads on chunks` — OpenMP: `OpenMP threads; schedule(static) gives each thread a contiguous block of chunks.`; Rayon: `Rayon tasks, one per chunk; idle threads steal work.`
- `Vector lanes, one thread` — `One instruction works on several values. Lanes are not workers.`
- `Threads on chunks, vector lanes inside each` — rayon-neon, rayon-avx2.
- `GPU: copy in, kernel, copy out` — `The GPU runs the kernel; it reports phase times only.`

Each card: `Wall time`, `Speedup vs scalar`, `Threads` (or `GPU`), `Timed repetitions`, and a visual for its family: thread rows of chunk ids (`Numbers are chunk ids, from this run’s task records.`), vector lanes (for NEON `lane 0` to `lane 3` and `4 lanes × 32-bit integer = 128-bit register; 8 bags per loop iteration. Lanes are values processed by one instruction on one thread; they are not separate workers.`), or GPU phase bars (`Copy in`, `Kernel (device time)`, `Launch and wait beyond the kernel`, `Copy out`). Then `Checksum match with sequential`, and buttons `Measure with 8 threads` (or `Measure`) and `Replay this run`. Below: `Not available on this machine` with reasons, and **`Saved Kaggle results: CUDA and AVX2`** (`Static`): `Measured earlier on another machine at another size. Not comparable with the cards above.`

Say:

> Each kind of parallelism gets its own picture. Threads are drawn as lanes of chunks. SIMD is drawn as vector lanes inside one thread: lanes are not workers, they are slots in one wide register. The GPU is drawn as copy in, kernel, copy out, because the GPU gives us phase times, not per-task times.
>
> At this small size, notice the GPU card. Its kernel is fast, but the copies and the launch can cost more than the whole scalar loop. That is why a GPU can be slower on small inputs.
>
> CUDA and AVX2 cannot run on this Mac. Their Kaggle results are shown below, labelled Static, with the machine named, and the app says they are not comparable with the live cards.

### View C: Execution timeline

On screen: `Recorded start and end of each task, in time since the start of the execution; both charts use the same scale. Hover a bar for its chunk.` plus the task note, then a Gantt card `Selected: <backend>` with `Wall time`, `Tasks recorded`, `Threads with tasks`, `Most tasks at once`, the timeline and legend; `The final merge took … ms.` (or `No separate merge step in this run.`); then `Sequential baseline: …` with the same four figures. For a GPU backend: `<backend>: no task timeline` / `The GPU reports no per-task times, so there is no Gantt chart. These are the measured phases.`

Say:

> This is a Gantt chart: one row per thread, one block per task, from its real start to its real end. "Most tasks at once" is the measured concurrency. The sequential chart below has one row. Same scale, so the difference in length is the speedup you see in numbers above.

### What to point at

- `Most tasks at once` should be close to the thread count for Rayon.
- The merge block at the end (dark).
- In view B, the GPU card's phase bars: copy in vs kernel.

### Key terms

- **Chunk / partitioning**: cutting the input into pieces that can be processed independently.
- **Checksum verification**: comparing a fingerprint of the parallel output with the sequential one.

### Why it matters

It is the visual proof that the parallelism is real: tasks overlap in time, the merge is serial, and results match.

### What the evaluator might misread

- *"The replay is a simulation of threads."* It is drawn from recorded task times.
- *"Cards in view B are directly comparable."* Only if threads, size and repetitions match; the page says check them.
- *"Static Kaggle numbers were run here."* They were not.

### Transition

> The studio showed how each workload is parallelised. The Stage Explorer maps that back onto the baggage process, stage by stage.

---

## 2.12a Parallel Airport Operations (`/operations/parallel-operations`), about 2 minutes

### What is on screen

- Heading `Parallel Airport Operations`, subtitle `The engine’s independent per-bag work on Rayon workers, and the event loop that stays sequential.`
- Three header cards: `Workers`, `Bags processed`, `Execution time`, from the newest finished run on the page; `--` before any run.
- **Run controls**: `Scenario`, `Routing`, `Policy`, `Bags`, `Workers`, and the buttons `Run sequential` and `Run parallel` (same configuration; capacity and server multiplier are the API defaults). Below: `Sequential run (event loop)`, `Parallel run (precompute + loop)`, `Speedup, run vs run`, `Efficiency`, `Precompute speedup` and `Engine checksum` (`match` or `MISMATCH`).
- For congestion or deadline routing, `Run parallel` is disabled and the page says `Operational parallel mode is unavailable for … routing`.
- **Worker timeline: operational precompute**: the replay banner `Replay of a measured run, not a live view.`, play/pause and speed, one lane per worker thread plus a `stages` row (check-in registration, then flight grouping, then route + service times). No lane for the event loop.
- Four facility cards: `Check-in` (`Registration of arrivals` Parallel, `Check-in queue` Sequential), `Flight assignment` (`Flight grouping` Parallel), `Screening` (`Screening queue` Sequential), `Sorting` (`Sorter queues` Sequential).
- `Network (whole run)` graph with each facility's worst status, and the note `No worker is assigned to a facility: the queues run in the sequential event loop.`
- Card `What runs in parallel, and why`.

### What to click

1. Leave Normal / dijkstra / fcfs. Set `Bags` and `Workers`.
2. `Run sequential`, wait for `Sequential run: done`.
3. `Run parallel`, wait for `Parallel run: done`.
4. Point at `Engine checksum: match`. Press `Play replay` on the worker timeline.
5. Switch `Routing` to congestion to show the unavailable message.

### What to say

> The simulation's event loop is sequential, and it stays sequential here. What this page parallelises is the work that does not depend on the order of events. Each bag's arrival time, its loading area and, for the fixed routing strategies, its whole route and its service time at every facility can be worked out before the loop starts.
>
> We run the same configuration twice. Here is the sequential run, and here is the parallel one. The engine checksum matches, so the result is identical. That works because the engine's random numbers come from a hash of the seed, the bag and the stage, not from one shared stream.
>
> The precompute itself scales well. On the M1 at 250 thousand bags it went from 150 milliseconds to 25 on eight workers. But the whole run is only about 1.3 times faster, because the event loop is still about 500 milliseconds. That is Amdahl's law again.
>
> The cards say it plainly: check-in registration and flight grouping are parallel. The screening and sorting queues are sequential.

### What to point at

- `Engine checksum` `match`, and the checksum under it.
- `Precompute speedup` (same run, alternating repetitions) against `Speedup, run vs run` (two separate runs, includes noise).
- The `Sequential` badges on Screening and Sorting.
- The replay banner, and that there is no event-loop lane.

### Key term

**Per-bag precompute**: computing values that depend only on one bag (arrival time, loading area, static route and service times) before the event loop, in parallel, so the loop only reads them.

### Why it matters

It shows the one honest way to bring parallelism inside a single simulation without changing its answer, and it shows the limit of that.

### What the evaluator might misread

- *"Screening and sorting are parallel now."* No. Their queues are in the sequential event loop. Only the per-bag values they read were precomputed.
- *"The timeline is live."* It is a replay of recorded precompute task times.
- *"Congestion routing is parallel too."* Congestion and deadline routing, and any routing in ConveyorFailure, precompute only check-in registration and flight grouping, because their routes depend on live queues or time. The page disables `Run parallel` for congestion and deadline.
- *"1.3x is the simulation speedup."* It is the precompute plus loop against the plain loop, stats only, on the M1; the app's run-vs-run figure also includes recording bag histories, which shrinks it.

### Transition

> So inside one run the ceiling is low. The Stage Explorer shows stage by stage where parallel work exists at all.

---

## 2.13 Stage Explorer (`/operations/stages`), about 2 minutes

### What is on screen

- Heading `Stage Explorer`, subtitle `The seven baggage stages. The simulation itself is sequential; the parallel work listed here runs beside it, on whole batches.`
- Run selector bar.
- Seven stage buttons, each with `Has parallel work` or `Not implemented`.
- A card: stage name, `Engine model:` with `Implemented` (Modelled), `Simplified` or `Not modelled`, and `Not in the engine: …`.
- **`Parallel Processing & Computational Contribution`** card with three questions: `What operation happens?`, `Can it be parallelised?`, `What improvement was measured?`. For stages with work: `In the selected simulation run’s pipeline` (a phase card), `Newest telemetry run of each backend on this machine` (table `Backend | Bags | Threads | Sequential | This backend | Speedup | Checksum | Source` with `open` links), and for Transfer, `Saved results from earlier runs` (`Static`): `Includes AVX2, CUDA (naive, warp, PTX) and MPI. Each table names its machine and size. Do not compare them with the measured rows above.`

### The seven stages (text from `config/stages.ts`)

| # | Stage | Engine model | Button | What to say |
|---|---|---|---|---|
| 1 | Check-in and generation | Simplified | Has parallel work | `Bags are generated with their arrival times, then queue at one pooled check-in node (40 servers). Transfer bags also enter here.` Generation is parallel: `Each flight has its own random stream, so bags of different flights can be made at once.` The check-in queue is not. Measured work: `Parallel dataset generation (Rayon). This is work done before the check-in queue, not the queue itself.` |
| 2 | Identification | Simplified | Not implemented | `A queued service stage (4 servers).` Missing: `Tag reads, read failures and manual coding.` `Validating many tags could be split across threads in principle, but there is no validation step to parallelise or measure.` |
| 3 | Screening | Implemented (Modelled) | Not implemented | `Two screening lines with a route choice; a share of bags is held for inspection on the same server.` `Queue coordination: no. … No screening batch kernel is implemented.` |
| 4 | Transportation | Simplified | Not implemented | `Fixed travel time along each link; an outage on a link changes routing.` Missing: `Link capacity, jams and random failures. With no other live route, a bag uses the failed link.` `Routing depends on the network state at the moment of each event, so it stays sequential.` |
| 5 | Sorting | Implemented (Modelled) | Has parallel work | `Three sorter queues, with four routing strategies and four queue policies.` Parallel: `Aggregating recorded node workloads: yes, as a parallel reduction after the run.` Scope: `It is one pass over the bag histories of all nodes, sorters included; the sorters are not timed separately.` |
| 6 | Transfer | Not modelled | Has parallel work | `There is no transfer stage in the engine. Transfer bags differ only in arrival window, deadline and priority.` The kernel: `Each bag is classified on its own, so it suits threads, vector lanes and GPUs.` Scope: `Batch deadline-risk classification over the whole bag table, not only transfer bags. A fixed-formula estimate that adds time for transfer bags; the simulation does not use its output.` |
| 7 | Loading | Simplified | Has parallel work | `Three loading areas; a bag is delayed if loading finishes after its deadline.` Scope: `… the aggregation counts bags loaded on time and delayed, along with the node figures. It is the same work as under Sorting, not a second speedup.` |

### What to click

Click each stage button in order. For 1, 5 and 6, scroll to the tables. For 6, show the saved results tables.

### What to say

> This page is the most honest one in the app. For each of the seven baggage stages it answers three questions: what happens, can it be parallelised, and what did we measure.
>
> Check-in: generating the bags is parallel and measured. The check-in queue itself is sequential.
>
> Identification, screening and transportation say "Not implemented" in plain words. There is no parallel work for them, so there is no number. We did not invent one.
>
> Sorting and loading share one parallel step, the aggregation after the run. The page says it is the same work under both, not a second speedup.
>
> Transfer is not modelled as a stage at all. But the batch risk kernel lives here, because it adds time for transfer bags. This is where every backend is compared, live from this machine, and below them the saved results from Kaggle and MPI, labelled Static.

### What to point at

- `Engine model` badges: Modelled, Simplified, Not modelled.
- The `Checksum` column: `match` on every row.
- The `Not implemented` buttons.

### Key term

**Parallel reduction**: combining many partial results (for example per-chunk counts) into one, which can itself be done in parallel.

### Why it matters

It stops anyone from thinking every stage is parallel.

### What the evaluator might misread

- *"Transfer is simulated."* Not modelled.
- *"Sorting and loading each have their own speedup."* Same aggregation.

### Transition

> We have seen that experiments are where parallelism pays. The Parallel Sweeps page lets us configure that grid directly.

---

## 2.14 Parallel Sweeps (`/experiments/sweeps`), about 2 minutes

### What is on screen

- Heading `Parallel Sweeps`, subtitle `Independent experiments do not depend on each other, so many run at once. The same grid is run on 1 thread first, then on each thread count you list.`
- **`Configure the sweep`**: tick lists `Scenarios` (6), `Routing strategies` (4), `Queue policies` (4); fields `Capacity values, % (comma-separated)` (default `100`), `Thread counts (1 always runs first)` (default `2, 4, 8` on an 8-core machine), `Bags requested per simulation` (default `100000`), `Server multiplier` (default `1`). A size line: `This form: 96 experiments (limit 384) × 4 passes, 1-thread baseline included · 38,400,000 requested bags in all (limit 500,000,000).` Button `Run sweep`. Validation messages appear in red, for example `Sweep too large: …`.
- `Saved sweeps` drop-down.
- Result: a `Real` banner `96 independent simulations of N generated bags, each one sequential inside · <id>`.
- **`Results by thread count`** (`Real`): `1-thread wall time`, `Shortest wall time (8 threads)`, `Total time saved` (`1-thread wall time minus the 8-thread wall time, for the same grid.`). Table `Threads | Wall time | Speedup | Efficiency | Time saved | Completed | Failed | 1-thread check | Source`; the check column reads `baseline`, `identical` or `differs (n)`. A possible warning `Efficiency above 100% at …`. The consistency box: `All N compared runs gave the 1-thread results.` Definitions line, quoting the API: `Wall time: from starting the grid on the pool until the last experiment ends. Dataset generation, scenario preparation and one warm-up simulation happen before. Efficiency: 100 * speedup / threads. Cores need not be equal in speed. The check: every engine output, including the checksum over all bag finish times, equals the one-thread pass.`
- **`Repeated sweeps and timing noise`**: with one sweep, `-- One saved sweep with these settings. Each thread count was timed once, so run the same sweep again to see how much the times move.` With two or more: either `Noisy timings. Repeats of this sweep differ by more than 10% at …` or `Repeats of this sweep are within 10% of each other at every thread count.`, then a table `Threads | Sweeps | Shortest | Longest | Spread | Source` and `Spread = (longest − shortest) ÷ shortest. The 10% line is a display rule of this page.` Button `Run these settings again`.
- **`Experiments filling the worker lanes`** with buttons `1 thread`, `2 threads`, `4 threads`, `8 threads`: replay controls (`Elapsed time in the pass`), counters `Completed at the playhead`, `Running at the playhead`, `Failed at the playhead`, `Not started`, the clickable experiment grid, and `Select a cell to see that experiment’s result.` A selected cell shows `Experiment i: <scenario · routing · policy · capacity>` with `Bags simulated`, `Delayed bags`, `Mean time in system`, `95th percentile`, `Longest queue`, `Engine checksum` (all `Real`). Then `Worker lanes on one clock, each pass counted from its own start.` with lanes for the chosen pass and the 1-thread baseline.
- **`Per-thread distribution, 8-thread pass`**: `Worker | Experiments | Time in experiments | Share of pass wall time | Source`.

### What to click

1. Do not start a full sweep live unless you have time. With 2, 4 and 8 threads it is four passes, longer than the demo's two. Open the saved sweep from the drop-down.
2. Point at the size line in the form.
3. Point at the results table and the consistency box.
4. In the replay, press `8 threads`, then `Play replay`. Then click a filled cell.
5. Scroll to the per-thread table.

### What to say

> This is the sweep page in full. I choose scenarios, routings and queue policies. Six by four by four is 96 experiments. The form tells me exactly how much work that is before I press Run, and it enforces limits.
>
> The results table compares each thread count with one thread on the same grid, in the same job. Speedup is one-thread wall time divided by this wall time. Efficiency is speedup divided by threads. The check column says every experiment gave identical results, down to a checksum over every bag's finish time.
>
> Below, repeated sweeps. Each pass is timed once, so a single sweep tells you nothing about noise. Run it again and this table shows the spread. If the spread is over 10 percent, the page warns me.
>
> And the replay: each lane is one worker thread; each block is one simulation. On one thread they run end to end. On eight threads eight lanes fill at once. Click a cell and you see that simulation's own results.
>
> The per-thread table shows the load balance: how many experiments each worker ran and how much of the pass it was busy.

### What to point at

- 8-thread speedup 4.51x–5.20x, efficiency 56.3%–65.0% over three sweeps of the demo's two-pass setup (`r6_api.txt`). The four-pass page default (2, 4, 8 threads) was not saved in a result file; do not quote 2- and 4-thread values from memory.
- Share of pass wall time below 100% for some workers: idle at the end.

### Key term

**Parallel efficiency**: speedup divided by the number of threads; 100% would mean every thread was fully useful.

### Why it matters

It is the main system-level result, and it shows correctness and noise handling side by side.

### What the evaluator might misread

- *"Efficiency over 100% is great."* The page warns it is a single timing and should not be taken literally.
- *"Different operational results across experiments are noise."* Operational results are deterministic; only timings vary.

### Transition

> The sweep parallelises whole simulations. The Performance Lab goes the other way: one small kernel, every backend, measured carefully.

---

## 2.15 Performance Lab (`/performance`), about 1.5 minutes

### What is on screen

- Heading `Performance Lab`, subtitle `The batch deadline-risk kernel, timed on this machine. It is an analysis of the bag table; the simulation does not use its output.`
- **`Benchmark the deadline-risk kernel`**: `Backends` tick boxes (unavailable ones greyed, with the reason on hover), `Not selectable` (`Unavailable`) list with reasons, fields `Bags requested` (default `1000000`), `Thread counts for Rayon backends` (default `1, 2, 4, 8`), `Timed repetitions` (`10`), `Warm-up repetitions` (`1`), button `Run benchmark`.
- `Saved benchmark runs` drop-down.
- Result: `Real` banner `live benchmark run · <id>`.
- Summary card: `Workload`, `Scalar baseline, median`, `Shortest median time` (backend), `Largest speedup vs scalar`, `Peak throughput` (`million bags per second`).
- **`What this run shows`** (`Measured`): sentences built from the numbers, for example `At 1,000,000 bags, with 10 timed repetitions after 1 warm-up, rayon-neon × 8 had the shortest median time (…). This holds for this run only.`, `Slower than scalar here: …`, `metal: the kernel alone was …x against scalar, so the loss is in the time outside the kernel (median copy in …, launch and wait …, copy out …).`, `Repetitions varied by more than 20% of the median for …`.
- Charts (bar lists): `Execution time` (`Median per repetition. Shorter is better.`), `Throughput` (`Million bags per second. Longer is better.`), `Speedup vs scalar` (`Median scalar time ÷ median backend time, same data.`), `Parallel efficiency` (`Thread backends only; the others have no thread count. 100 * (median one-thread time of efficiency_baseline / median backend time) / threads; thread backends only.`), `Scalability: speedup vs scalar by thread count` (one group per Rayon backend; `OpenMP always runs at its own thread count.`).
- **`GPU phases, medians`**: `Backend | Copy in | Kernel | Launch and wait | Copy out | Kernel-only speedup | Source`, and a device note.
- **`Memory and GPU utilisation`**: `Memory use` = `--` (`Not collected: the API returns no memory measurement for any backend.`), `GPU utilisation` = `--` (`Not collected: …`), `Bag columns the kernel reads and writes` (`Simplified`, `Computed by the API from the workload size. It is not a memory measurement.`).
- **`All measured rows`**: `Backend × threads | Median | Mean | Std | Min | Max | Speedup | Efficiency | Output vs scalar | Source`, with `(added)` rows. Footer: `Speedup: median scalar time / median backend time, same dataset; the scalar loop may be auto-vectorised by the compiler. Time: end-to-end time of one repetition; GPU backends include both copies.`
- Link `Compare the backends of this run`.
- **`Saved results from earlier runs`** (`Static`): `Measured earlier, not by this server, on N different machine descriptions. Each table names its machine, size and file. Compare rows inside one table only: sizes and statistics differ from the live runs.` One table per machine and file (kernel tables: `Row in file | Time | Speedup vs scalar in file | Copy in | Copy out | Source`; MPI tables: `Mode | Ranks | Load | Compute | Reduce | Compute speedup | End-to-end speedup | Source`).

### What to click

1. Open a saved benchmark from the drop-down (running one live at 1M bags with all backends is fine but adds a wait).
2. Read the `What this run shows` card aloud.
3. Point at `Speedup vs scalar`, then `Scalability`, then `GPU phases`.
4. Scroll to `Memory and GPU utilisation`, then `Saved results`.

### What to say

> The Performance Lab benchmarks the risk kernel on every backend this machine has. Each backend runs ten timed repetitions after a warm-up, and we report the median, mean, standard deviation, minimum and maximum. Every repetition's output is checked against scalar.
>
> This card is written by the app from the numbers of this run only. It names the fastest backend, any backend slower than scalar, and where repetitions varied a lot.
>
> The scalability chart shows speedup as threads grow. On the M1, Rayon with NEON stops improving beyond four threads. We did not measure the cause.
>
> The GPU table splits the Metal time into copy in, kernel, launch and copy out. The kernel alone is fast; the copies are a large share. That is why a GPU does not always win.
>
> Memory and GPU utilisation say "not collected". We do not measure them, so we show two dashes instead of a guess.
>
> At the bottom are saved results from earlier runs on other machines, including the Kaggle Xeon with a T4 GPU, labelled Static. Compare rows only inside one table.

### What to point at (command-line M1 figures, `r6_kernels_10M.txt`, 10M bags, best of 10)

- Scalar 14.07–14.11 ms. NEON 6.71 ms, 2.10x. OpenMP 8 threads 4.28–4.32 ms, 3.26x–3.30x.
- Rayon 4 + NEON 1.82–1.99 ms, 7.08x–7.72x. Rayon 8 + NEON 1.95–1.99 ms, 7.08x–7.25x (no better than 4 threads).
- Metal kernel only 3.45 ms (4.07x–4.10x); with copies 7.35–7.46 ms (1.89x–1.91x); copy in about 3 ms.
- The live lab default is 1,000,000 bags and reports medians, so its numbers will differ from these 10M best-of-10 figures.

### Key term

**Warm-up**: an untimed run before the timed ones, so first-run costs (loading code and data into caches, starting threads) do not distort the measurement.

### Why it matters

It shows careful benchmarking: medians, spread, output checks, and honest gaps.

### What the evaluator might misread

- *"Kaggle CUDA 31.65x beats the M1."* Different machines and sizes; never on one axis.
- *"Efficiency for NEON."* Not shown; vector lanes are not threads.

### Transition

> Backend Comparison shows the same benchmark run as one card per backend.

---

## 2.16 Backend Comparison (`/performance/backends`), about 45 seconds

### What is on screen

- Heading `Backend Comparison`, subtitle `Backends of this machine on the same workload, from one run. Charts and new runs are in the Performance Lab.`
- `Saved benchmark runs` drop-down.
- `Real` banner: `one benchmark run, N bags, R timed repetitions after W warm-up · <id>`.
- One card per available backend (`Implemented`): a line such as `8 threads, the shortest of 4 thread counts`, `GPU`, or `Not part of this run.`; figures `Median time`, `Speedup vs scalar`, `Throughput`, `Efficiency`; and `Output identical to scalar`.
- `GPU phases, medians` and `Memory and GPU utilisation` (as in the lab).
- `Not available on this machine` (`Unavailable`) with reasons.
- `Saved results from earlier runs` (`Static`).

### What to click

Pick the same benchmark run as in the lab. Scroll once.

### What to say

> Same run, one card per backend, so each backend is easy to read on its own. Rayon backends show their best thread count. Every card says the output was identical to scalar. Missing backends are listed with their reason, and saved results from other machines stay in separate tables.

### Key term

**Backend**: one implementation of the same kernel on a particular kind of hardware or parallel model.

### Why it matters

It is the quick "which backend wins here, and is it correct" view.

### What the evaluator might misread

*"Efficiency dashes are missing data."* Efficiency only exists for thread backends.

### Transition

> So far I have used preset runs. Scenario Studio lets anyone configure one simulation.

---

## 2.17 Scenario Studio (`/experiments/scenarios`), about 45 seconds

### What is on screen

- Heading `Scenario Studio`, subtitle `Run one synthetic day under a scenario. To run many combinations at once, use Parallel Sweeps.`
- **`Configure a run`**:
  - `Scenario and strategy`: `Scenario` (with a note under it from `config/ops.ts`), `Routing strategy`, `Queue policy`.
  - `Load and infrastructure`: `Bags requested` (`1,000 to 1,000,000. Servers do not grow with this.`), `Capacity %` (`20 to 300. Scales servers at every facility (at least one each).`), `Server multiplier` (`1 to 20. Multiplies the servers at every facility.`).
  - `Parallel pipeline phases`: `Threads` (`… For generation and aggregation, and thread backends.`), `Deadline-risk classification backend` (unavailable ones disabled), and `Threads and backend never change the simulation result: the simulation itself is sequential, and the classification is a separate batch analysis.`
  - Button `Run simulation`.
- While running: `Your run is in progress` with the progress bar.
- **`Your run`** (`Real`): the settings line, a saturation banner if over 50% delayed, `Bags simulated`, `Loaded on time`, `Delayed`, `Congested facilities` (`Simplified`, `BagFlow display rule`), then `Look at this run` with links `Airport Network`, `Baggage Tracker`, `Congestion Analysis`, `Stage Explorer`.

Scenario notes (exact text):

| Scenario | Note shown |
|---|---|
| Normal | `The generated day as it is.` |
| PeakSurge | `Adds extra bags: about half as many again as arrive 17:00–18:00, each up to 10 minutes after its original.` |
| ConveyorFailure | `The link from Screening A to Sorter 1 is down 17:00–18:30.` |
| ScreeningDelay | `Screening A runs at 40% of its capacity 17:00–18:30.` |
| ConnectingRush | `About 60% of transfer bags arriving 17:00–18:30 become tight connections with at most 30 minutes to their deadline.` |
| SorterOverload | `Sends about 60% of the bags arriving 17:00–19:00 to Loading area 1. Sorter queues follow from routing toward it.` |

### What to click

Choose `SorterOverload`, `ecmp`, `fcfs`, leave the rest, press `Run simulation`. When done, point at `Delayed`.

### What to say

> Here I can run one day under any scenario. For example, SorterOverload sends most evening bags to one loading area, so the sorters in front of it back up. This form also shows the parallel settings, threads and the classification backend, and it says plainly that they never change the simulation result.

### What to point at

SorterOverload / ecmp / fcfs / 100%: `11.438%` delayed, 28,606 bags, checksum `144494908f029748` (`r6_api.txt`). Deterministic.

### Key term

**Server multiplier**: a factor that multiplies the number of servers at every facility; servers do not grow with bag count on their own.

### Why it matters

It shows the model is configurable, and that more bags at the same servers means overload.

### What the evaluator might misread

*"More bags is just a bigger test."* With fixed servers it is more load; the saturation banner explains this.

### Transition

> Every run I have done is saved. Simulation History lets me reopen or compare them.

---

## 2.18 Simulation History (`/experiments/history`), about 1 minute

### What is on screen

- Heading `Simulation History`, subtitle `Saved runs, newest first. Settings and summaries are saved on disk; bag histories and time-series stay for the 3 newest simulations only. There is no export or delete: the API supports neither.`
- **`Runs`** card with `Show` filter: `Simulations and sweeps`, `Simulations`, `Sweeps`, `Parallel runs`, `Benchmarks`, `Everything`.
- Hint line: `Tick two finished simulations, or two finished sweeps, to compare them.` → `One simulation selected. Tick one more of the same kind.` → `Comparing the two ticked runs, shown above.` with `Clear`.
- Table `Compare | Run | Settings | Status | Result | Open`. Status may add `detailed data available` or `detailed data expired`. `Open` gives the four page links, `Open sweep`, `Open in the studio`, `Open benchmark`, or `Run these settings again`.
- `Show more (N older)`.
- **Comparison card** `Comparison of two simulations` (or sweeps), `A: <id> B: <id>`, a settings table `Setting | Run A | Run B | B − A` (`same` / `differs`), a results table with `Bags simulated`, `Loaded on time`, `Delayed bags`, `Delayed %`, `Average queue wait`, `Longest queue`, `Highest run utilisation`, `Congested facilities (display rule)`, `Last event`, `Dataset checksum`, `Engine checksum`, and `Longest queue by facility`. For sweeps: `Identical settings: differences in the times below are run-to-run variation.` or `Different settings: wall times are for different work.`

### What to click

1. Tick two baseline runs with identical settings. Show that `Engine checksum` reads `same`.
2. Clear, then tick two sweeps with identical settings. Show the wall-time differences.

### What to say

> Every job is saved: settings and a summary. Here I compare two baseline runs made at different times. Every result is the same, down to the engine checksum. The simulation is deterministic.
>
> Now two identical sweeps. The settings are the same, so the page tells me any difference in wall time is run-to-run variation. That is exactly the noise I quoted as a range.
>
> There is no delete or export button, because the API does not support them.

### Key term

**Deterministic**: the same inputs always give exactly the same outputs; here, the same seed and settings give the same checksum.

### Why it matters

It proves reproducibility of results and makes the noise in timings visible.

### What the evaluator might misread

*"Detailed data expired means data loss."* Only the 3 newest simulations keep bag histories in memory; the summary stays, and `Run these settings again` recomputes it.

### Closing line for the full walkthrough

> To sum up: we parallelised the workload and verified every parallel answer against the sequential one; we kept the simulation sequential because correctness needs it; and we parallelised the experiments, which is where we got four and a half to five times faster on this laptop.

---

# PART 3: 7-minute short version

Use this when time is short. Prepare all Guided Demo runs in advance (Part 9).

| Time | Screen | What to show | Key line |
|---|---|---|---|
| 0:00–0:30 | Any | The 30-second pitch (1.2) | "Simulation stays sequential; we parallelise around it and across experiments." |
| 0:30–2:00 | Main Dashboard | Engine status (available and unavailable with reasons). `Run baseline` (or point at the latest run). `Delayed bags` 9,245 = 3.697%. The four phase cards. | "Generation and aggregation are about five times faster; the simulation is about 0.7 s and sequential." |
| 2:00–3:00 | Main Dashboard | Amdahl card, then the sweep card. | "p is about 10%, so one run can never beat about 1.11x. A sweep gave 4.5x to 5.2x." |
| 3:00–4:30 | Guided Demo | Step 2 (thread bars, timeline, checksum). Step 5 (grid, `All 96 compared runs gave the 1-thread results.`). Step 6 (Amdahl box, speedup table footer). | "Every parallel result matched the sequential one." |
| 4:30–5:30 | Airport Network | Baseline run, `Play` at 600 sim s per s, click Screening A. | "Screening is the bottleneck. Colours are a display rule; dots are a sample." |
| 5:30–6:15 | Parallel Sweeps | Saved sweep, results table, noise card, replay at 8 threads. | "Each pass is timed once, so we repeat sweeps and quote a range." |
| 6:15–7:00 | Performance Lab | `What this run shows`, Speedup chart, GPU phases, Memory card. | "The GPU kernel is fast but copies cost; memory is not measured, so it shows dashes." |

Closing line:

> Parallelise the workload, preserve correctness, parallelise experimentation. The last one is where the real gain is.

---

# PART 4: Concepts glossary

Each entry: a plain definition, an everyday analogy, and where it appears in BagFlow.

### Per-bag precompute (operational parallel mode)

Before `engine2`'s event loop, the work that depends only on one bag runs on a Rayon pool: check-in registration, flight grouping, and for dijkstra and ecmp without an edge outage, the bag's route and service times. The bags are split into contiguous ranges, at least 4 tasks per worker. The event loop, queues, server allocation and event order stay sequential. The result is identical because the engine's random draws are a stateless hash of (seed, bag, stage).

### Coordinator pattern

One thread (here, the sequential event loop) keeps all shared state and decides the order of everything; workers only compute independent values from read-only inputs and hand them back. Workers never change shared state, so the coordinator's result does not depend on how the work was split.

### Discrete-event simulation (DES)
- **Definition.** A simulation that keeps a list of future events ("bag 17 arrives at screening at 18:03:12", "server 4 finishes at 18:03:14") and always processes the earliest one next. Time jumps from event to event.
- **Analogy.** A diary of appointments: you do not watch the clock tick, you turn to the next appointment.
- **In BagFlow.** `engine2` in `crates/bagflow-core`. Phase 3 on the Dashboard (`Discrete-event simulation`, `Sequential`). Guided Demo step 4.

### Why the simulation stays sequential
- **Definition.** Each event can change the state that later events see: who is first in a queue, which server is free, which route is least busy. To process event 2 you need the result of event 1. The API's own reason text: `events must be processed in time order: each one can change the queues that later events see`.
- **Analogy.** A single checkout queue: the cashier cannot serve customer 10 before knowing when customers 1 to 9 are done.
- **In BagFlow.** The simulation phase card says `No parallel implementation, so no speedup.` Stage Explorer repeats `Inside the simulation this stage runs sequentially: events must be processed in time order.`

### Rayon and work stealing
- **Definition.** Rayon is a Rust library that runs loops over data on a pool of threads. It splits work into tasks. Each thread has its own queue; a thread that runs out steals tasks from another thread's queue.
- **Analogy.** Friends packing boxes from a shared pile: whoever finishes early grabs more, so nobody stands idle while boxes remain.
- **In BagFlow.** Dataset generation (`Parallel: Rayon`), aggregation (`Parallel reduction: rayon`), the `rayon-*` kernel backends, and the sweep thread pool. The Workload step says `Rayon threads take more chunks when they run out (work stealing), so faster cores can end up with more bags.`

### OpenMP
- **Definition.** A widely used standard for parallel loops in C and C++. A compiler directive splits a loop across threads.
- **Analogy.** A manager who hands each worker a fixed, equal block of the job at the start.
- **In BagFlow.** The `openmp` kernel backend, written in C++ and built only if `libomp` is installed. View B describes it as `OpenMP threads; schedule(static) gives each thread a contiguous block of chunks.` In benchmarks it uses OpenMP's own thread count (`OpenMP always runs at its own thread count.`).

### SIMD, NEON and AVX2
- **Definition.** SIMD (single instruction, multiple data) means one CPU instruction processes several values at once, held side by side in a wide register. NEON is ARM's SIMD (Apple M1). AVX2 is Intel/AMD's.
- **Analogy.** A stamp that prints four labels in one press, instead of four presses.
- **In BagFlow.** `neon` and `avx2` backends, and `rayon-neon`/`rayon-avx2` (threads plus vectors). In the app, NEON has 4 lanes of 32-bit integers (128-bit register) and AVX2 8 lanes (256-bit), with 8 bags per loop iteration. The app says `Lanes are not workers.` and shows no efficiency for SIMD.

### Metal and CUDA: copy in, kernel, copy out
- **Definition.** Metal (Apple) and CUDA (NVIDIA) let you run a kernel on the GPU, which has thousands of small cores. A GPU run has three costs: copy the data in, run the kernel, copy the results out. There is also launch and wait overhead.
- **Analogy.** Sending laundry to a very fast industrial laundry across town: the washing is quick, but the drive there and back can take longer than washing a few shirts at home.
- **In BagFlow.** `metal` live on the M1. `cuda-naive`, `cuda-warp`, `cuda-ptx` are saved Kaggle T4 results only. GPU phase bars: `Copy in`, `Kernel (device time)`, `Launch and wait beyond the kernel`, `Copy out`. On the M1, Metal "copy" is a memcpy into shared memory (`r6_kernels_10M.txt`: `shared buffers: copy in/out is a memcpy, as in a straight port`).

### MPI
- **Definition.** Message Passing Interface: a standard for running separate processes (ranks), possibly on separate computers, that exchange data by messages.
- **Analogy.** Several offices, each with its own filing cabinet, phoning results to head office.
- **In BagFlow.** `kernels/mpi/risk_mpi.cpp`, run from the command line with `scripts/run_mpi.sh`. Two modes: `read` (each rank loads its own slice of the file) and `scatter` (rank 0 loads everything and sends slices). Not live in the app: `live MPI runs are not wired into the runner; see the static results`.

### Chunks and partitioning
- **Definition.** Cutting the input into pieces (chunks) that can be processed independently, then giving chunks to workers.
- **Analogy.** Cutting a pizza into slices so several people can eat at once.
- **In BagFlow.** Generation chunks are groups of flights (64 in the Guided Demo); classify and aggregate chunks are groups of bags. View A step 2: `Partition into chunks`.

### Checksum verification
- **Definition.** A checksum is a short fingerprint computed from a whole result. If two results have the same checksum, they are (for practical purposes) identical.
- **Analogy.** Comparing two long documents by their page count and a hash code instead of reading both.
- **In BagFlow.** Every parallel run: `Checksum match: every timed repetition on both sides gave the sequential result`. Sweeps: `every engine output, including the checksum over all bag finish times, equals the one-thread pass`. Benchmarks: `Output vs scalar` = `identical`.

### Speedup
- **Definition.** Baseline time divided by new time. 5x means five times faster. Always name the baseline.
- **Analogy.** If walking to work takes 50 minutes and cycling 10, cycling is a 5x speedup over walking.
- **In BagFlow.** Phase cards (`speedup in this phase`), `Speedup (sequential ÷ selected)`, sweep `Speedup vs 1 thread`, benchmarks `Speedup vs scalar`.

### Parallel efficiency
- **Definition.** Speedup divided by the number of threads, as a percentage. 100% would mean perfect use of every thread.
- **Analogy.** If 8 painters paint a house 5 times faster than one painter, each painter is 62.5% as productive as working alone.
- **In BagFlow.** Sweeps (`100 * speedup / threads`), generation in the Guided Demo, thread backends in the Performance Lab. Not shown for SIMD or GPU.

### Amdahl's law
- **Definition.** If a fraction p of the work can be parallelised and the rest cannot, the speedup can never exceed 1 / (1 − p), however many cores you add.
- **Analogy.** A trip that is 10% packing and 90% a fixed-length train ride: packing faster saves at most 10% of the time.
- **In BagFlow.** Dashboard card `Amdahl’s law: why the whole pipeline gains so little`; Guided Demo Results. p ≈ 9.8–9.9%, ceiling ≈ 1.11x.

### Throughput
- **Definition.** Work done per unit of time; here, bags per second.
- **Analogy.** Cars per hour through a toll gate.
- **In BagFlow.** `Throughput at the median` (M bags/s), Performance Lab `Throughput` chart, Guided Demo `Throughput` card.

### Baseline vs parallel
- **Definition.** The baseline is the reference version (one thread, or scalar), run on the same input in the same job. The parallel version is what we compare against it.
- **Analogy.** Timing yourself with and without a bicycle on the same route on the same day.
- **In BagFlow.** `Baseline: sequential, 1 thread`, `Baseline: scalar, 1 thread`, the 1-thread sweep pass, `Scalar baseline, median`.

### Median and repetitions
- **Definition.** A repetition is one timed execution. The median is the middle value when repetitions are sorted; one freak value does not move it much.
- **Analogy.** The middle runner's time in a race is not affected by one runner who tripped.
- **In BagFlow.** `Median of N repetitions each`, `Each wall time is the median repetition (the lower middle one for an even count).` The pipeline uses 3 repetitions for generation, 9 for classification, 5 for aggregation, and 1 for the simulation (`crates/bagflow-api/src/pipeline.rs`).

### Warm-up
- **Definition.** An untimed run before the timed ones, so one-off costs (caches, page faults, thread start-up, GPU initialisation) do not count.
- **Analogy.** Warming up a car engine on a cold morning before timing a drive.
- **In BagFlow.** `after one warm-up each` in the studio; `Warm-up repetitions` in the Performance Lab; one warm-up simulation before each sweep.

### Queueing, utilisation and bottleneck
- **Definition.** Queueing: bags wait when all servers are busy. Utilisation: the share of servers busy. Bottleneck: the stage with the least spare capacity, which limits the whole flow.
- **Analogy.** The slowest checkout lane decides how long the line is.
- **In BagFlow.** `Queue length`, `Utilisation (run)`, `Bottleneck ranking` on the Congestion page. Screening is the bottleneck in the baseline.

### Routing strategies (from `engine2.rs`)
- **Dijkstra.** Always the shortest free-flow path to the bag's loading area (service times plus travel, ignoring queues). Analogy: always taking the route a map app shows with no traffic data. Effect: one sorter can get no bags at all (`r6_compare_100.txt`).
- **ECMP (equal-cost multipath).** Among next hops whose free-flow cost ties for the minimum, spread bags by bag id. Analogy: alternating between two equally short roads.
- **Congestion.** Choose the next hop with the lowest free-flow cost plus an estimated queue wait from the current queue and busy servers. Analogy: a map app with live traffic.
- **Deadline.** If a bag has under 20 minutes of slack, route it like congestion; otherwise like ECMP. Analogy: only urgent parcels take the live-traffic route.
- **Where.** `Routing strategy` in Scenario Studio, sweeps, Guided Demo (congestion at 70%, dijkstra at 100%).

### Queue policies (from `engine2.rs`)
- **FCFS (first come, first served).** Serve in arrival order.
- **Priority.** Tight connections first, then priority bags, then standard.
- **EDF (earliest deadline first).** Serve the bag whose deadline is soonest.
- **SPT (shortest processing time).** Serve the bag with the shortest service time first.
- **Analogy.** A clinic that sees patients in arrival order, by severity, by appointment time, or quickest case first.
- **Where.** `Queue policy` in Scenario Studio and sweeps. At full capacity EDF gives 0.00% delayed for every routing; at 70% capacity it no longer helps (Dijkstra 79.59% with EDF vs 77.42% with FCFS) (README; `r6_compare_*.txt`).

### The six scenarios
Exact app text is in section 2.17. In short: `Normal` (the day as generated), `PeakSurge` (extra evening bags), `ConveyorFailure` (link Screening A → Sorter 1 down 17:00–18:30), `ScreeningDelay` (Screening A at 40% capacity 17:00–18:30), `ConnectingRush` (more tight connections), `SorterOverload` (about 60% of evening bags sent to Loading area 1). Results: screening delay and peak surge hurt most (13.68–20.62% delayed with FCFS or EDF); conveyor failure barely changes the delayed rate; sorter overload shows the largest routing effect (congestion + EDF 0.00%, Dijkstra + EDF 8.51%) (README; `r6_scenarios.txt`).

### Server multiplier
- **Definition.** Multiplies the number of servers at every facility. Servers do not grow with the bag count; capacity % also scales them.
- **Analogy.** Opening twice as many checkout lanes in every shop.
- **In BagFlow.** Scenario Studio and sweeps (1 to 20). The saturation banner tells you to raise it.

### Saturation
- **Definition.** A run in which bags arrive faster than servers can serve them, so queues keep growing and most bags are late.
- **Analogy.** A motorway at rush hour where more cars join than leave.
- **In BagFlow.** The `Saturated run:` banner appears when more than 50% of bags are delayed. Example: the 70% capacity run at 53.752%. The README notes that with server multiplier 1, 1M-bag runs go to 95–99% delayed (AUDIT §12, not in a result file).

---

# PART 5: How the pieces connect

```
                  ONE SIMULATION JOB  (POST /api/simulations, e.g. "Run baseline")
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │                                                                                  │
 │  1. GENERATE             PARALLEL (Rayon, chunks of flights)                     │
 │     seeded flights + bags  ── timed vs 1-thread generator, output must be equal  │
 │            │                                                                     │
 │            │ bag table (arrival, deadline, priority, flags, flight, weight)      │
 │            ├───────────────────────────────┐                                     │
 │            ▼                               ▼                                     │
 │  2. CLASSIFY             PARALLEL         3. SIMULATE           SEQUENTIAL       │
 │     deadline-risk kernel                     engine2, events in time order       │
 │     (scalar vs rayon-neon/                   routing + queue policy + scenario   │
 │      openmp/metal/...)                       records bag histories and samples   │
 │            │                                         │                           │
 │            ▼                                         │ bag histories, node stats │
 │     on-track / at-risk / critical counts             ▼                           │
 │     shown on the phase card            4. AGGREGATE        PARALLEL (Rayon)      │
 │            │                              reduction over bag histories,          │
 │            ✗  NOT USED BY THE             checked against the engine's totals    │
 │               SIMULATION                             │                           │
 │                                                      ▼                           │
 │                                          summary: delayed, on time, queues ...   │
 │                                          → Dashboard KPIs, Network, Tracker,     │
 │                                            Congestion, History                   │
 └──────────────────────────────────────────────────────────────────────────────────┘

                    A SWEEP JOB  (POST /api/sweeps)
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │  generate the dataset once → prepare each scenario's workload (shared read-only) │
 │  → one warm-up simulation                                                        │
 │                                                                                  │
 │  Pass 1 (1 thread):   [exp 0][exp 1][exp 2] ... [exp 95]      one lane           │
 │  Pass 2 (8 threads):  [exp 0][exp 8] ...                      eight lanes        │
 │                       [exp 1][exp 9] ...                      PARALLEL ACROSS    │
 │                       ...                                     EXPERIMENTS        │
 │                       each experiment = one SEQUENTIAL engine2 run, collection off│
 │                                                                                  │
 │  compare every experiment's outputs (incl. checksum of all finish times)         │
 │  with pass 1 → "All 96 compared runs gave the 1-thread results."                 │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

Say:

> Read this left to right. Generation is parallel and feeds the bag table to two places. The classification kernel is parallel, but its output stops here: it is shown on its phase card and is not used by the simulation. The simulation takes the same bag table, runs sequentially in time order, and records histories. Aggregation is a parallel reduction over those histories and is checked against the engine's own totals. Its summary feeds every Operations page.
>
> A sweep is a different shape. The dataset is generated once. Then the whole grid runs on one thread, then again on many threads. Each experiment is a sequential simulation; the parallelism is across experiments. Finally every result is compared with the one-thread pass.

Which output feeds which step:

Operational parallel mode adds one step between scenario setup and step 3, only when `operational_parallel` is set:

```
 bag table + network ──► 2b. PRECOMPUTE        PARALLEL (Rayon, bag ranges, ≥4 tasks/worker)
                            check-in registration, flight grouping,
                            route + service times (dijkstra/ecmp, no edge outage only)
                            timed vs the sequential precompute, output must be equal
                                   │ read-only per-bag arrays
                                   ▼
                         3. SIMULATE            STILL SEQUENTIAL (event loop, queues,
                                                server allocation, event order)
```

| Output | Feeds | Does not feed |
|---|---|---|
| Generated bag table | Classify, Simulate | — |
| Classify counts (on track / at risk / critical) | The classification phase card only | **The simulation, routing or queueing** |
| Simulation bag histories and samples | Aggregate; Airport Network, Baggage Tracker, Congestion (for the 3 newest runs) | — |
| Aggregate summary | Dashboard KPIs, History, Scenario Studio result | — |
| Sweep experiment results | Sweep tables, grid, consistency check, Guided Demo Results | Operations pages (collection is off in sweeps) |
| Operational precompute arrays | The `engine2` event loop (read only); the precompute phase card and the Parallel Airport Operations timeline | Queues, server allocation, event order, the result (checksums are identical) |

---

# PART 6: Numbers cheat-sheet

Sources: `results/r6_*.txt` and `README.md` only. "M1" = Apple M1 MacBook Air, fanless, 8 GB, 8 logical cores, rustc 1.100.0, on AC power, 27 Nov 2026. Ranges cover all runs in the file.

| Figure | Value (range) | Machine | Workload size | Source |
|---|---|---|---|---|
| Baseline delayed (Normal, dijkstra, fcfs, 100%) | 9,245 bags = 3.697% (deterministic), checksum `61aa19cce7723683` | M1, via API | 250,086 bags | `r6_api.txt`; README |
| SorterOverload, ecmp, fcfs, 100% delayed | 28,606 = 11.438%, checksum `144494908f029748` | M1, API | 250,086 | `r6_api.txt` |
| Normal, congestion, fcfs, 70% delayed | 134,427 = 53.752%, checksum `29e8786b1e8e3fae` | M1, API | 250,086 | `r6_api.txt` |
| Operational parallel mode, workers 1/2/4/8: precompute; whole run | 250,086: 150 ms → 151/75/38/25 ms (1.00x/2.00x/3.98x/6.04x), event loop about 496–500 ms, whole run 1.05x/1.18x/1.29x/1.32x. 1,000,065: 609 ms → 611/304/162/106 ms (1.00x/2.03x/3.80x/5.78x), whole run 1.07x/1.20x/1.28x/1.32x | M1, `operational_bench`, stats only, median of 3, load average about 4.1 (not fully quiet) | 250,086 and 1,000,065 (Normal, dijkstra, fcfs, 100%) | **Reported in session, not saved to `results/`** |
| Pipeline: generate phase | 14.3–14.5 ms vs 67.8–68.2 ms; 4.67x–4.76x | M1, API | 250,086 | `r6_api.txt` |
| Pipeline: classify phase | 0.1 ms vs 0.4 ms; 2.53x–2.55x (rayon-neon) | M1, API | 250,086 | `r6_api.txt` |
| Pipeline: simulate phase | 692.3–701.1 ms (sequential, with collection) | M1, API | 250,086 | `r6_api.txt` |
| Pipeline: aggregate phase | 1.4 ms vs 7.9 ms; 5.44x–5.46x | M1, API | 250,086 | `r6_api.txt` |
| Parallelisable fraction p | 9.8%–9.9% | M1, API | 250,086 | `r6_api.txt` |
| Amdahl ceiling (one pipeline) | 1.109x–1.110x (≈1.11x) | M1, API | 250,086 | `r6_api.txt`; README |
| Measured full-pipeline speedup | 1.084x–1.085x (≈1.08x) | M1, API | 250,086 | `r6_api.txt`; README |
| Sweep, 1 thread wall | 24.23–25.27 s | M1, API | 96 experiments × 100,000 bags requested | `r6_api.txt` |
| Sweep, 8 threads wall | 4.72–5.61 s | M1, API | same | `r6_api.txt` |
| Sweep speedup, 8 threads | 4.51x–5.20x | M1, API | same | `r6_api.txt`; README |
| Sweep efficiency, 8 threads | 56.3%–65.0% | M1, API | same | `r6_api.txt` |
| Sweep correctness | 96 of 96 identical, 3 of 3 sweeps | M1, API | same | `r6_api.txt` |
| Generation, CLI, Rayon 8 vs seq | 0.617–0.629 s vs 2.985–3.141 s; 4.74x–5.09x; efficiency 59%–64% | M1, CLI | 10,000,000 bags | `r6_gen_10M.txt` |
| Generation, CLI, Rayon 4 | 2.90x–3.13x | M1, CLI | 10M | `r6_gen_10M.txt` |
| Generation, API, 64-flight chunks | medians 0.78–1.20 s vs 2.89–3.54 s; 2.95x–3.70x; pairing extremes 1.37x–12.29x | M1, API | 10,000,168 | `r6_api.txt` |
| Generation, API, old default chunk (1,042 flights) | 1.43 s vs 2.94 s; 2.06x (1 job) | M1, API | 10,000,168 | `r6_api.txt` |
| Generation, 50M | 5.508 s vs 16.436 s; 2.98x (1 run) | M1, CLI | 50,000,000 | `r6_gen_50M.txt` |
| Earlier generation figure | 4.97x (1 run, CLI) | M1 | 10M | README citing `bench_phase1b.txt` |
| Kernel scalar | 14.07–14.11 ms | M1, CLI best of 10 | 10,000,168 | `r6_kernels_10M.txt` |
| Kernel ILP x4 | 13.04–13.05 ms; 1.08x | M1 | 10M | `r6_kernels_10M.txt` |
| Kernel NEON | 6.71 ms; 2.09x–2.10x | M1 | 10M | `r6_kernels_10M.txt` |
| Kernel OpenMP 8 | 4.28–4.32 ms; 3.26x–3.30x | M1 | 10M | `r6_kernels_10M.txt` |
| Kernel Rayon 4 + NEON | 1.82–1.99 ms; 7.08x–7.72x | M1 | 10M | `r6_kernels_10M.txt` |
| Kernel Rayon 8 + NEON | 1.95–1.99 ms; 7.08x–7.25x | M1 | 10M | `r6_kernels_10M.txt` |
| Metal kernel only (GPU time) | 3.45 ms; 4.07x–4.10x | M1 | 10M | `r6_kernels_10M.txt` |
| Metal with copies | 7.35–7.46 ms; 1.89x–1.91x; copy in 2.98–3.05 ms | M1 | 10M | `r6_kernels_10M.txt` |
| Kernel via API, rayon-neon 8 threads | medians 2.15–2.23 ms vs 14.16–14.19 ms; 6.37x–6.59x; pairing 3.83x–8.09x | M1, API, 10 reps | 10,000,168 | `r6_api.txt` |
| Kernel scalar, vectorisation off | 21.16 ms (saved, not re-measured) | M1 | 10M | README citing `kernels_10M_novec.txt` |
| Kaggle scalar / AVX2 / OpenMP 4 / Rayon 4+AVX2 | 26.31 ms / 7.91 ms 3.32x / 7.07 ms 3.72x / 3.56 ms 7.39x (**saved, not re-measured**) | Kaggle Xeon 4 vCPU | 10M | README citing `kernels_10M_kaggle.txt` |
| Kaggle CUDA warp kernel / with PCIe / naive | 0.83 ms 31.65x / 21.61 ms 1.22x / 24.81 ms 1.06x; PCIe copy 18.71 ms (**saved**) | Kaggle T4 | 10M | README citing `kernels_10M_kaggle.txt` |
| MPI compute speedup | 4 ranks 3.99x–4.00x; 8 ranks 5.89x–6.19x | M1, CLI, 2 runs | 50M | `r6_mpi_50M.txt` |
| MPI end to end, `read` | 4 ranks 2.73x–4.55x; 8 ranks 3.52x–6.07x (**unreliable**: load timed once) | M1 | 50M | `r6_mpi_50M.txt` |
| MPI end to end, `scatter` | 4 ranks 1.81x–2.15x; 8 ranks 1.03x–1.15x | M1 | 50M | `r6_mpi_50M.txt` |
| Kaggle MPI scatter 4 ranks | 0.63x end to end (**saved**) | Kaggle | 50M | README citing `mpi_50M_kaggle.txt` |
| M/M/c validation of `engine.rs` | 15 of 15 within 5%; errors −3.27% to +0.37% | M1 | 1M customers per case | `r6_validation_mmc.txt` |
| Routing × policy, 100% | Dijkstra+FCFS 3.70%; Congestion+FCFS 3.25%; any+EDF 0.00%; ECMP/congestion/deadline+SPT 0.71%–0.72% | M1, CLI | 250,086 | `r6_compare_100.txt` |
| Routing × policy, 70% | Dijkstra+EDF 79.59%; Dijkstra+FCFS 77.42% | M1, CLI | 250,086 | `r6_compare_70.txt` |
| Scenarios, worst | ScreeningDelay and PeakSurge 13.68%–20.62% delayed (FCFS or EDF) | M1, CLI | 250,086 (PeakSurge 262,182) | `r6_scenarios.txt` |
| Guided Demo duration | about 70 s total, workload and sweep about 31 s each | M1, one browser walkthrough | — | README only (**not in a result file**) |
| Sweep delayed rate | under 0.04% in every experiment of the demo's runs | M1 | 100,000 requested | README only (**not in a result file**) |

Derived (my arithmetic, not printed in a file): API generation efficiency at the medians = 2.95/8 to 3.70/8 = 36.9%–46.3%.

**When the screen differs from this sheet**, say:

> This sheet is from runs saved on 27 November. The screen is a fresh run on this machine now. Simulation outcomes like 3.697 percent must match exactly, because the engine is deterministic. Timings will differ: this is a fanless laptop, and heat and background load move timings by more than ten percent. That is why we quote ranges and why the app marks noisy results.

If a *deterministic* value differs (delayed %, checksum), do not explain it away: say it is unexpected and should be investigated.

---

# PART 7: Honest limits to say out loud

Say each sentence as written.

1. **Classify output unused.** "The deadline-risk kernel is a separate batch analysis. The simulation does not use its output."
2. **Pipeline gain is about 1.08x.** "One full pipeline is only about 1.08 times faster, because about 90 percent of its time is the sequential simulation. Amdahl's law caps it at about 1.11."
3. **The sweep is where it pays off.** "Parallelism pays off when we run many independent simulations: 4.5 to 5.2 times on eight threads."
4. **Noisy timings.** "Timings are noisy on a fanless laptop. We quote ranges, repeat sweeps, and the app marks spreads over ten percent."
5. **Synthetic data.** "All data is one synthetic day. Nothing is calibrated against a real airport."
6. **Statuses not produced.** "The engine never produces MISROUTED or TRANSFER_PENDING, so they have no count."
7. **Facility colours.** "Facility colours and the congested count are a display rule in the API, not engine output: 75 percent busy for High, 95 for Congested, over a 15-minute window."
8. **CUDA and AVX2 are saved results.** "CUDA and AVX2 figures are saved Kaggle results. They were not re-measured, and they are never compared with the M1 on one axis."
9. **engine2 has no theory validation.** "Our M/M/c check against queueing theory validates the older engine, engine.rs. The main engine, engine2, has no theory validation of its own. It is checked by pinned configurations and checksums."
10. **API vs CLI generation.** "Generation through the API is slower than the command-line tool: about 3 to 3.7 times against about 4.7 to 5.1. We did not investigate why."
11. **Default generate chunk.** "The API's default chunk for generation was changed to 16 flights after these measurements. The new default has not been re-measured. The Guided Demo uses 64-flight chunks."
12. **Transfer not modelled.** "There is no transfer stage. Transfer bags differ only in arrival window, deadline and priority."
13. **Missing mechanisms.** "Early-bag storage, minimum connection times, loader limits, random equipment failures and link capacities are not modelled. With no other live route, a bag uses a failed link."
14. **Servers fixed.** "Servers do not grow with the bag count. More bags means more load unless you raise the server multiplier. At one million bags with multiplier 1, almost every bag is late."
15. **Not built.** "Resource Profiler, the scenarios endpoint, history delete and export, live MPI runs, and memory and GPU utilisation figures are not built."
16. **Links between benchmarks and runs.** "A benchmark runs on its own base dataset. It is not linked to a simulation run."
17. **Reads during jobs.** "The API still answers page requests while a job runs, which can disturb benchmark timings slightly."
18. **Detail retention.** "Full bag histories are kept in memory for the three newest simulations only. Older runs keep their summary."
19. **Open CORS.** "The API accepts requests from any web page while it runs. It is a local research tool, not a hardened server."
20. **Rayon + NEON stops at 4 threads.** "On the M1 Rayon with NEON stops improving beyond four threads. We did not measure why; we did not claim it is memory bound."
21. **MPI end to end unreliable.** "MPI end-to-end figures are unreliable, because the file load was timed only once."
22. **No web tests.** "The web app has no automated tests."
23. **OpenMP thread count.** "In benchmarks OpenMP runs at its own default thread count; the API cannot set it there."
24. **Operational parallel mode is about 1.3x.** "Inside one simulation we parallelise only the per-bag precompute: check-in registration, flight grouping, and for dijkstra and ecmp the routes and service times. The event loop, the queues, server allocation and event order stay sequential, so on eight workers the whole run is only about 1.3 times faster."
25. **One worker is not parallelism.** "At one worker the run is already 1.05 to 1.07 times faster, but the precompute itself is 1.00 there. That gain comes from moving per-bag work out of the loop, not from parallelism."
26. **Stats only, not fully quiet.** "Those figures are stats only. The app also records bag histories, which makes the loop longer and the speedup smaller. The machine's load average was about 4.1, and the output is not saved in the results folder."
27. **Congestion and deadline.** "With congestion or deadline routing, or in ConveyorFailure, only check-in registration and flight grouping are precomputed, because routes depend on live queues or time."
28. **Replay, not live.** "The worker timeline replays recorded precompute task times. It has no lane for the event loop."

---

# PART 8: Likely evaluator questions with model answers

1. **If the simulation is sequential, why parallelise at all?**
   Because the work around it is large and independent, and because decisions need many simulations. Generation and aggregation are about five times faster, and a sweep of 96 simulations was 4.5 to 5.2 times faster on eight threads.

2. **Why not parallelise the simulation itself?**
   Each event can change the queues later events see. Processing events out of order would change the answer. Doing it correctly needs parallel discrete-event simulation, which is a research area of its own, and our model has heavy coupling at shared queues, so the gain would be small and the risk high. We chose correctness and parallelised across experiments instead.

3. **What is parallel discrete-event simulation?**
   Splitting a model into parts on different processors, each with its own event list. Conservative methods only process an event when it is provably safe; optimistic methods process ahead and roll back if a late message arrives. BagFlow does not implement either.

4. **SIMD vs multithreading?**
   Multithreading runs separate streams of instructions on separate cores. SIMD makes one instruction process several values in one core. They stack: rayon-neon uses eight threads, each using four-lane NEON instructions.

5. **Why can a GPU be slower?**
   The data has to be copied in and out, and launching the kernel has overhead. On the M1 at 10 million bags the Metal kernel alone was about 4.1 times faster than scalar, but with copies only about 1.9 times. At smaller sizes the copies and launch can outweigh the whole scalar run; the app explains this in "What this run shows".

6. **How is correctness checked?**
   Every parallel repetition's checksum is compared with the sequential one. Benchmarks compare every repetition's output with scalar. Sweeps compare every experiment, including a checksum over all bag finish times, with the one-thread pass. Aggregation is also checked against the engine's own totals. Three engine configurations are pinned to exact delayed rates and checksums in tests.

7. **What does Amdahl mean here?**
   About 10 percent of one pipeline run is parallelisable. So even infinitely fast parallel phases would give at most 1 / 0.9, about 1.11 times. We measured about 1.08.

8. **What is the real-world benefit?**
   Faster evaluation of alternatives. An operator comparing six scenarios, four routings and four queue policies gets the 96 answers four to five times sooner on the same laptop. It is a simulation study, not an airport system.

9. **Why Rust?**
   It is as fast as C++ and prevents data races at compile time, which matters for parallel code. Rayon makes data parallelism safe and simple. OpenMP, Metal, CUDA and MPI are reached through C++ or native code from Rust.

10. **Why these routing and queue choices?**
    They span the main ideas: static shortest path (Dijkstra), static load spreading (ECMP), dynamic queue-aware routing (congestion), and urgency-aware routing (deadline). For queues: arrival order, class priority, earliest deadline, shortest job. They are standard textbook policies.

11. **How is the data generated? Is it realistic?**
    A seeded generator builds one synthetic day of flights and bags with separate random streams per purpose and per flight. It is not calibrated against a real airport, and we say so on screen. It is realistic enough to create queues and deadlines, not to predict a real airport.

12. **How do you know the engine is correct?**
    The older engine passes 15 of 15 M/M/c cases within 5 percent of Erlang C theory. The main engine, engine2, has no theory validation; it is checked by determinism, pinned configurations with checksums, and the sweep's one-thread comparison. That gap is a limit we state.

13. **Why is the speedup not linear?**
    Serial parts (drawing flights, merging, appending), task overheads, unequal cores, memory bandwidth contention, and the end of a sweep where some threads wait for the last experiments. Each pass is also timed once, so noise adds to it.

14. **What limits efficiency at 8 threads?**
    In the sweep: experiments of different lengths and the tail where fewer than eight are left. The API's own note says cores need not be equal in speed. In generation: serial stages and merging. For the kernel, the scaling from 4 to 8 threads flattened; we did not measure the cause.

15. **What is work stealing?**
    Each thread keeps a queue of tasks; when it is empty, it takes tasks from another thread's queue. Load balances itself without planning.

16. **What would you do next?**
    Re-measure the new generate chunk default; investigate API vs CLI generation; validate engine2 against theory; add memory and GPU utilisation measurement and build the Resource Profiler; wire live MPI; add web tests; try parallel discrete-event simulation on a partitioned network.

17. **What is not implemented?**
    Resource Profiler, `POST /api/scenarios`, history delete and export, live MPI in the app, memory and GPU utilisation figures, a transfer stage, link capacities, random failures, misrouting.

18. **Why is Metal not much faster at 250k bags?**
    At 250,000 bags the kernel is tiny: scalar takes about 0.4 ms in the pipeline. Copy in, launch and copy out are fixed costs that do not shrink with the data, so they dominate. (At 10M the M1 Metal path is 1.89–1.91x with copies.)

19. **How does the job queue work?**
    One worker thread runs simulations, parallel runs, sweeps and benchmarks one at a time, so timings never overlap. Up to 8 jobs can wait; more are refused. Progress is streamed to the page as server-sent events.

20. **How would this scale to a cluster with MPI?**
    The kernel already has an MPI version. On the M1 its compute part scaled 5.89 to 6.19 times on 8 ranks for 50M bags, but end to end the data distribution dominates: with scatter, 8 ranks gave only 1.03 to 1.15 times. On a cluster, each node should read its own slice (the read mode). A sweep would map naturally onto a cluster: one experiment per process.

21. **What are the limits of the study?**
    One synthetic day; one main machine, fanless; one sequential engine without theory validation; timings that vary; Kaggle numbers not re-measured; several mechanisms not modelled (Part 7).

22. **Why median and not mean?**
    The median ignores single outliers, like one repetition slowed by a background task. The Performance Lab also shows mean, standard deviation, minimum and maximum.

23. **Why do you show ranges instead of one number?**
    Because repeated runs differ. For example, three identical sweeps gave 4.51, 5.11 and 5.20 times. One number would hide that.

24. **What is "pairing extremes"?**
    The widest speedup the repetitions allow: shortest sequential over longest parallel, up to longest sequential over shortest parallel. It is a deliberately pessimistic and optimistic bound.

25. **Why does the 8-thread generation speedup sometimes exceed 8?**
    Only in the pairing range, when one unusually slow sequential repetition (8.76 s in one saved job) is paired with the fastest parallel one. The app labels it noise, not extra scaling.

26. **Why does ILP gain so little?**
    The compiler already auto-vectorises the scalar loop, so manual unrolling adds little: 1.08x on the M1, and slower on the Kaggle Xeon (0.86x).

27. **Is the speedup against a weak baseline?**
    No. The scalar baseline is already auto-vectorised. With vectorisation off it would be 21.16 ms instead of about 14.1 ms, which would make our speedups look bigger. We use the harder baseline.

28. **Why is efficiency not shown for NEON or GPU?**
    Efficiency is speedup per thread. NEON gains come from vector lanes and the GPU has no thread count we control, so the figure would be meaningless.

29. **Does the thread setting change results?**
    No. Scenario Studio says it: threads and backend never change the simulation result. Checksums confirm it.

30. **Why do the Guided Demo steps say "Reused saved run"?**
    A step reuses the newest saved run with exactly the same settings, to save time. Pressing "Run it again now" measures again and says "Run during this visit".


31. **So is screening parallel now?**
    No. The screening and sorting queues are in the sequential event loop, as before. Operational parallel mode precomputes per-bag values before the loop: arrival times, loading areas and, for dijkstra and ecmp without an edge outage, each bag's route and service times, including the service time it will have at screening. The queueing itself is not parallel.

32. **Why only 1.3x on eight workers?**
    Amdahl's law. At 250,086 bags the precompute is about 23 to 24 percent of the work, so even an instant precompute caps the run at about 1.31x. The precompute ran 6.04 times faster on eight workers, which predicts about 1.24x over the sequential-precompute path; we measured 1.23x. The event loop, about 500 ms, is what remains.

33. **Why is workers = 1 already 1.05x?**
    It is not parallelism: the precompute alone is 1.00x at one worker. Doing the per-bag work in one pass before the loop, instead of inside it, is a little cheaper. That is why the honest parallel figure is the precompute speedup, and the whole-run figure includes this effect.

34. **Are the results really identical?**
    Yes. The three pinned checksums were reproduced for workers 1, 2, 4 and 8 in `crates/bagflow-core/tests/operational.rs`, and the page compares the two runs' checksums. The 1M-bag checksum is not a pinned value.
---

# PART 9: Readiness checklist and fallbacks

## 9.1 Ten-point readiness checklist

1. Laptop on AC power, lid open, other apps closed (timings are noisy otherwise).
2. `scripts/start.sh` running; it printed `BagFlow is running: http://localhost:5173`.
3. Top bar shows `API connected`.
4. Dashboard `Engine status` shows no red `Debug build` line.
5. `Run baseline` done once; `Delayed bags` shows `9,245` and `3.697% of bags`.
6. All five Guided Demo steps show `Result ready` (run them about 2 minutes before, about 70 s total).
7. At least two identical sweeps saved (so the noise card shows a range, not "One sweep only").
8. One benchmark saved in the Performance Lab; Backend Comparison shows it.
9. The baseline and the 70% run are among the 3 newest simulations, so Network, Tracker and Congestion have detailed data (run the baseline last if needed).
10. This document open on a second screen, with Part 6 and Part 7 ready.

## 9.2 If the demo breaks

**API offline** (top bar `API unreachable`, cards say `API unreachable`).
- Say: "The local server has stopped. The app never shows stale numbers as live; it says so."
- Do: in the terminal, stop and rerun `scripts/start.sh`. The page reconnects by itself. If a port is busy, use `BAGFLOW_API_ADDR=127.0.0.1:3101 scripts/start.sh`.
- Meanwhile: present from Part 6, and from pages already loaded (they say `Values on screen were loaded earlier.`).

**Slow or queued sweep** (`Queued. The API runs one job at a time, so that timings never overlap.` or a long `Live: pass …`).
- Say: "The API runs one job at a time so timings never compete. This is by design."
- Do: switch to the saved sweep with the `Saved sweeps` drop-down, or skip the Guided Demo step with `Skip this step`. Never start a sweep and a benchmark together.

**Noisy or surprising result** (amber `Noisy`, efficiency above 100%, a speedup outside the cheat-sheet range).
- Say: "This is a single timing on a fanless laptop. The app shows the spread and warns me. The saved ranges are 4.5 to 5.2 for the sweep and 1.08 for the pipeline."
- Do: press `Run these settings again` or `Run it again now` if time allows, and show the range. If a *deterministic* value differs (delayed %, checksum), say it is unexpected and must be investigated; do not explain it away.

**Browser does not load** (blank page or connection refused at port 5173).
- Do: check the terminal; if Vite says `Found another Vite dev process for this project`, use the address of the running one. Try `http://localhost:5173` in a fresh tab. As a fallback, `cd web && npm run build && npm run preview` serves on `http://localhost:4173`.
- Meanwhile: present Parts 1, 5 and 6 from this document, and show `results/r6_api.txt` in the terminal.

**Guided Demo reuses old runs** (`Reused saved run with the same settings` with an old date).
- Say: "This step found a saved run with exactly the same settings, and it tells you so with its date and id. The outcome is deterministic, so reuse is safe; timings are from that saved run."
- Do: press `Run it again now` to measure fresh; the line changes to `Run during this visit`.

---

# Appendix: disagreements and unverified items

Found while preparing this script.

**Disagreements**

1. **API default generate chunk.** README says the measurements used about 1,042 flights per chunk and the default is now 16 (17 at 10M); `r6_api.txt` records `chunk 1042 flights`; `config/demo.ts` says `the API's default is 16`. Consistent with each other, but the "Known issue" in the README describes the old default, and the new default is not measured anywhere.
2. **Design doc vs app on generation speedup.** `docs/design/parallel-studio.md` §3 cites "4.97x at 8 threads on the M1". `config/stages.ts` deliberately shows no numbers. The README says 4.97x is a single CLI run (`bench_phase1b.txt`) and quotes 4.74x–5.09x (`r6_gen_10M.txt`); the app's own API measurements are lower (2.95x–3.70x).
3. **CLI vs API generation speed.** 4.74x–5.09x (CLI) vs 2.95x–3.70x (API, same 10M size). The README says why was not investigated.
4. **OpenMP thread count.** The Performance Lab says `OpenMP always runs at its own thread count` and AUDIT §12 says it is not selectable from the API; but the Parallel Execution Studio form makes `Threads` editable for `openmp` (`takesThreads` in `utils/telemetry.ts` includes `openmp`), and `crates/bagflow-api/src/parallel.rs` passes the thread count to `traced::openmp`. The two pages behave differently.
5. **AUDIT §12 "Open: trace sample".** The Airport Network now draws sampled bags with real histories (`useBagSample`), so this AUDIT item looks out of date. I did not trace which endpoint serves it.
6. **AUDIT §12 "scenario descriptions" open.** The web app now has its own scenario notes in `config/ops.ts` (`SCENARIO_NOTES`, "from crates/bagflow-core/src/scenarios.rs"); the API still serves none.
7. **Kernel speedups: three statistics.** README CLI figures are best-of-10, API figures are medians, and older files differ by session (`kernels_10M.txt` has `rayon-4+neon` at 3.81 ms vs 1.82–1.99 ms in `r6_kernels_10M.txt`). Not an error, but they must never be quoted as one number.
8. **Full-pipeline rounding.** `r6_api.txt` gives 1.084x–1.085x; the app prints two decimals, so 1.085 may display as 1.08x or 1.09x.

**Could not verify from `results/r6_*.txt` or the README**

- Guided Demo total time "about 70 s" and "about 31 s" per heavy step (README only, no result file).
- "Every experiment delays under 0.04% of bags" in the demo's sweeps (README only).
- 2-thread and 4-thread sweep figures for the Parallel Sweeps page default (2, 4, 8 threads): no saved result file.
- Live Performance Lab figures at its default 1,000,000 bags: no saved result file.
- Mean queueing time per bag in the Problem and Simulation steps: no result file prints it (the CLI `mean s` column is time in system, not queue wait).
- The exact checksum the app shows for a generation run versus the CLI checksum `2fa040bc2723a302`: not compared.
- 1M-bag API figures (2.2–2.8 s per run, 601 MB, 95–99% delayed) are in AUDIT §12 only, not in `results/`.
- Operational parallel mode table: reported in session, not saved to `results/`; measured with a load average of about 4.1, not on a fully quiet machine.
- Parallel Airport Operations page: the browser check covered only 100,000 bags with 4 workers.
- The complete test suite was not re-run after the last API change (adding `operational` to `GET /api/simulations/:id`); that change was covered only by the browser check.
- The README's Kaggle and `novec` figures were cited from older files that this script did not re-read line by line.
