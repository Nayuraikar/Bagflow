// View C: the execution timeline of the selected run, next to its sequential baseline.

import type { Execution, ParallelMetrics } from '../../types/parallel'
import { int, msFine } from '../../utils/format'
import { maxConcurrent } from '../../utils/telemetry'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'
import { ExecutionTimeline, TimeAxis, TimelineLegend } from './ExecutionTimeline'
import { GpuPhaseBars } from './GpuPhaseBars'
import { Stat } from './Stat'

function Gantt({ title, run, span }: { title: string; run: Execution; span: number }) {
  return (
    <Card className="space-y-3">
      <CardTitle>{title}</CardTitle>
      <dl className="grid gap-3 sm:grid-cols-4">
        <Stat label="Wall time" value={msFine(run.wallMs)} />
        <Stat label="Tasks recorded" value={int(run.tasks.length)} />
        <Stat label="Threads with tasks" value={int(run.workers.length)} />
        <Stat label="Most tasks at once" value={int(maxConcurrent(run.tasks))} />
      </dl>
      <div>
        <ExecutionTimeline run={run} span={span} />
        <TimeAxis span={span} />
      </div>
      <TimelineLegend run={run} />
    </Card>
  )
}

export function TimelineView({ m }: { m: ParallelMetrics }) {
  const span = Math.max(m.sequential.wallMs, m.selected.wallMs)
  const merges = m.selected.mergeMs !== null
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>
          Recorded start and end of each task, in time since the start of the execution; both charts use the same scale. Hover a bar for its chunk.{' '}
          {m.taskNote}.
        </span>
        <StatusLabel status="Measured" />
      </p>
      {m.gpu ? (
        <Card>
          <CardTitle>{m.backend}: no task timeline</CardTitle>
          <p className="mb-3 text-sm">The GPU reports no per-task times, so there is no Gantt chart. These are the measured phases.</p>
          <GpuPhaseBars gpu={m.gpu} />
        </Card>
      ) : (
        <Gantt title={`Selected: ${m.backend}`} run={m.selected} span={span} />
      )}
      {!m.gpu && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {merges ? <>The final merge took <span className="font-mono">{msFine(m.selected.mergeMs)}</span>. <StatusLabel status="Measured" /></> : 'No separate merge step in this run.'}
        </p>
      )}
      <Gantt title={`Sequential baseline: ${m.sequential.backend}`} run={m.sequential} span={span} />
    </div>
  )
}
