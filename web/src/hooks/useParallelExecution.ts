import { useQueries, useQuery } from '@tanstack/react-query'
import { getParallelJob, getParallelMetrics, getStaticResults } from '../services/parallelService'
import type { ParallelMetrics } from '../types/parallel'
import type { ParallelRun } from '../types/models'
import { useHistory } from './useHistory'
import { metricsQuery, useJob } from './useJob'

export const useParallelExecution = (id: string | undefined) => useJob('parallel', id, getParallelJob, getParallelMetrics)

const isDoneParallel = (r: { kind: string; status: string }): r is ParallelRun => r.kind === 'parallel' && r.status === 'done'

/** The newest finished run per backend that passes `keep`, with its full metrics. */
export function useLatestRunsByBackend(keep: (run: ParallelRun) => boolean) {
  const history = useHistory()
  const latest = new Map<string, ParallelRun>()
  for (const r of history.data ?? []) {
    if (isDoneParallel(r) && r.summary && keep(r) && !latest.has(r.summary.backend)) latest.set(r.summary.backend, r)
  }
  const runs = [...latest.values()]
  const results = useQueries({
    queries: runs.map((r) => metricsQuery(['parallel-metrics', r.id], () => getParallelMetrics(r.id), true)),
  })
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
