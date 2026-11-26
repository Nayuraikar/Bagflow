# BagFlow UI blueprint (condensed from the two design documents)

Direction locked: LIGHT theme, hybrid aviation-tech look, interactive 2D airport network. Real product feel, not a college dashboard. Never a generic admin dashboard with 15 cards.

## Two connected stories
1. Operational: how baggage travels through an airport and how BagFlow optimises it (teal identity).
2. Computational: how well different parallel implementations process the same baggage workload (blue identity).
They are two laboratories in one app, linked by one global "current simulation run" selector in the top bar.

## Design tokens
Background #F6F8FA, surface #FFFFFF, headings #172B45, operations teal #168C7D, performance blue #3975CE, warning #D99A35, critical #D95757, border #E4E9EF, secondary text #738196.
Fonts: Inter for text and headings, JetBrains Mono (or Geist Mono) for numbers. White cards, subtle borders, minimal shadow, generous whitespace.

## Navigation (persistent left sidebar + top bar)
- Workspace: Overview (/dashboard)
- Operations: Stage Explorer (/operations/stages), Airport Network (/operations/network), Baggage Tracker (/operations/baggage), Congestion Analysis (/operations/congestion)
- Computing: Performance Lab (/performance), Benchmark Analytics (/performance/analytics), Resource Profiler (/performance/profiler)
- Experiments: Scenario Studio (/experiments/scenarios), Simulation History (/experiments/history)
- System: Settings
The two main destinations are Operations Lab and Performance Lab.

## Pages
1. Main Dashboard: welcome, engine status, last simulation time, "New simulation" button. 4 KPI cards from the latest real run (Total baggage, Successfully loaded, In transit, Active bottlenecks), "--" if no run. Two big destination cards (Operations Lab teal, Performance Lab blue). Recent activity table (workload, scenario, backend, status, link). Small network preview with facility status colours.
2. Stage Explorer: horizontal 7-stage selector (Check-in, Identification, Screening, Transportation, Sorting, Transfer, Loading). Selected stage shows six sections: overview, how it works, data processed, algorithms and logic, parallel computing contribution, bottlenecks and optimisation. Plus live metrics (bags processed, queue length). Do NOT imply every stage uses every backend; show the real mapping and a Modelled / Simplified / Not modelled badge per stage.
3. Airport Network: Cytoscape.js graph from graph data (never a static image). Layout: check-in left, screening, conveyors, sorters, loading right. Node colour by utilisation: green normal, amber high, red congested, grey offline. Click a node: right panel with id/type, capacity, incoming, outgoing, queue length, avg wait, utilisation, status. Click an edge: source, destination, travel time, max throughput, load, availability. Toolbar: zoom, pan, fit, filter by type, show/hide congestion, flow, labels. Animated bag markers during playback of a run. Legend.
4. Baggage Tracker: KPI cards (total, in transit, waiting, delayed). Table (bag id, flight, current location, status, priority, departure). Search by id; filter by status, flight, facility; sort by deadline. Drawer for one bag with a vertical state timeline (CHECKED_IN, IDENTIFIED, SCREENING, IN_TRANSIT, SORTED, LOADING, LOADED) with timestamps, location and waiting time; include DELAYED, HELD_FOR_INSPECTION (and MISROUTED only if the engine ever produces it).
5. Congestion Analysis: metrics (congested facilities, avg queue wait, max utilisation, delayed bags). Charts: utilisation by facility, queue length over time, incoming vs outgoing, waiting-time distribution, bottleneck ranking table. Clicking a facility jumps to its node on Airport Network. Status is computed by the backend.
6. Performance Lab: header "Parallel Performance Laboratory". Summary cards (workload size, sequential time, best time, max speedup, peak throughput). Backend cards (Sequential, OpenMP, Rayon, SIMD, CUDA, plus the others BagFlow actually has). Benchmark configuration (workload size, backends, repetitions, warm-up) with Run Benchmark. Charts: execution time, throughput, speedup, parallel efficiency, scalability, memory. Auto-generated interpretation text from measured values only; no "fastest" claims without the configuration.
7. Benchmark Analytics: scalability over 100K / 500K / 1M / 5M / 10M, backend comparison, speedup S = T_seq / T_par, efficiency E = S / P x 100, overhead split (CPU compute, GPU kernel, transfer, launch), repeated-run stats (mean, median, std, min, max).
8. Resource Profiler: CPU threads, RAM, transfer overhead, execution time, GPU utilisation and memory ONLY where the backend really collects them. Never label an estimate as a hardware measurement.
9. Scenario Studio: steps. 1 scenario (normal, peak surge, conveyor failure, screening delay, connecting rush, sorter overload). 2 infrastructure (bags, flights, facilities, capacities, service rates). 3 strategy (routing and queue policy; only implemented ones). 4 backend. 5 run with progress and logs. 6 results in two groups: operational (processed, on-time, avg wait, queues, congested facilities) and computational (time, throughput, speedup, efficiency, memory). Compare two runs side by side.
10. Simulation History: list past runs with unique id and timestamp, inspect config, reopen, compare, export, delete.

## Frontend stack and folders
React + TypeScript + Vite, Tailwind CSS, React Router, TanStack Query, Recharts, Cytoscape.js (react-cytoscapejs), Lucide icons; shadcn/ui and Framer Motion optional.
src/: app/ (App, router, providers), layouts/ (DashboardLayout, Sidebar, Topbar, PageContainer), pages/ (dashboard, operations, performance, experiments), components/ (common, operations, performance, experiments), hooks/, services/ (api adapter per domain), types/, utils/, config/ (navigation, stages, constants), styles/.
Keep the simulation engine separate: React sends configs to the Rust backend and receives results. NEVER generate fake live data in the UI and show it as engine output. Empty states show "--".

## API contract (proposed; adapt names to the Rust output through an adapter)
GET /api/health; POST /api/simulations; GET /api/simulations/:id; GET /api/simulations/:id/metrics; GET /api/simulations/:id/network; GET /api/simulations/:id/baggage; POST /api/benchmarks; GET /api/benchmarks/:id; GET /api/benchmarks/:id/metrics; POST /api/scenarios; GET /api/history. Live progress via SSE or WebSocket. A simulation job and a benchmark job are separate things.

## TypeScript models (frontend-facing)
```ts
export type BaggageStatus = "CHECKED_IN"|"IDENTIFIED"|"SCREENING"|"CLEARED"|"IN_TRANSIT"|"SORTED"|"TRANSFER_PENDING"|"LOADING"|"LOADED"|"DELAYED"|"MISROUTED"|"HELD_FOR_INSPECTION";
export type BackendType = "SEQUENTIAL"|"OPENMP"|"RAYON"|"SIMD"|"CUDA";
export interface Baggage { id:string; passengerId:string; flightId:string; currentLocation:string; destination:string; status:BaggageStatus; priority:string; arrivalTime:number; departureTime:number }
export interface AirportNode { id:string; name:string; type:string; capacity:number; queueLength:number; processingRate:number; utilisation:number; status:string }
export interface AirportEdge { id:string; source:string; target:string; capacity:number; travelTime:number; trafficLoad:number; available:boolean }
export interface SimulationMetrics { totalBags:number; processedBags:number; inTransit:number; delayedBags:number; averageWaitingTime:number; onTimeLoadingRate:number }
export interface BenchmarkResult { backend:BackendType; workloadSize:number; executionTimeMs:number; throughput:number; speedup:number; parallelEfficiency:number; memoryUsage:number }
```
Extend BackendType with the real BagFlow backends (ILP, NEON, AVX2, METAL, MPI, CUDA variants) and map to the actual Rust serialisation via an adapter.

## UX interactions
Click stage: details. Click facility or conveyor: info panel. Click a bag id: full journey. Click a bottleneck: highlight on the network. Click a backend: its results. Run simulation: progress. Complete: update operational metrics. Run benchmark: fill charts. Compare two runs: side by side. Global run selector keeps Operations and Performance on the same run.

## Build order
1 Dashboard + shell + navigation. 2 Stage Explorer with parallel-contribution sections. 3 Airport Network. 4 Performance Lab. 5 Scenario Studio. Then Baggage Tracker, Congestion Analysis, Benchmark Analytics, Resource Profiler, History. Must preserve the link between real baggage stages and the parallel computing implementation: identity is agent-based simulation + airport optimisation + HPC, not a generic airport admin tool.
