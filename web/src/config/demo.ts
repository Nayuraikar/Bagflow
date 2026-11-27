// The settings of the Guided Demo (docs/design/parallel-studio.md §6). These are inputs only:
// every figure the demo shows comes back from the API.

import type { Health, SimulationConfig } from '../types/models'
import type { ParallelRequest } from '../types/parallel'
import type { SweepRequest } from '../types/sweep'

export const STEPS = [
  { id: 'problem', title: 'Problem', subtitle: 'Airport congestion' },
  { id: 'workload', title: 'Workload', subtitle: 'Generate a large dataset' },
  { id: 'kernel', title: 'Parallel kernel', subtitle: 'Scalar vs accelerated' },
  { id: 'simulation', title: 'Simulation', subtitle: 'Movement, queues, deadlines' },
  { id: 'sweep', title: 'Experiment sweep', subtitle: 'Many scenarios at once' },
  { id: 'results', title: 'Results', subtitle: 'What parallelism gave' },
] as const

export type StepId = (typeof STEPS)[number]['id']
export type RunStepId = Exclude<StepId, 'results'>

const simulation = (routing: string, capacityPct: number): SimulationConfig => ({
  scenario: 'Normal', routing, policy: 'fcfs', capacityPct, serverMultiplier: 1, bagCount: 250_000,
})

/** Fewer servers than the baseline, so that queues build up. A stress setting, not a real airport. */
export const PROBLEM_CONFIG = simulation('congestion', 70)
/** The Dashboard's baseline run. */
export const BASELINE_CONFIG = simulation('dijkstra', 100)

const BATCH_BAGS = 10_000_000
/**
 * Flights per generation task. The generator works in batches of 2,048 flights, and the API's default
 * chunk for this size is so large that a batch holds two tasks, which leaves most threads idle.
 */
const GENERATE_CHUNK_FLIGHTS = 64
/** In order of preference; the first one this machine has is used. */
const ACCELERATED = ['rayon-neon', 'rayon-avx2', 'rayon', 'openmp']

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v))

export function demoRequests(health: Health) {
  const { parallel, sweep, machine } = health
  const threads = clamp(machine.logicalCores, parallel.threads)
  const bagCount = clamp(BATCH_BAGS, parallel.bagCount)
  const classify = parallel.workloads.find((w) => w.id === 'classify')?.backends ?? []
  const accelerated = ACCELERATED.find((b) => classify.includes(b))
  const generate: ParallelRequest = {
    workload: 'generate', backend: 'rayon', threads, bagCount, repetitions: clamp(5, parallel.repetitions),
    chunkSize: GENERATE_CHUNK_FLIGHTS,
  }
  const kernel: ParallelRequest | null = accelerated
    ? { workload: 'classify', backend: accelerated, threads, bagCount, repetitions: clamp(10, parallel.repetitions) }
    : null
  const grid: SweepRequest = { ...sweep.defaults, threads: [clamp(machine.logicalCores, sweep.threads)] }
  return { generate, kernel, sweep: grid }
}
