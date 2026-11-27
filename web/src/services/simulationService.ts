import type { Simulation, SimulationConfig } from '../types/models'
import type { WireSimulation } from '../types/wire'
import { fromSimConfig, toSimulation } from './adapters'
import { postJson, request } from './http'

export const simulationPath = (id: string) => `/api/simulations/${encodeURIComponent(id)}`

export const createSimulation = (config: SimulationConfig) =>
  postJson<{ id: string }>('/api/simulations', fromSimConfig(config))

export const getSimulation = async (id: string): Promise<Simulation> =>
  toSimulation(await request<WireSimulation>(simulationPath(id)))
