import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../services/healthService'

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: getHealth, refetchInterval: 3000 })

export type ApiState = 'checking' | 'online' | 'offline'

/** Whether the latest health request got through. */
export function useApiState(): ApiState {
  const q = useHealth()
  // compare timestamps: while a query without data refetches, TanStack Query clears its error
  if (q.errorUpdatedAt > q.dataUpdatedAt) return 'offline'
  return q.data ? 'online' : 'checking'
}
