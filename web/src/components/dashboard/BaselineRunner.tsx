import { Play } from 'lucide-react'
import { useBaselineJob } from '../../hooks/jobContext'
import { useApiState } from '../../hooks/useHealth'
import type { SimulationConfig } from '../../types/models'
import { submitMessage } from '../../utils/submitMessage'
import { Card, CardTitle } from '../common/Card'
import { SimulationProgress } from '../experiments/SimulationProgress'

/** Threads and classify backend are left to the API's defaults. */
const BASELINE: SimulationConfig = {
  scenario: 'Normal', routing: 'dijkstra', policy: 'fcfs', capacityPct: 100, serverMultiplier: 1, bagCount: 250_000,
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
      {activeId && <SimulationProgress />}
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
