import { useApiState, useHealth } from '../../hooks/useHealth'
import { ApiError, isUnreachable } from '../../services/http'
import type { ParallelJob } from '../../types/parallel'
import { int } from '../../utils/format'
import { Card } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'

/** What is known about a job that has no results to show yet. */
export function JobState({ id, job, jobError, metricsError }: { id: string; job: ParallelJob | undefined; jobError: Error | null; metricsError: Error | null }) {
  const offline = useApiState() === 'offline'
  const running = useHealth().data?.queue.runningJobId
  const progress = job?.progress
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
        {running && running !== id && <p className="text-muted">Now running: <span className="font-mono break-all">{running}</span></p>}
      </>
    )
  } else if (job.status === 'running') {
    const known = progress && progress.total > 0
    body = (
      <>
        <p className="mb-2 flex flex-wrap items-center gap-2">
          <strong>{progress?.phase === 'preparing' ? 'Preparing the input data' : 'Running: sequential and selected alternate'}</strong>
          {known && progress.phase === 'running' && (
            <><span className="font-mono">{int(progress.done)} / {int(progress.total)}</span> executions, warm-ups included <StatusLabel status="Measured" /></>
          )}
        </p>
        <progress className="job-progress" value={known && progress.phase === 'running' ? progress.done / progress.total : undefined} max={1} aria-label="Job progress" />
      </>
    )
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
