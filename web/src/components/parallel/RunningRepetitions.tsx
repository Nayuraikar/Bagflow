import type { ParallelJob } from '../../types/parallel'
import { int } from '../../utils/format'
import { StatusLabel } from '../common/StatusLabel'

/** Progress of a job that counts its timed executions (parallel runs and benchmarks). */
export function RunningRepetitions({ job, title, unit }: { job: ParallelJob | undefined; title: string; unit: string }) {
  const progress = job?.progress
  const counting = progress?.phase === 'running' && progress.total > 0
  return (
    <>
      <p className="mb-2 flex flex-wrap items-center gap-2">
        <strong>{progress && progress.phase !== 'running' ? 'Preparing the input data' : title}</strong>
        {counting && (
          <><span className="font-mono">{int(progress.done)} / {int(progress.total)}</span> {unit} <StatusLabel status="Measured" /></>
        )}
      </p>
      <progress className="job-progress" value={counting ? progress.done / progress.total : undefined} max={1} aria-label="Job progress" />
    </>
  )
}
