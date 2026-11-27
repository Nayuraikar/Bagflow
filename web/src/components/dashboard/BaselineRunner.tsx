import { Play } from 'lucide-react'
import { useBaselineJob } from '../../hooks/jobContext'
import { useApiState, useHealth } from '../../hooks/useHealth'
import type { SimulationConfig } from '../../types/models'
import { int, pct } from '../../utils/format'
import { submitMessage } from '../../utils/submitMessage'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'

/** Threads and classify backend are left to the API's defaults. */
const BASELINE: SimulationConfig = {
  scenario: 'Normal', routing: 'dijkstra', policy: 'fcfs', capacityPct: 100, serverMultiplier: 1, bagCount: 250_000,
}

const PHASES: Record<string, string> = {
  queued: 'Queued',
  generating: 'Generating the dataset (timed sequentially and in parallel)',
  classifying: 'Classifying deadline risk (timed scalar and selected kernel)',
  simulating: 'Simulating (sequential, events in time order)',
  aggregating: 'Aggregating results (timed sequentially and in parallel)',
  summarising: 'Summarising',
  done: 'Done',
  failed: 'Failed',
}

function Progress() {
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

export function BaselineRunner() {
  const { activeId, outcome, submitting, submitError, submit } = useBaselineJob()
  const offline = useApiState() !== 'online'
  const busy = submitting || activeId !== null
  return (
    <Card>
      <CardTitle>Baseline run</CardTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Normal · dijkstra · fcfs · 100% capacity · server multiplier 1 · 250,000 bags requested
        </p>
        <button
          type="button"
          onClick={() => submit(BASELINE)}
          disabled={busy || offline}
          className="flex items-center gap-2 rounded-lg bg-ops px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Play size={15} aria-hidden />
          {submitting ? 'Submitting…' : activeId ? 'A simulation is in progress' : 'Run baseline'}
        </button>
      </div>
      {activeId && <Progress />}
      {submitError && <p role="alert" className="mt-3 text-sm text-critical">{submitMessage(submitError)}</p>}
      {!activeId && outcome && (
        <p role="status" className={`mt-3 text-sm ${outcome.result === 'done' ? 'text-ops' : 'text-critical'}`}>
          {outcome.result === 'done' && <>Run <span className="font-mono">{outcome.id}</span> finished.</>}
          {outcome.result === 'failed' && <>Run <span className="font-mono">{outcome.id}</span> failed: {outcome.error}</>}
          {outcome.result === 'lost' && (
            <>Lost track of run <span className="font-mono">{outcome.id}</span>: the API restarted or became unreachable before its result could be read.</>
          )}
        </p>
      )}
    </Card>
  )
}
