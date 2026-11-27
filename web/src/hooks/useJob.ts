import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ApiError } from '../services/http'
import type { ParallelJob } from '../types/parallel'

const POLL_MS = 500

export const metricsQuery = <M>(key: QueryKey, fetch: () => Promise<M>, enabled: boolean) => ({
  queryKey: key,
  queryFn: fetch,
  enabled,
  // a finished run never changes
  staleTime: Infinity,
  refetchInterval: (q: { state: { data?: unknown } }) => (q.state.data ? (false as const) : 4000),
})

/** One job of any kind: its state while queued or running, and its metrics once done. */
export function useJob<J extends ParallelJob, M>(
  kind: string,
  id: string | undefined,
  getJob: (id: string) => Promise<J>,
  getMetrics: (id: string) => Promise<M>,
) {
  const client = useQueryClient()
  const job = useQuery({
    queryKey: [`${kind}-job`, id],
    queryFn: () => getJob(id!),
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
  const metrics = useQuery(metricsQuery([`${kind}-metrics`, id], () => getMetrics(id!), id !== undefined && status === 'done'))
  return { job, metrics }
}
