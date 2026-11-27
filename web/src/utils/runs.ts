import type { SimulationConfig } from '../types/models'

export const describeSimulation = (c: SimulationConfig, int: (v: number) => string) =>
  `${c.scenario} · ${c.routing} · ${c.policy} · ${c.capacityPct}% · ×${c.serverMultiplier} · ${int(c.bagCount)} bags`
