// UI models for benchmark runs. Times are milliseconds.

import type { Machine } from './models'

export interface BenchRequest {
  bagCount: number
  backends: string[]
  /** Thread counts for the Rayon backends. */
  threads: number[]
  repetitions: number
  warmup: number
}

export interface Spread {
  mean: number
  median: number
  /** `null` with a single repetition. */
  std: number | null
  min: number
  max: number
}

export interface BenchRow {
  backend: string
  /** `null` for GPU backends. */
  threads: number | null
  /** `false` for baselines the API adds. */
  requested: boolean
  identical: boolean
  timeMs: Spread
  throughputBagsPerS: number
  speedup: number
  efficiencyPct: number | null
  efficiencyBaseline: string | null
  /** Median of each phase. */
  gpu: {
    device: string | null
    copyInMs: number
    kernelMs: number
    launchOverheadMs: number
    copyOutMs: number
    kernelOnlySpeedup: number
    note: string
  } | null
  /** `null`: the API does not measure it. */
  memoryBytes: number | null
}

export interface BenchMetrics {
  id: string
  workloadSize: number
  repetitions: number
  warmup: number
  machine: Machine
  debugBuild: boolean
  /** Computed from the workload size, not measured. */
  dataFootprintBytes: number
  rows: BenchRow[]
  definitions: Record<string, string>
}
