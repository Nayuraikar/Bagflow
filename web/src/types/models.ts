// What the UI works with. services/adapters.ts builds these from the wire types.

import type { SweepRequest } from './sweep'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export interface Backend {
  id: string
  available: boolean
  detail: string | null
  reason: string | null
  gpu: boolean
}

export interface Machine {
  os: string
  arch: string
  logicalCores: number
}

export interface Health {
  version: string
  engine: string
  debugBuild: boolean
  machine: Machine
  backends: Backend[]
  queue: { runningJobId: string | null; queued: number; maxQueued: number }
  lastSimulation: { id: string; finishedAt: number | null } | null
  parallel: {
    workloads: { id: string; backends: string[]; chunkUnit: string }[]
    bagCount: [number, number]
    aggregateBagCount: [number, number]
    repetitions: [number, number]
    threads: [number, number]
  }
  simulation: {
    bagCount: [number, number]
    capacityPct: [number, number]
    serverMultiplier: [number, number]
    threads: [number, number]
  }
  simulationDefaults: SimulationConfig
  sweep: {
    scenarios: string[]
    routings: string[]
    policies: string[]
    defaults: SweepRequest
    bagCount: [number, number]
    capacityPct: [number, number]
    serverMultiplier: [number, number]
    threads: [number, number]
    maxThreadCounts: number
    maxExperiments: number
    maxSimulatedBags: number
  }
  benchmark: {
    bagCount: [number, number]
    repetitions: [number, number]
    warmup: [number, number]
    threads: [number, number]
  }
}

export interface JobProgress {
  status: JobStatus
  phase: string
  done: number
  total: number
  error: string | null
}

export interface SimulationConfig {
  scenario: string
  routing: string
  policy: string
  capacityPct: number
  serverMultiplier: number
  bagCount: number
  /** Left to the API's defaults when absent. */
  threads?: number
  classifyBackend?: string
}

export interface SimulationSummary {
  totalBags: number
  loadedOnTime: number
  delayedBags: number
  delayedPct: number
  onTimeLoadingRate: number
  congestedFacilities: number
}

export interface SweepSummary {
  experimentCount: number
  passes: { threads: number; wallMs: number; speedup: number }[]
  consistency: { checked: boolean; comparedRuns: number; allIdentical: boolean | null }
}

export interface ParallelSummary {
  workload: string
  backend: string
  threads: number | null
  bags: number
  wallMs: number
  speedup: number
  matchesSequential: boolean
}

export interface BenchmarkSummary {
  workloadSize: number
  results: { backend: string; threads: number | null; medianMs: number; speedup: number | null; identical: boolean }[]
}

interface RunBase {
  id: string
  status: JobStatus
  createdAt: number
  finishedAt: number | null
  error: string | null
  /** Simulations only: whether bag histories and time-series are still in memory. */
  retained: boolean
}

export type SimulationRun = RunBase & { kind: 'simulation'; config: SimulationConfig; summary: SimulationSummary | null }
/** `configHash` is equal for sweeps with the same settings. */
export type SweepRun = RunBase & { kind: 'sweep'; configHash: string; bagCount: number; config: SweepRequest; summary: SweepSummary | null }
export type ParallelRun = RunBase & {
  kind: 'parallel'
  workload: string
  bagCount: number
  /** As requested, so a job can be recognised before it finishes. */
  request: { backend: string; threads: number; repetitions: number; chunkSize: number }
  summary: ParallelSummary | null
}
export type BenchmarkRun = RunBase & { kind: 'benchmark'; backends: string[]; bagCount: number; summary: BenchmarkSummary | null }
export type Run = SimulationRun | SweepRun | ParallelRun | BenchmarkRun

export type PhaseId = 'generate' | 'classify' | 'simulate' | 'aggregate'

export interface PipelinePhase {
  id: PhaseId
  name: string
  backend: string
  threads: number | null
  bags: number
  /** The parallel time where there is a parallel implementation, else the only time. */
  timeMs: number
  repetitions: number
  /** The timed repetitions behind `timeMs`. */
  samplesMs: number[]
  /** `null` when the phase has no parallel implementation. */
  comparison: { sequentialBackend: string; sequentialMs: number; sequentialSamplesMs: number[]; speedup: number; identical: boolean } | null
  whySequential: string | null
  verifiedAgainstEngine: boolean | null
}

export interface Pipeline {
  threads: number
  machine: Machine
  debugBuild: boolean
  bagsGenerated: number
  bagsSimulated: number
  phases: PipelinePhase[]
  otherSequentialMs: number
  /** Sums of phase times, not end-to-end timings. */
  full: { baselineMs: number; parallelMs: number; speedup: number }
  amdahl: { parallelFraction: number; sequentialFraction: number; maxSpeedup: number; eligibleSpeedup: number }
}

export interface Simulation {
  id: string
  status: JobStatus
  finishedAt: number | null
  config: SimulationConfig
  classifyBackend: string | null
  engineChecksum: string | null
  summary: SimulationSummary | null
  /** `null` until done, and on runs saved before the pipeline was measured. */
  pipeline: Pipeline | null
  progress: JobProgress | null
  error: string | null
}
