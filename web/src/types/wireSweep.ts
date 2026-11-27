// JSON of /api/sweeps, as crates/bagflow-api serves it. Nothing outside services/ should import this.

import type { WireJobStatus, WireProgress } from './wire'

export interface WireSweepConfig {
  scenarios: string[]
  routings: string[]
  policies: string[]
  capacity_pcts: number[]
  server_multiplier: number
  bag_count: number
  threads: number[]
}

export interface WireExperimentRun {
  index: number
  worker: number
  start_ms: number
  end_ms: number
  status: 'completed' | 'failed'
}

/** `GET /api/sweeps/:id`. */
export interface WireSweepJob {
  id: string
  status: WireJobStatus
  error: string | null
  progress: (WireProgress & {
    /** Only while a pass is running. */
    detail?: {
      pass_index: number
      passes: number
      pass_threads: number
      experiments: number
      completed: number
      running: number
      failed: number
      active: { index: number; worker: number; start_ms: number }[]
      finished: WireExperimentRun[]
    }
  }) | null
}

/** `GET /api/sweeps/:id/metrics`. */
export interface WireSweepMetrics {
  id: string
  config: WireSweepConfig
  dataset: { bags_generated: number; checksum: string }
  experiments: {
    index: number
    scenario: string
    routing: string
    policy: string
    capacity_pct: number
    result: {
      bags_simulated: number
      delayed_bags: number
      delayed_pct: number
      mean_sojourn_s: number
      p95_sojourn_s: number
      max_queue: number
      engine_checksum: string
    } | null
    error: string | null
  }[]
  passes: {
    threads: number
    is_baseline: boolean
    requested: boolean
    wall_ms: number
    speedup: number
    efficiency_pct: number
    time_saved_ms: number
    completed: number
    failed: number
    identical_to_one_thread: boolean | null
    mismatches: number[]
    workers: { worker: number; experiments: number; busy_ms: number }[]
    runs: (WireExperimentRun & { error: string | null; engine_checksum: string | null })[]
  }[]
  consistency: { checked: boolean; compared_runs: number; all_identical: boolean | null }
  prepare_ms: number
  machine: { os: string; arch: string; logical_cores: number }
  debug_build: boolean
  definitions: Record<string, string>
}
