import { useSearchParams } from 'react-router'
import type { BenchmarkRun } from '../types/models'
import { useBenchmark } from './useBenchmark'
import { useHistory } from './useHistory'

/** The benchmark in the URL, else one in progress, else the newest finished one. */
export function useSelectedBenchmark() {
  const history = useHistory()
  const [params, setParams] = useSearchParams()
  const runs = history.data?.filter((r): r is BenchmarkRun => r.kind === 'benchmark') ?? []
  const runId = params.get('run')
    ?? (runs.find((r) => r.status === 'queued' || r.status === 'running') ?? runs.find((r) => r.status === 'done'))?.id
  return { history, runs, runId, open: (id: string) => setParams({ run: id }, { replace: true }), ...useBenchmark(runId) }
}
