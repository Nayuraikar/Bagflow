// JSON exactly as crates/bagflow-api serves it. Only the fields this app reads are listed.
// Nothing outside services/ should import this file.

import type { WireSweepConfig } from './wireSweep'

export type WireJobStatus = 'queued' | 'running' | 'done' | 'failed'

export interface WireHealth {
  status: string
  version: string
  engine: string
  debug_build: boolean
  machine: { os: string; arch: string; logical_cores: number }
  backends: {
    id: string
    available: boolean
    detail: string | null
    reason: string | null
    takes_threads: boolean
    gpu: boolean
  }[]
  queue: { running: string | null; queued: number; max_queued: number }
  last_simulation: { id: string; finished_at_ms: number | null } | null
  options: {
    scenarios: string[]
    routings: string[]
    policies: string[]
    sweep_defaults: WireSweepConfig
    sweep_limits: {
      bag_count: [number, number]
      capacity_pct: [number, number]
      server_multiplier: [number, number]
      threads: [number, number]
      max_thread_counts: number
      max_experiments: number
      max_simulated_bags: number
    }
    benchmark_limits: {
      bag_count: [number, number]
      repetitions: [number, number]
      warmup: [number, number]
      threads: [number, number]
    }
    parallel_workloads: { id: string; backends: string[]; chunk_unit: string }[]
    parallel_limits: {
      bag_count: [number, number]
      aggregate_bag_count: [number, number]
      repetitions: [number, number]
      threads: [number, number]
    }
  }
}

/** Data of the `progress`, `done` and `failed` server-sent events, and `progress` on a job record. */
export interface WireProgress {
  status: WireJobStatus
  phase: string
  done: number
  total: number
  error: string | null
}

export interface WireSimConfig {
  scenario: string
  routing: string
  policy: string
  capacity_pct: number
  server_multiplier: number
  bag_count: number
  /** Absent on records saved before these fields existed. */
  threads?: number
  classify_backend?: string
}

export interface WireSimSummary {
  total_bags: number
  loaded_on_time: number
  delayed_bags: number
  delayed_pct: number
  on_time_loading_rate: number
  congested_facilities: number
}

export interface WireSweepSummary {
  experiment_count: number
  passes: { threads: number; wall_ms: number; speedup: number }[]
  consistency: { checked: boolean; compared_runs: number; all_identical: boolean | null }
}

export interface WireParallelSummary {
  workload: string
  backend: string
  threads: number | null
  bags: number
  wall_ms: number
  speedup: number
  matches_sequential: boolean
}

export interface WireBenchSummary {
  workload_size: number
  results: {
    backend: string
    threads: number | null
    median_ms: number
    speedup: number | null
    output_identical_to_scalar: boolean
  }[]
}

interface WireRecordBase {
  id: string
  status: WireJobStatus
  created_at_ms: number
  started_at_ms: number | null
  finished_at_ms: number | null
  config_hash: string
  error: string | null
  progress: WireProgress | null
  retained: boolean
}

export type WireHistoryItem = WireRecordBase &
  (
    | { kind: 'simulation'; config: WireSimConfig; summary: WireSimSummary | null }
    | { kind: 'sweep'; config: { bag_count: number }; summary: WireSweepSummary | null }
    | { kind: 'parallel'; config: { workload: string; bag_count: number }; summary: WireParallelSummary | null }
    | { kind: 'benchmark'; config: { bag_count: number; backends: string[] }; summary: WireBenchSummary | null }
  )

export interface WirePhase {
  id: 'generate' | 'classify' | 'simulate' | 'aggregate'
  name: string
  has_parallel_implementation: boolean
  backend: string
  /** `null` for GPU backends. */
  threads: number | null
  time_ms: number
  samples_ms: number[]
  baseline: { backend: string; threads: number; time_ms: number; samples_ms: number[] } | null
  speedup: number | null
  identical_to_baseline: boolean | null
  bags: number
  /** `simulate` only. */
  why_sequential?: string
  /** `aggregate` only. */
  verified_against_engine?: boolean
}

export interface WirePipeline {
  workload: { bags_generated: number; bags_simulated: number }
  threads: number
  machine: { os: string; arch: string; logical_cores: number }
  debug_build: boolean
  phases: WirePhase[]
  other_sequential: { time_ms: number; scenario_setup_ms: number; summarise_ms: number }
  full: { baseline_ms: number; parallel_ms: number; speedup: number }
  amdahl: {
    parallelisable_fraction: number
    sequential_fraction: number
    max_speedup: number
    eligible_phases_speedup: number
  }
}

/** `GET /api/simulations/:id`. The result fields are `null` until the job is done. */
export interface WireSimulation extends WireRecordBase {
  kind: 'simulation'
  config: WireSimConfig
  engine_checksum: string | null
  summary: WireSimSummary | null
  pipeline: WirePipeline | null
}
