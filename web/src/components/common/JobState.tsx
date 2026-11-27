import type { ReactNode } from 'react'
import { useApiState, useHealth } from '../../hooks/useHealth'
import { ApiError, isUnreachable } from '../../services/http'
import type { ParallelJob } from '../../types/parallel'
import { Card } from './Card'

interface Props {
  id: string
  job: ParallelJob | undefined
  jobError: Error | null
  metricsError: Error | null
  /** What to show while this job is the one running. */
  running: ReactNode
}

/** What is known about a job that has no results to show yet. */
export function JobState({ id, job, jobError, metricsError, running }: Props) {
  const offline = useApiState() === 'offline'
  const runningId = useHealth().data?.queue.runningJobId
  let body
  if (jobError instanceof ApiError && jobError.code === 'not_found') {
    body = <p className="text-critical">The API does not know this job. It may have restarted before the job finished, so there is no result.</p>
  } else if (job?.status === 'failed') {
    body = <p role="alert" className="text-critical"><strong>Job failed:</strong> {job.error ?? 'no reason given'}</p>
  } else if (offline || isUnreachable(jobError) || isUnreachable(metricsError)) {
    body = <p className="text-critical">API unreachable. The job’s state and result are unknown.</p>
  } else if (jobError || metricsError) {
    body = <p className="text-critical">The API returned an error: {(jobError ?? metricsError)!.message}</p>
  } else if (!job) {
    body = <p className="text-muted">Loading…</p>
  } else if (job.status === 'queued') {
    body = (
      <>
        <p><strong>Queued.</strong> The API runs one job at a time, so that timings never overlap.</p>
        {runningId && runningId !== id && <p className="text-muted">Now running: <span className="font-mono break-all">{runningId}</span></p>}
      </>
    )
  } else if (job.status === 'running') {
    body = running
  } else {
    body = <p className="text-muted">Done. Loading the result…</p>
  }
  return (
    <Card className="text-sm">
      <div aria-live="polite">{body}</div>
      <p className="mt-2 font-mono text-xs break-all text-muted">{id}</p>
    </Card>
  )
}
