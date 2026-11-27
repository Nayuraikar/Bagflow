import { getBenchJob, getBenchMetrics } from '../services/benchService'
import { useJob } from './useJob'

export const useBenchmark = (id: string | undefined) => useJob('benchmark', id, getBenchJob, getBenchMetrics)
