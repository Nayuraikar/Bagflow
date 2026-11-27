import { createContext, useContext } from 'react'
import type { SimulationConfig } from '../types/models'
import type { WatchedJob } from './useJobProgress'

export interface BaselineJob {
  /** The simulation being followed: queued or running. */
  activeId: string | null
  active: WatchedJob
  /** How the last followed job ended, until the next submission. */
  outcome: { id: string; result: 'done' | 'failed' | 'lost'; error: string | null } | null
  submitting: boolean
  submitError: Error | null
  /** Does nothing while a simulation is already followed. */
  submit: (config: SimulationConfig, onCreated?: (id: string) => void) => void
}

export const JobContext = createContext<BaselineJob | null>(null)

export function useBaselineJob(): BaselineJob {
  const job = useContext(JobContext)
  if (!job) throw new Error('useBaselineJob needs JobProvider')
  return job
}
