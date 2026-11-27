// UI models for parallel-run telemetry and saved results. Task and stage times are milliseconds
// since the start of the timed execution.

import type { JobProgress, JobStatus, Machine } from './models'

export type Workload = 'generate' | 'classify' | 'aggregate'

export interface ParallelRequest {
  workload: Workload
  backend: string
  threads: number
  bagCount: number
  repetitions: number
}

export interface Task {
  id: number
  worker: number
  startMs: number
  endMs: number
  /** Bags covered (for `generate`: bags produced). */
  size: number
}

export interface Stage {
  name: string
  parallel: boolean
  startMs: number
  endMs: number
}

export interface Worker {
  worker: number
  tasks: number
  busyMs: number
  size: number
}

/** The median-wall repetition of one side. */
export interface Execution {
  backend: string
  wallMs: number
  samplesMs: number[]
  /** Empty when the backend reports no per-task times (GPU). */
  tasks: Task[]
  stages: Stage[]
  mergeMs: number | null
  /** Only workers that ran at least one task. */
  workers: Worker[]
  checksum: string
}

export interface Simd {
  registerBits: number
  lanes: number
  laneType: string
  bagsPerIteration: number
  note: string
}

export interface Gpu {
  device: string | null
  copyInMs: number
  kernelMs: number
  /** Encode, launch and wait beyond the kernel itself. */
  launchOverheadMs: number
  copyOutMs: number
  medianKernelMs: number
  note: string
}

export interface ParallelMetrics {
  id: string
  workload: Workload
  backend: string
  threads: number | null
  bags: number
  requestedBags: number
  chunk: { unit: string; size: number }
  repetitions: number
  selected: Execution
  sequential: Execution
  speedup: number
  resultChecksum: string
  sequentialChecksum: string
  /** Every timed repetition on both sides. */
  matchesSequential: boolean
  simd: Simd | null
  gpu: Gpu | null
  taskNote: string
  output: Record<string, number>
  machine: Machine
  debugBuild: boolean
}

export interface ParallelJob {
  id: string
  status: JobStatus
  error: string | null
  progress: JobProgress | null
}

export interface StaticRow {
  machine: string
  sourceFile: string
  kind: 'kernel' | 'mpi'
  label: string
  bags: number
  statistic: string
  timeMs: number | null
  speedup: number | null
  speedupBaseline: string
  copyInMs: number | null
  copyOutMs: number | null
  ranks: number | null
  loadMs: number | null
  computeMs: number | null
  reduceMs: number | null
  computeSpeedup: number | null
  endToEndSpeedup: number | null
  outputIdentical: boolean | null
}
