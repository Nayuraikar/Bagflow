import { useQuery } from '@tanstack/react-query'
import { getSweepJob, getSweepMetrics } from '../services/sweepService'
import { metricsQuery, useJob } from './useJob'

export const useSweep = (id: string | undefined) => useJob('sweep', id, getSweepJob, getSweepMetrics)

export const useSweepMetrics = (id: string | undefined) =>
  useQuery(metricsQuery(['sweep-metrics', id], () => getSweepMetrics(id!), id !== undefined))
