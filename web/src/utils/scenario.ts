import type { Health, SimulationConfig } from '../types/models'
import { int } from './format'

/** Number fields are kept as typed. */
export interface ScenarioFormState {
  scenario: string
  routing: string
  policy: string
  capacityPct: string
  serverMultiplier: string
  bagCount: string
  threads: string
  classifyBackend: string
}

export const toSimulationConfig = (f: ScenarioFormState): SimulationConfig => ({
  scenario: f.scenario, routing: f.routing, policy: f.policy, capacityPct: Number(f.capacityPct),
  serverMultiplier: Number(f.serverMultiplier), bagCount: Number(f.bagCount), threads: Number(f.threads),
  classifyBackend: f.classifyBackend,
})

export function scenarioProblems(c: SimulationConfig, limits: Health['simulation']) {
  const out: string[] = []
  const check = (name: string, v: number, [lo, hi]: [number, number]) => {
    if (!(Number.isInteger(v) && v >= lo && v <= hi)) out.push(`${name} must be a whole number from ${int(lo)} to ${int(hi)}.`)
  }
  check('Bags', c.bagCount, limits.bagCount)
  check('Capacity %', c.capacityPct, limits.capacityPct)
  check('Server multiplier', c.serverMultiplier, limits.serverMultiplier)
  check('Threads', c.threads ?? NaN, limits.threads)
  return out
}
