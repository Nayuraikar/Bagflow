// Pure mapping from the Rust JSON to the UI models: renames, ids to strings, backend names.

import type {
  AirportEdge, AirportNetwork, AirportNode, BackendType, Baggage, BaggagePage, BenchmarkConfig,
  BenchmarkMetrics, BenchmarkResult, Health, RunRecord, SimulationConfig, SimulationMetrics,
  StaticResult, StatusRule,
} from "../types/models";
import type {
  WireBag, WireBaggagePage, WireBenchConfig, WireBenchMetrics, WireBenchRow, WireEdge, WireHealth,
  WireHistoryItem, WireNetwork, WireNode, WireSimConfig, WireStaticRow, WireStatusRule, WireSummary,
} from "../types/wire";

const BACKENDS: Record<string, BackendType> = {
  scalar: "SEQUENTIAL", ilp: "ILP", neon: "NEON", avx2: "AVX2", openmp: "OPENMP",
  "rayon-ilp": "RAYON_ILP", "rayon-neon": "RAYON_NEON", "rayon-avx2": "RAYON_AVX2",
  metal: "METAL", "cuda-naive": "CUDA_NAIVE", "cuda-warp": "CUDA_WARP", "cuda-ptx": "CUDA_PTX", mpi: "MPI",
};

export function toBackend(wire: string): BackendType {
  const backend = BACKENDS[wire];
  if (!backend) throw new Error(`unknown backend '${wire}' from the API`);
  return backend;
}

export function fromBackend(backend: BackendType): string {
  return Object.keys(BACKENDS).find((k) => BACKENDS[k] === backend)!;
}

export const toSimConfig = (w: WireSimConfig): SimulationConfig => ({
  scenario: w.scenario, routing: w.routing, policy: w.policy,
  capacityPct: w.capacity_pct, serverMultiplier: w.server_multiplier, bagCount: w.bag_count,
});

export const fromSimConfig = (c: SimulationConfig): WireSimConfig => ({
  scenario: c.scenario, routing: c.routing, policy: c.policy,
  capacity_pct: c.capacityPct, server_multiplier: c.serverMultiplier, bag_count: c.bagCount,
});

const toBenchConfig = (w: WireBenchConfig): BenchmarkConfig => ({
  bagCount: w.bag_count, backends: w.backends, threads: w.threads, repetitions: w.repetitions, warmup: w.warmup,
});

export const fromBenchConfig = (c: BenchmarkConfig): WireBenchConfig => ({
  bag_count: c.bagCount, backends: c.backends, threads: c.threads, repetitions: c.repetitions, warmup: c.warmup,
});

export const toMetrics = (w: WireSummary): SimulationMetrics => ({
  totalBags: w.total_bags,
  processedBags: w.processed_bags,
  inTransit: w.in_transit,
  delayedBags: w.delayed_bags,
  loadedOnTime: w.loaded_on_time,
  averageWaitingTime: w.average_waiting_time_s,
  onTimeLoadingRate: w.on_time_loading_rate,
  delayedPct: w.delayed_pct,
  congestedFacilities: w.congested_facilities,
  maxQueue: w.max_queue,
  endMs: w.end_ms,
});

export const toStatusRule = (w: WireStatusRule): StatusRule => ({
  source: w.source, windowSamples: w.window_samples, highAt: w.high_at, congestedAt: w.congested_at,
});

export function toRun(w: WireHistoryItem): RunRecord {
  const base = {
    id: w.id, status: w.status, createdAt: w.created_at_ms, finishedAt: w.finished_at_ms,
    configHash: w.config_hash, error: w.error, progress: w.progress, retained: w.retained,
  };
  return w.kind === "simulation"
    ? { ...base, kind: w.kind, config: toSimConfig(w.config), summary: w.summary ? toMetrics(w.summary) : null }
    : { ...base, kind: w.kind, config: toBenchConfig(w.config) };
}

export const toHealth = (w: WireHealth): Health => ({
  status: w.status,
  version: w.version,
  engine: w.engine,
  debugBuild: w.debug_build,
  os: w.machine.os,
  arch: w.machine.arch,
  logicalCores: w.machine.logical_cores,
  backends: w.backends.map((b) => ({ id: toBackend(b.id), available: b.available, detail: b.detail, reason: b.reason })),
  runningJob: w.queue.running,
  queuedJobs: w.queue.queued,
  lastSimulation: w.last_simulation && { id: w.last_simulation.id, finishedAt: w.last_simulation.finished_at_ms },
});

const nodeId = (n: number | null) => (n === null ? null : String(n));

export const toBag = (w: WireBag): Baggage => ({
  id: String(w.id),
  passengerId: String(w.passenger_id),
  flightId: String(w.flight_id),
  redirected: w.redirected,
  currentLocation: nodeId(w.current_node),
  destination: nodeId(w.loading_node),
  status: w.status,
  priority: w.priority,
  arrivalTime: w.arrival_ms,
  deadlineTime: w.deadline_ms,
  departureTime: w.departure_ms,
  overdue: w.overdue,
  waitingTimeMs: w.wait_ms,
});

export const toBaggagePage = (w: WireBaggagePage): BaggagePage => ({
  page: w.page,
  pageSize: w.page_size,
  total: w.total,
  atMs: w.at_ms,
  counts: {
    total: w.counts.total,
    notArrived: w.counts.not_arrived,
    waiting: w.counts.waiting,
    inService: w.counts.in_service,
    travelling: w.counts.travelling,
    inSystem: w.counts.in_system,
    loadedOnTime: w.counts.loaded_on_time,
    delayed: w.counts.delayed,
  },
  items: w.items.map(toBag),
});

const toNode = (w: WireNode): AirportNode => ({
  id: String(w.id),
  name: w.name,
  type: w.type,
  x: w.x,
  y: w.y,
  capacity: w.capacity,
  queueLength: w.queue_length,
  processingRate: w.processing_rate_per_s,
  utilisation: w.utilisation,
  status: w.status,
  maxQueue: w.max_queue,
  averageWaitSeconds: w.avg_wait_s,
});

const toEdge = (w: WireEdge): AirportEdge => ({
  id: w.id,
  source: String(w.source),
  target: String(w.target),
  capacity: w.capacity,
  travelTime: w.travel_time_ms,
  trafficLoad: w.traffic_total,
  available: w.available,
});

export const toNetwork = (w: WireNetwork): AirportNetwork => ({
  atMs: w.at_ms,
  nodes: w.nodes.map(toNode),
  edges: w.edges.map(toEdge),
  statusRule: toStatusRule(w.status_rule),
});

const toBenchResult = (w: WireBenchRow, workloadSize: number): BenchmarkResult => ({
  backend: toBackend(w.backend),
  threads: w.threads,
  workloadSize,
  executionTimeMs: w.time_ms.median,
  timeStats: w.time_ms,
  throughput: w.throughput_bags_per_s,
  speedup: w.speedup,
  parallelEfficiency: w.parallel_efficiency_pct,
  efficiencyBaseline: w.efficiency_baseline === null ? null : toBackend(w.efficiency_baseline),
  outputMatchesSequential: w.output_identical_to_scalar,
  gpu: w.gpu && {
    device: w.gpu.device,
    copyInMs: w.gpu.copy_in_ms,
    kernelMs: w.gpu.kernel_ms,
    launchOverheadMs: w.gpu.launch_overhead_ms,
    copyOutMs: w.gpu.copy_out_ms,
    note: w.gpu.note,
  },
  memoryUsage: w.memory_usage_bytes,
});

export const toBenchMetrics = (w: WireBenchMetrics): BenchmarkMetrics => ({
  id: w.id,
  workloadSize: w.workload_size,
  repetitions: w.repetitions,
  warmup: w.warmup,
  results: w.results.map((r) => toBenchResult(r, w.workload_size)),
});

export const toStaticResult = (w: WireStaticRow): StaticResult => ({
  machine: w.machine,
  sourceFile: w.source_file,
  kind: w.kind,
  label: w.label,
  bags: w.bags,
  statistic: w.statistic,
  timeMs: w.time_ms,
  speedup: w.speedup,
  speedupBaseline: w.speedup_baseline,
  ranks: w.ranks,
  computeMs: w.compute_ms,
  outputIdentical: w.output_identical,
});
