import type { Health } from '../types/models'
import type { WireHealth } from '../types/wire'
import { toHealth } from './adapters'
import { request } from './http'

export const getHealth = async (): Promise<Health> => toHealth(await request<WireHealth>('/api/health'))
