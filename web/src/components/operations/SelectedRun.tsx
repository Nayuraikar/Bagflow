// The frame of the Operations pages: which run is shown, and what is wrong with it.

import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useSelectedRun } from '../../hooks/runSelection'
import { useApiState } from '../../hooks/useHealth'
import { useRunMetrics } from '../../hooks/useRunData'
import type { Run, SimulationRun } from '../../types/models'
import type { RunMetrics } from '../../types/ops'
import { EMPTY, int } from '../../utils/format'
import { describeSimulation } from '../../utils/runs'
import { Card } from '../common/Card'
import { DataState } from '../common/DataState'
import { RunPicker } from '../common/RunPicker'
import { StatusLabel } from '../common/StatusLabel'
import { SaturationBanner } from './SaturationBanner'

const describe = (r: Run) => describeSimulation((r as SimulationRun).config, int)

/** The run selector and the saturation warning, for any Operations page. */
export function SelectedRunBar() {
  const { finished, id, run, choose } = useSelectedRun()
  const offline = useApiState() === 'offline'
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <RunPicker label="Selected simulation" runs={finished} value={id} onChange={choose} describe={describe} />
        {run?.status === 'done' && <StatusLabel status="Real" />}
        {offline && run && <span className="text-sm text-critical">API unreachable. Values on screen were loaded earlier.</span>}
      </div>
      {run && <SaturationBanner run={run} />}
    </div>
  )
}

/** Why there is no run to show. `null` when `run` is finished. */
function RunProblem({ run, id, loaded, error }: { run: SimulationRun | undefined; id: string | undefined; loaded: boolean; error: Error | null }) {
  const offline = useApiState() === 'offline'
  if (run?.status === 'done') return null
  let body: ReactNode
  if (run?.status === 'failed') body = <p role="alert" className="text-critical"><strong>This run failed:</strong> {run.error ?? 'no reason given'}</p>
  else if (!loaded || offline) body = <DataState error={error} />
  else if (run) body = <p><strong>This run is {run.status}.</strong> It will show here when it finishes.</p>
  else if (id) body = <p className="text-critical">The API has no simulation <span className="font-mono">{id}</span>. Choose another run.</p>
  else {
    body = (
      <p className="text-muted">
        {EMPTY} No finished simulation yet. <Link to="/experiments/scenarios" className="text-perf underline">Run one in the Scenario Studio</Link>.
      </p>
    )
  }
  return <Card className="text-sm">{body}</Card>
}

export function OperationsFrame({ title, subtitle, children }: {
  title: string
  subtitle: string
  children: (run: SimulationRun, metrics: RunMetrics) => ReactNode
}) {
  const { history, id, run } = useSelectedRun()
  const done = run?.status === 'done' ? run : undefined
  const metrics = useRunMetrics(done?.id)
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
      <SelectedRunBar />
      <RunProblem run={run} id={id} loaded={history.data !== undefined} error={history.error} />
      {done && (metrics.data
        // remounting resets filters, selection and playback time when the run changes
        ? <div key={done.id} className="space-y-4">{children(done, metrics.data)}</div>
        : <Card><DataState error={metrics.error} /></Card>)}
    </div>
  )
}
