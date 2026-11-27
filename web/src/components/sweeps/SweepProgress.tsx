// While the job runs: the current pass exactly as the API reports it.

import type { SweepJob } from '../../types/sweep'
import { int } from '../../utils/format'
import { Stat } from '../parallel/Stat'
import { ExperimentGrid, type Cell } from './ExperimentGrid'

export function SweepProgress({ job }: { job: SweepJob | undefined }) {
  const live = job?.live
  if (!live) {
    const phase = job?.progress?.phase
    return <p><strong>{phase === 'generating' ? 'Generating the dataset' : phase === 'warming_up' ? 'Warming up' : 'Preparing the scenarios'}</strong></p>
  }
  const cells: Cell[] = Array.from({ length: live.experiments }, () => ({ state: 'waiting', worker: null }))
  for (const f of live.finished) cells[f.index] = { state: f.status, worker: f.worker }
  for (const a of live.active) cells[a.index] = { state: 'running', worker: a.worker }
  const total = job.progress?.total ?? 0
  return (
    <div className="space-y-3">
      <p>
        <strong>Live: pass {live.passIndex + 1} of {live.passes}, {live.passThreads} thread{live.passThreads === 1 ? '' : 's'}.</strong>{' '}
        <span className="text-muted">Updated about twice a second, so short experiments can finish between updates.</span>
      </p>
      <dl className="grid gap-3 sm:grid-cols-4">
        <Stat label="Completed in this pass" value={int(live.completed)} />
        <Stat label="Running" value={int(live.running)} />
        <Stat label="Failed" value={int(live.failed)} />
        <Stat label="Finished over all passes" value={`${int(job.progress?.done)} / ${int(total)}`} />
      </dl>
      <progress className="job-progress" value={total > 0 ? job.progress!.done / total : undefined} max={1} aria-label="Sweep progress" />
      <ExperimentGrid cells={cells} />
    </div>
  )
}
