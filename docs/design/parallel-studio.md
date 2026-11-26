# BagFlow: Parallel Airport Processing & Optimisation Studio (design v2, replaces blueprint.md where they differ)

Identity: BagFlow demonstrates how parallel computing accelerates large-scale baggage data processing and enables faster evaluation of many airport operating scenarios. The UI must VISUALLY show why parallelism helps, not just list backends and speedups.

Key truth to show: the discrete-event simulation stays sequential (events must stay ordered), but parallelism is used in three places: (1) within a workload (dataset generation, batch kernels, aggregation), (2) across independent baggage batches, (3) across independent simulation experiments (sweeps). Not every stage is parallel; never claim otherwise.

Theme: light, tokens from blueprint.md (bg #F6F8FA, surface #FFF, heading #172B45, teal #168C7D, blue #3975CE, warning #D99A35, critical #D95757, border #E4E9EF), Inter + JetBrains Mono.

## Destinations and sidebar
OVERVIEW: Main Dashboard
OPERATIONS & PARALLELISM: Stage Explorer, Airport Network, Parallel Execution Studio, Baggage Tracker, Congestion Analysis
PERFORMANCE: Performance Lab, Backend Comparison, Resource Profiler
EXPERIMENTS: Scenario Studio, Parallel Sweeps, Simulation History
Plus a Guided Demo mode.

## Status labels (use everywhere)
Implemented, Measured (from this run, this machine), Static (saved result from another machine), Simplified, Planned, Unavailable on this machine. Real vs estimated must always be visible.

## 1. Sequential vs parallel visualisation (top priority)
Show the work being distributed: sequential = one worker lane filling batch after batch; parallel = several lanes running at once, completed batches merging into one result, a live elapsed timer, and a checksum check against the sequential result. Animation is driven by real task progress (task start/end times from the backend), never invented worker activity. Explain WHY the speedup happens.

## 2. Parallel Execution Studio (/operations/parallel-studio), three views
View A, workload distribution: choose a workload (generate dataset, classify deadline risk, aggregate node stats, run independent experiments) and a backend. Show original workload, partitioning into chunks, worker assignment, concurrent execution, result merge, checksum verification.
View B, backend comparison: each backend gets its own visual. OpenMP/Rayon = threads on chunks (Rayon: work stealing); NEON/AVX2 = vector lanes, several values per instruction (no separate workers); Metal/CUDA = GPU blocks/grids plus copy-in / kernel / copy-out; CUDA naive vs warp vs PTX; MPI = separate processes, read vs scatter. Only show backends available on this machine (others: Static results with machine name, or Unavailable).
View C, execution timeline: real start/end of each task so overlap and the final merge are visible.

## 3. Stage Explorer (7 stages) with "Parallel Processing & Computational Contribution"
Each stage answers: what operation happens, can it be parallelised, what improvement was measured.
1 Check-in and generation: Rayon parallel dataset generation (measured, e.g. 4.97x at 8 threads on the M1).
2 Identification: parallel validation only if implemented and measured, otherwise say Not implemented.
3 Screening: queue coordination is sequential; show only implemented batch kernels.
4 Transportation: routing uses sequential event and network constraints; any parallel calculation shown separately.
5 Sorting: parallel aggregation of node workloads where implemented.
6 Transfer: batch deadline-risk kernel with measured backend comparison (scalar, ILP, OpenMP, Rayon, NEON, AVX2, Metal, CUDA, warp, PTX, MPI).
7 Loading: sequential event and state transitions plus parallel batch analysis where applicable.
Replace any illustrative number with a measurement from the selected run.

## 4. Parallel Sweeps (/experiments/sweeps), the biggest system-level benefit
Select scenarios x routings x queue policies (e.g. 6 x 4 x 4 = 96 independent simulations). Each simulation is sequential inside; many run at once on a thread pool. Show a grid of experiments filling across worker lanes, completed / running / failed counts, per-thread distribution, result consistency (identical to the 1-thread sweep), and a table: threads, wall time, speedup, efficiency (1 thread = 1x, 100%), total time saved.

## 5. Pipeline on the dashboard: "Where Parallel Computing Makes a Difference"
Four measured phases per run: 1 dataset generation (parallel, Rayon), 2 deadline-risk classification (parallel kernel, selected backend), 3 discrete-event simulation (sequential), 4 result aggregation (parallel reduction). Show measured time per phase and total, a baseline-vs-parallel comparison per eligible phase, and a full-pipeline comparison that exposes the sequential bottleneck (Amdahl's law). Timings must come from comparable runs with the same workload.

## 6. Guided Demo mode
Problem (airport congestion) -> Workload (generate a large dataset, Rayon distribution) -> Parallel kernel (scalar vs accelerated risk classification) -> Simulation (movement, queues, deadlines) -> Experiment sweep (concurrent scenarios, wall-time gain) -> Results (speedup, throughput, efficiency, operational outcomes).

## 7. Build priority
1 sequential vs parallel visualisation, 2 pipeline breakdown, 3 workload distribution animation, 4 sweeps, 5 stage-specific parallel contribution, 6 performance analytics, 7 airport network (and tracker, congestion).

## 8. Suggested components
components/parallel: WorkloadInput, WorkloadPartition, WorkerLanes, ExecutionTimeline, ResultMerger, ChecksumVerifier, ParallelSpeedupCard.
components/pipeline: PipelineOverview, PipelineStage, PipelineTiming, SequentialParallelCompare, AmdahlAnalysis.
components/sweeps: SweepConfiguration, ExperimentGrid, ThreadDistribution, SweepProgress, SweepResults, ConsistencyCheck.
hooks: usePipelineMetrics, useParallelExecution, useSweep, useExecutionStream. services: pipelineService, parallelService, sweepService. types: pipeline, parallel, sweep.

## Honesty rules
The animation shows real telemetry or is labelled Simplified. Do not present Mac and Kaggle numbers on one axis without the machine named. Memory and GPU utilisation only where actually collected.
