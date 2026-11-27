import type { Health } from '../types/models'
import type { ParallelRequest, Workload } from '../types/parallel'
import { int } from './format'
import { takesThreads } from './telemetry'

export const WORKLOADS: Record<Workload, string> = {
  generate: 'Generate dataset',
  classify: 'Classify deadline risk',
  aggregate: 'Aggregate node stats',
}

/** Why the request cannot be sent, from the limits the API publishes. */
export function requestProblem(r: ParallelRequest, health: Health): string | null {
  const limits = health.parallel
  const check = (name: string, v: number, [lo, hi]: [number, number]) =>
    Number.isInteger(v) && v >= lo && v <= hi ? null : `${name} must be a whole number from ${int(lo)} to ${int(hi)}.`
  return (
    check('Bags', r.bagCount, r.workload === 'aggregate' ? limits.aggregateBagCount : limits.bagCount) ??
    (takesThreads(r.backend) ? check('Threads', r.threads, limits.threads) : null) ??
    check('Repetitions', r.repetitions, limits.repetitions)
  )
}
