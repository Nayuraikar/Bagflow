import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ApiError } from '../services/http'
import { getParallelJob, getParallelMetrics, getStaticResults } from '../services/parallelService'
import type { ParallelMetrics } from '../types/parallel'
import type { ParallelRun } from '../types/models'
import { useHistory } from './useHistory'

const POLL_MS = 500

const metricsQuery = (id: string | undefined, enabled: boolean) => ({
  queryKey: ['parallel-metrics', id],
  queryFn: () => getParallelMetrics(id!),
  enabled: enabled && id !== undefined,
  // a finished run never changes
  staleTime: Infinity,
  refetchInterval: (q: { state: { data?: unknown } }) => (q.state.data ? (false as const) : 4000),
})

/** One job: its state while queued or running, and its metrics once done. */
export function useParallelExecution(id: string | undefined) {
  const client = useQueryClient()
  const job = useQuery({
    queryKey: ['parallel-job', id],
    queryFn: () => getParallelJob(id!),
    enabled: id !== undefined,
    refetchInterval: (q) => {
      if (q.state.error instanceof ApiError && q.state.error.code === 'not_found') return false
      const status = q.state.data?.status
      return status === 'done' || status === 'failed' ? false : POLL_MS
    },
  })
  const status = job.data?.status
  useEffect(() => {
    if (status === 'done' || status === 'failed') void client.invalidateQueries({ queryKey: ['history'] })
  }, [status, client])
  const metrics = useQuery(metricsQuery(id, status === 'done'))
  return { job, metrics }
}

const isDoneParallel = (r: { kind: string; status: string }): r is ParallelRun => r.kind === 'parallel' && r.status === 'done'

/** The newest finished run per backend that passes `keep`, with its full metrics. */
export function useLatestRunsByBackend(keep: (run: ParallelRun) => boolean) {
  const history = useHistory()
  const latest = new Map<string, ParallelRun>()
  for (const r of history.data ?? []) {
    if (isDoneParallel(r) && r.summary && keep(r) && !latest.has(r.summary.backend)) latest.set(r.summary.backend, r)
  }
  const runs = [...latest.values()]
  const results = useQueries({ queries: runs.map((r) => metricsQuery(r.id, true)) })
  const byBackend = new Map<string, ParallelMetrics>()
  for (const q of results) if (q.data) byBackend.set(q.data.backend, q.data)
  return { byBackend, loaded: history.data !== undefined, error: history.error }
}

export const useStaticResults = () =>
  useQuery({
    queryKey: ['static-results'],
    queryFn: getStaticResults,
    staleTime: Infinity,
    refetchInterval: (q) => (q.state.data ? false : 4000),
  })
