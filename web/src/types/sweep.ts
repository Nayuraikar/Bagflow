// UI models for sweeps. Run times are milliseconds since the start of their own pass.

import type { Machine } from './models'
import type { ParallelJob } from './parallel'

export interface SweepRequest {
  scenarios: string[]
  routings: string[]
  policies: string[]
  capacityPcts: number[]
  serverMultiplier: number
  bagCount: number
  /** Thread counts to measure. The API always runs a 1-thread pass first. */
  threads: number[]
}

export interface ExperimentRun {
  index: number
  worker: number
  startMs: number
  endMs: number
  status: 'completed' | 'failed'
}

export interface PassRun extends ExperimentRun {
  error: string | null
  engineChecksum: string | null
}

export interface SweepPass {
  threads: number
  isBaseline: boolean
  /** Whether the thread count was in the request (the 1-thread pass is added anyway). */
  requested: boolean
  wallMs: number
  speedup: number
  efficiencyPct: number
  /** 1-thread wall time minus this one; negative when slower. */
  timeSavedMs: number
  completed: number
  failed: number
  /** `null` on the baseline. */
  identical: boolean | null
  mismatches: number[]
  workers: { worker: number; experiments: number; busyMs: number }[]
  runs: PassRun[]
}

export interface Experiment {
  index: number
  scenario: string
  routing: string
  policy: string
  capacityPct: number
  result: {
    bagsSimulated: number
    delayedBags: number
    delayedPct: number
    meanSojournS: number
    p95SojournS: number
    maxQueue: number
    engineChecksum: string
  } | null
  error: string | null
}

export interface SweepMetrics {
  id: string
  config: SweepRequest
  bagsGenerated: number
  datasetChecksum: string
  experiments: Experiment[]
  passes: SweepPass[]
  consistency: { checked: boolean; comparedRuns: number; allIdentical: boolean | null }
  prepareMs: number
  machine: Machine
  debugBuild: boolean
  definitions: Record<string, string>
}

/** The running pass, as the API reports it while the job runs. */
export interface SweepLive {
  passIndex: number
  passes: number
  passThreads: number
  experiments: number
  completed: number
  running: number
  failed: number
  active: { index: number; worker: number; startMs: number }[]
  finished: ExperimentRun[]
}

export type SweepJob = ParallelJob & { live: SweepLive | null }
