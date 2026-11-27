import { useBaselineJob } from '../../hooks/jobContext'
import { useApiState, useHealth } from '../../hooks/useHealth'
import { int, pct } from '../../utils/format'
import { StatusLabel } from '../common/StatusLabel'

const PHASES: Record<string, string> = {
  queued: 'Queued',
  generating: 'Generating the dataset (timed sequentially and in parallel)',
  classifying: 'Classifying deadline risk (timed scalar and selected kernel)',
  precomputing: 'Operational precompute of per-bag work (timed sequentially and in parallel)',
  simulating: 'Simulating (sequential, events in time order)',
  aggregating: 'Aggregating results (timed sequentially and in parallel)',
  summarising: 'Summarising',
  done: 'Done',
  failed: 'Failed',
}

/** The followed simulation, from its server-sent events. */
export function SimulationProgress() {
  const { activeId, active } = useBaselineJob()
  const health = useHealth().data
  const offline = useApiState() === 'offline'
  const p = active.progress
  // only the simulation phase reports a meaningful fraction
  const fraction = p?.phase === 'simulating' && p.total > 0 ? p.done / p.total : undefined
  const waitingFor = p?.status === 'queued' ? health?.queue.runningJobId : null
  return (
    <div className="mt-4" aria-live="polite">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {offline || active.link === 'unreachable'
            ? 'API unreachable. Progress is unknown.'
            : p ? (PHASES[p.phase] ?? p.phase) : 'Connecting to the progress stream…'}
        </span>
        {fraction !== undefined && !offline && (
          <span className="flex items-center gap-2">
            <span className="font-mono">
              {pct(100 * fraction, 0)} ({int(p?.done)} / {int(p?.total)} bags)
            </span>
            <StatusLabel status="Measured" />
          </span>
        )}
      </div>
      <progress className="job-progress" value={offline ? 0 : fraction} max={1} aria-label="Simulation progress" />
      {waitingFor && waitingFor !== activeId && (
        <p className="mt-1 text-sm text-muted">
          Waiting: the API runs one job at a time and is running <span className="font-mono">{waitingFor}</span>.
        </p>
      )}
      <p className="mt-1 font-mono text-xs text-muted">{activeId}</p>
    </div>
  )
}
