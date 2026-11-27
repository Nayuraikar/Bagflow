import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ApiError } from '../services/http'
import { getBag, getBaggage, getNetwork, getRunMetrics } from '../services/runService'
import type { BagQuery } from '../types/ops'

/** The API keeps bag histories and time-series for the most recent runs only. */
export const isExpired = (e: unknown) => e instanceof ApiError && e.code === 'run_not_retained'

// a finished run never changes; only an unanswered request is worth repeating
const FINISHED = {
  staleTime: Infinity,
  refetchInterval: (q: { state: { data?: unknown; error: Error | null } }) =>
    q.state.data || isExpired(q.state.error) ? (false as const) : 4000,
}

export const useRunMetrics = (id: string | undefined) =>
  useQuery({ queryKey: ['run-metrics', id], queryFn: () => getRunMetrics(id!), enabled: id !== undefined, ...FINISHED })

export const useNetwork = (id: string | undefined) =>
  useQuery({ queryKey: ['network', id], queryFn: () => getNetwork(id!), enabled: id !== undefined, gcTime: 60_000, ...FINISHED })

export const useBaggage = (id: string, q: BagQuery) =>
  useQuery({ queryKey: ['baggage', id, q], queryFn: () => getBaggage(id, q), placeholderData: keepPreviousData, ...FINISHED })

export const useBag = (id: string, bag: number | null, atMs: number | undefined) =>
  useQuery({ queryKey: ['bag', id, bag, atMs], queryFn: () => getBag(id, bag!, atMs), enabled: bag !== null, ...FINISHED })
