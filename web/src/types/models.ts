// Frontend-facing models (docs/design/blueprint.md), extended where the real engine differs.
// The Rust wire format is mapped to these in services/. `null` means unavailable and renders as "--".

/** Where a number comes from. */
export type Provenance = "real" | "static" | "simplified";

export type BaggageStatus =
  | "CHECKED_IN" | "IDENTIFIED" | "SCREENING" | "CLEARED" | "IN_TRANSIT" | "SORTED"
  | "TRANSFER_PENDING" | "LOADING" | "LOADED" | "DELAYED" | "MISROUTED" | "HELD_FOR_INSPECTION";

/** SEQUENTIAL is the scalar kernel. The rest are the other kernel backends BagFlow has. */
export type BackendType =
  | "SEQUENTIAL" | "ILP" | "NEON" | "AVX2" | "OPENMP"
  | "RAYON_ILP" | "RAYON_NEON" | "RAYON_AVX2"
  | "METAL" | "CUDA_NAIVE" | "CUDA_WARP" | "CUDA_PTX" | "MPI";

export interface Baggage {
  id: string;
  passengerId: string;
  /** The bag's original flight, also when SorterOverload redirected it. */
  flightId: string;
  redirected: boolean;
  /** `null` while travelling or before arrival. */
  currentLocation: string | null;
  /** A loading area. The engine has no destination airports. */
  destination: string | null;
  /** `null` before the bag arrives. */
  status: BaggageStatus | null;
  priority: string;
  arrivalTime: number;
  deadlineTime: number;
  departureTime: number | null;
  overdue: boolean;
  waitingTimeMs: number;
}

/** State of every bag at the playback time, or at the end of the run. */
export interface BaggageCounts {
  total: number;
  notArrived: number;
  waiting: number;
  inService: number;
  travelling: number;
  inSystem: number;
  loadedOnTime: number;
  delayed: number;
}

export interface BaggagePage {
  page: number;
  pageSize: number;
  total: number;
  atMs: number | null;
  counts: BaggageCounts;
  items: Baggage[];
}

/** Computed by an API display rule from engine samples; the engine itself has no status. */
export type FacilityStatus = "normal" | "high" | "congested" | "offline";

export interface StatusRule {
  source: string;
  windowSamples: number;
  highAt: number;
  congestedAt: number;
}

export interface AirportNode {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  /** Parallel servers. */
  capacity: number;
  /** Only with a playback time. */
  queueLength: number | null;
  /** Nominal: servers / base mean service. Not a measured throughput. */
  processingRate: number;
  utilisation: number | null;
  status: FacilityStatus | null;
  maxQueue: number;
  averageWaitSeconds: number;
}

export interface AirportEdge {
  id: string;
  source: string;
  target: string;
  /** The engine does not enforce edge capacity. */
  capacity: number | null;
  travelTime: number;
  /** Total over the whole run. */
  trafficLoad: number;
  available: boolean;
}

export interface AirportNetwork {
  atMs: number | null;
  nodes: AirportNode[];
  edges: AirportEdge[];
  statusRule: StatusRule;
}

export interface SimulationMetrics {
  totalBags: number;
  processedBags: number;
  /** 0 for a finished run; use BaggageCounts at a playback time. */
  inTransit: number;
  delayedBags: number;
  loadedOnTime: number;
  /** Total queue wait per bag, seconds. */
  averageWaitingTime: number;
  /** Fraction, 0 to 1. */
  onTimeLoadingRate: number;
  delayedPct: number;
  congestedFacilities: number;
  maxQueue: number;
  endMs: number | null;
}

export interface SimulationConfig {
  scenario: string;
  routing: string;
  policy: string;
  capacityPct: number;
  serverMultiplier: number;
  bagCount: number;
}

export interface BenchmarkConfig {
  bagCount: number;
  backends: string[];
  threads: number[];
  repetitions: number;
  warmup: number;
}

export interface TimeStats {
  mean: number;
  median: number;
  std: number | null;
  min: number;
  max: number;
}

export interface GpuPhases {
  device: string | null;
  copyInMs: TimeStats;
  kernelMs: TimeStats;
  launchOverheadMs: TimeStats;
  copyOutMs: TimeStats;
  note: string;
}

export interface BenchmarkResult {
  backend: BackendType;
  /** `null` for GPU backends. */
  threads: number | null;
  workloadSize: number;
  /** Median end-to-end time. */
  executionTimeMs: number;
  timeStats: TimeStats;
  /** Bags per second. */
  throughput: number;
  /** Median scalar time / median time. */
  speedup: number;
  /** Percent, against one thread of the same kernel. Thread backends only. */
  parallelEfficiency: number | null;
  efficiencyBaseline: BackendType | null;
  outputMatchesSequential: boolean;
  gpu: GpuPhases | null;
  /** Never measured. */
  memoryUsage: number | null;
}

export interface BenchmarkMetrics {
  id: string;
  workloadSize: number;
  repetitions: number;
  warmup: number;
  results: BenchmarkResult[];
}

/** A saved measurement from results/*.txt. Always Static. */
export interface StaticResult {
  machine: string;
  sourceFile: string;
  kind: "kernel" | "mpi";
  label: string;
  bags: number;
  statistic: string;
  timeMs: number | null;
  speedup: number | null;
  speedupBaseline: string;
  ranks: number | null;
  computeMs: number | null;
  outputIdentical: boolean | null;
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface JobProgress {
  status: JobStatus;
  phase: string;
  done: number;
  total: number;
  error: string | null;
}

interface RunBase {
  id: string;
  status: JobStatus;
  createdAt: number;
  finishedAt: number | null;
  configHash: string;
  error: string | null;
  progress: JobProgress | null;
  /** Whether bag histories and time-series are still in the server's memory. */
  retained: boolean;
}

export interface SimulationRun extends RunBase {
  kind: "simulation";
  config: SimulationConfig;
  summary: SimulationMetrics | null;
}

export interface BenchmarkRun extends RunBase {
  kind: "benchmark";
  config: BenchmarkConfig;
}

export type RunRecord = SimulationRun | BenchmarkRun;

export interface BackendAvailability {
  id: BackendType;
  available: boolean;
  detail: string | null;
  reason: string | null;
}

export interface Health {
  status: string;
  version: string;
  engine: string;
  debugBuild: boolean;
  os: string;
  arch: string;
  logicalCores: number;
  backends: BackendAvailability[];
  runningJob: string | null;
  queuedJobs: number;
  lastSimulation: { id: string; finishedAt: number | null } | null;
}
