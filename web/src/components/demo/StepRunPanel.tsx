// What a step asks the API for, whether it can ask now, and where the shown result came from.

import { Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApiState, useHealth } from '../../hooks/useHealth'
import type { StepRun } from '../../hooks/demo'
import type { Run } from '../../types/models'
import { dateTime } from '../../utils/format'
import { Card } from '../common/Card'

interface Props {
  state: StepRun<Run>
  /** The API call, in words. */
  call: ReactNode
  /** Roughly what makes it slow, so nobody is surprised. */
  wait: string
  hasResult: boolean
  submitting: boolean
  onRun: () => void
  /** Why the button is disabled, when the reason is not the API being offline. */
  blocked?: string | null
  error: string | null
}

export function StepRunPanel({ state, call, wait, hasResult, submitting, onRun, blocked, error }: Props) {
  const api = useApiState()
  const offline = api !== 'online'
  const running = useHealth().data?.queue.runningJobId
  const waiting = state.status === 'queued' || state.status === 'running' || (state.fresh && state.status === undefined)
  const busy = !offline && !!running && running !== state.id
  return (
    <Card className="space-y-3 text-sm">
      <p>{call}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button" onClick={onRun} disabled={offline || submitting || waiting || !!blocked}
          className="flex items-center gap-2 rounded-lg bg-ops px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          <Play size={15} aria-hidden />
          {submitting ? 'Submitting…' : waiting && !offline ? 'In progress' : hasResult ? 'Run it again now' : 'Run it now'}
        </button>
        <span className="text-muted">{wait}</span>
      </div>
      {api === 'offline' && (
        <p className="text-critical">
          <strong>API unreachable, so this step cannot run.</strong> {hasResult ? 'The result below was loaded earlier.' : 'Skip the step, or start the API and stay here.'}
        </p>
      )}
      {busy && (
        <p className="rounded-lg border border-warning/60 bg-warning/10 p-3">
          <strong>The API is busy</strong> with <span className="font-mono text-xs break-all">{running}</span>. It runs one job at a time, so a new
          one would wait in the queue. You can queue it, wait, or skip this step.
        </p>
      )}
      {blocked && !offline && <p className="text-muted">{blocked}</p>}
      {error && <p role="alert" className="text-critical">{error}</p>}
      {hasResult && state.run && (
        <p className="text-xs text-muted">
          <strong className="text-heading">{state.fresh ? 'Run during this visit' : 'Reused saved run with the same settings'}</strong>, finished{' '}
          {dateTime(state.run.finishedAt)} · <span className="font-mono break-all">{state.run.id}</span>
        </p>
      )}
    </Card>
  )
}
