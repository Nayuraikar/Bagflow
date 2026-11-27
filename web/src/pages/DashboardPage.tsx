import { BaselineRunner } from '../components/dashboard/BaselineRunner'
import { EngineStatus } from '../components/dashboard/EngineStatus'
import { KpiRow } from '../components/dashboard/KpiRow'
import { RecentRuns } from '../components/dashboard/RecentRuns'
import { PipelineOverview } from '../components/pipeline/PipelineOverview'
import { useApiState } from '../hooks/useHealth'
import { useHistory } from '../hooks/useHistory'
import type { SimulationRun } from '../types/models'

export function DashboardPage() {
  const history = useHistory()
  const offline = useApiState() === 'offline'
  const latest = history.data?.find((r): r is SimulationRun => r.kind === 'simulation' && r.status === 'done')
  const emptyText = offline
    ? 'API unreachable'
    : history.data
      ? 'No finished simulation yet. Run the baseline to fill these cards.'
      : history.error ? `The API returned an error: ${history.error.message}` : 'Loading…'
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Main Dashboard</h1>
      <EngineStatus />
      <BaselineRunner />
      <KpiRow run={latest} emptyText={emptyText} />
      <PipelineOverview run={latest} historyLoaded={history.data !== undefined} historyError={history.error} />
      <RecentRuns />
    </div>
  )
}
