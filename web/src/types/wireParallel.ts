// JSON of /api/parallel-runs and /api/static-results, as crates/bagflow-api serves it.
// Nothing outside services/ should import this file.

import type { WireJobStatus, WireProgress } from './wire'

export interface WireTask { id: number; worker: number; start_ms: number; end_ms: number; size: number }

export interface WireExecution {
  backend: string
  wall_ms: number
  samples_ms: number[]
  tasks: WireTask[]
  stages: { name: string; parallel: boolean; start_ms: number; end_ms: number }[]
  merge_ms: number | null
  workers: { worker: number; tasks: number; busy_ms: number; size: number }[]
  checksum: string
}

/** `GET /api/parallel-runs/:id/metrics`. */
export interface WireParallelMetrics {
  id: string
  config: { bag_count: number }
  workload: 'generate' | 'classify' | 'aggregate'
  backend: string
  /** `null` for GPU backends. */
  threads: number | null
  bags: number
  chunk: { unit: string; size: number }
  repetitions: number
  selected: WireExecution
  sequential: WireExecution
  speedup: number
  result_checksum: string
  sequential_checksum: string
  matches_sequential: boolean
  simd: { register_bits: number; lanes: number; lane_type: string; bags_per_iteration: number; note: string } | null
  gpu: {
    device: string | null
    copy_in_ms: number
    kernel_ms: number
    launch_overhead_ms: number
    copy_out_ms: number
    median_kernel_ms: number
    note: string
  } | null
  task_note: string
  output: Record<string, number>
  machine: { os: string; arch: string; logical_cores: number }
  debug_build: boolean
}

/** `GET /api/parallel-runs/:id`. */
export interface WireParallelJob {
  id: string
  status: WireJobStatus
  error: string | null
  progress: WireProgress | null
}

export interface WireStaticRow {
  machine: string
  source_file: string
  kind: 'kernel' | 'mpi'
  label: string
  bags: number
  statistic: string
  time_ms: number | null
  speedup: number | null
  speedup_baseline: string
  copy_in_ms: number | null
  copy_out_ms: number | null
  ranks: number | null
  load_ms: number | null
  compute_ms: number | null
  reduce_ms: number | null
  compute_speedup: number | null
  end_to_end_speedup: number | null
  output_identical: boolean | null
}
