import { createContext, useContext } from 'react'
import type { RunStepId } from '../config/demo'
import type { JobStatus, Run } from '../types/models'
import { useHistory } from './useHistory'

export interface DemoState {
  /** The job each step started during this visit. */
  submitted: Partial<Record<RunStepId, string>>
  skipped: RunStepId[]
  setSubmitted: (step: RunStepId, id: string) => void
  setSkipped: (step: RunStepId, skipped: boolean) => void
}

export const DemoContext = createContext<DemoState | null>(null)

export function useDemo() {
  const demo = useContext(DemoContext)
  if (!demo) throw new Error('useDemo needs DemoProvider')
  return demo
}

export interface StepRun<R extends Run> {
  id: string | undefined
  /** The history record; `undefined` until the history lists the job. */
  run: R | undefined
  status: JobStatus | undefined
  /** Started during this visit; otherwise an earlier saved run is being reused. */
  fresh: boolean
  /** Every finished run with these settings, newest first. */
  finished: R[]
}

/**
 * The run one demo step shows: the one it started, else a matching job that is already waiting or
 * running, else the newest finished run with exactly the same settings.
 */
export function useStepRun<R extends Run>(step: RunStepId, match: (run: Run) => run is R): StepRun<R> {
  const { submitted } = useDemo()
  const matching = useHistory().data?.filter(match) ?? []
  const finished = matching.filter((r) => r.status === 'done')
  const own = submitted[step]
  const run = own
    ? matching.find((r) => r.id === own)
    : (matching.find((r) => r.status === 'queued' || r.status === 'running') ?? finished[0])
  const id = own ?? run?.id
  return { id, run, status: run?.status, fresh: own !== undefined, finished }
}
