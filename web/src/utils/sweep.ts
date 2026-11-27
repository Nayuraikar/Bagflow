// Limit checks from the API's published limits, and the repeated-sweep noise rule.

import type { Health, SweepRun } from '../types/models'
import type { Experiment, SweepRequest } from '../types/sweep'
import { int } from './format'

/** The same sum the API checks: the 1-thread pass is added to the requested thread counts. */
export function sweepSize(r: SweepRequest) {
  const experiments = r.scenarios.length * r.routings.length * r.policies.length * r.capacityPcts.length
  const passes = new Set([1, ...r.threads]).size
  return { experiments, passes, simulatedBags: r.bagCount * experiments * passes }
}

export function sweepProblems(r: SweepRequest, limits: Health['sweep']): string[] {
  const out: string[] = []
  const inRange = (v: number, [lo, hi]: [number, number]) => Number.isInteger(v) && v >= lo && v <= hi
  const range = ([lo, hi]: [number, number]) => `whole numbers from ${int(lo)} to ${int(hi)}`
  if (!r.scenarios.length || !r.routings.length || !r.policies.length) out.push('Choose at least one scenario, routing and policy.')
  if (!r.capacityPcts.length || !r.capacityPcts.every((v) => inRange(v, limits.capacityPct))) out.push(`Capacity values must be ${range(limits.capacityPct)}.`)
  if (!inRange(r.serverMultiplier, limits.serverMultiplier)) out.push(`Server multiplier: ${range(limits.serverMultiplier)}.`)
  if (!inRange(r.bagCount, limits.bagCount)) out.push(`Bags: ${range(limits.bagCount)}.`)
  if (!r.threads.length || !r.threads.every((v) => inRange(v, limits.threads))) out.push(`Thread counts must be ${range(limits.threads)}.`)
  if (new Set(r.threads).size > limits.maxThreadCounts) out.push(`Too many thread counts: at most ${limits.maxThreadCounts}.`)
  if (out.length) return out
  const size = sweepSize(r)
  if (size.experiments > limits.maxExperiments) {
    out.push(`Sweep too large: ${int(size.experiments)} experiments; the limit is ${int(limits.maxExperiments)}.`)
  }
  if (size.simulatedBags > limits.maxSimulatedBags) {
    out.push(
      `Sweep too large: ${int(r.bagCount)} bags × ${int(size.experiments)} experiments × ${size.passes} passes = ` +
      `${int(size.simulatedBags)} bags; the limit is ${int(limits.maxSimulatedBags)}. Use fewer experiments, bags or thread counts.`,
    )
  }
  return out
}

/** Repeats whose wall times differ by more than this are called noisy. A display rule. */
export const NOISE_PCT = 10

/** For each thread count: the wall times of every saved sweep with the same settings. */
export function repeatSpread(runs: SweepRun[]) {
  const byThreads = new Map<number, number[]>()
  for (const r of runs) {
    for (const p of r.summary?.passes ?? []) byThreads.set(p.threads, [...(byThreads.get(p.threads) ?? []), p.wallMs])
  }
  return [...byThreads]
    .sort((a, b) => a[0] - b[0])
    .map(([threads, walls]) => {
      const min = Math.min(...walls)
      const max = Math.max(...walls)
      const spreadPct = walls.length > 1 ? (100 * (max - min)) / min : null
      return { threads, walls, min, max, spreadPct, noisy: spreadPct !== null && spreadPct > NOISE_PCT }
    })
}

export interface SweepForm {
  scenarios: string[]
  routings: string[]
  policies: string[]
  /** Comma-separated, as typed. */
  capacities: string
  threads: string
  serverMultiplier: string
  bagCount: string
}

const numbers = (text: string) => text.split(/[\s,]+/).filter(Boolean).map(Number)

export const toRequest = (f: SweepForm): SweepRequest => ({
  scenarios: f.scenarios,
  routings: f.routings,
  policies: f.policies,
  capacityPcts: [...new Set(numbers(f.capacities))],
  serverMultiplier: Number(f.serverMultiplier),
  bagCount: Number(f.bagCount),
  threads: [...new Set(numbers(f.threads))],
})

export const describeExperiment = (e: Experiment) => `${e.scenario} · ${e.routing} · ${e.policy} · ${e.capacityPct}%`
