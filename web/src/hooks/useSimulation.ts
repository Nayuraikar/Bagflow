import { useQuery } from '@tanstack/react-query'
import { getSimulation } from '../services/simulationService'

/** A finished run never changes, so it is fetched once. */
export const useSimulation = (id: string | undefined) =>
  useQuery({
    queryKey: ['simulation', id],
    queryFn: () => getSimulation(id!),
    enabled: id !== undefined,
    staleTime: Infinity,
    refetchInterval: (q) => (q.state.data ? false : 4000),
  })
