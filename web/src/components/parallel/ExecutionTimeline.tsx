import { memo } from 'react'
import type { Execution, Task } from '../../types/parallel'
import { int, msFine } from '../../utils/format'
import { isMergeStage } from '../../utils/telemetry'
import { HATCH, MERGE_COLOR, STAGE_NAMES, workerColor } from './style'

const left = (v: number, span: number) => `${(100 * v) / span}%`

function Row({ label, span, children }: { label: string; span: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-xs text-muted" title={label}>{label}</span>
      <div className="relative h-5 min-w-0 flex-1 rounded bg-bg" data-span={span}>{children}</div>
    </div>
  )
}

/** Above this many tasks, the gaps between blocks would hide the blocks themselves. */
const MAX_SEPARATED_TASKS = 200

function Block({ from, to, span, color, title, separated = true }: {
  from: number
  to: number
  span: number
  color: string
  title: string
  separated?: boolean
}) {
  return (
    <div
      title={title}
      className={`absolute inset-y-0.5 overflow-hidden ${separated ? 'rounded-[2px] border-r border-surface' : ''}`}
      style={{ left: left(from, span), width: left(to - from, span), minWidth: 1, background: color }}
    />
  )
}

const taskTitle = (t: Task) => `chunk ${t.id} · thread ${t.worker} · ${msFine(t.startMs)} to ${msFine(t.endMs)} · ${int(t.size)} bags`

/** The recorded bars. Memoised so a moving playhead does not redraw them. */
const Bars = memo(function Bars({ run, span }: { run: Execution; span: number }) {
  return (
    <div className="space-y-1">
      {run.workers.map((w) => (
        <Row key={w.worker} label={`thread ${w.worker}`} span={span}>
          {run.tasks.filter((t) => t.worker === w.worker).map((t) => (
            <Block
              key={t.id} from={t.startMs} to={t.endMs} span={span} color={workerColor(w.worker)} title={taskTitle(t)}
              separated={run.tasks.length <= MAX_SEPARATED_TASKS}
            />
          ))}
        </Row>
      ))}
      {run.stages.length > 0 && (
        <Row label="stages" span={span}>
          {run.stages.map((s, i) => (
            <Block
              key={i}
              from={s.startMs}
              to={s.endMs}
              span={span}
              // generate_bags has its tasks in the thread rows
              color={isMergeStage(s.name) ? MERGE_COLOR : s.name === 'generate_bags' ? '#cfd6df' : s.parallel ? HATCH : '#738196'}
              title={`${STAGE_NAMES[s.name] ?? s.name} · ${s.parallel ? 'parallel' : 'one thread'} · ${msFine(s.startMs)} to ${msFine(s.endMs)}`}
            />
          ))}
        </Row>
      )}
    </div>
  )
})

/**
 * Real task start and end times, one row per thread that ran a task. With `position`, only what had
 * happened by that job time is uncovered.
 */
export function ExecutionTimeline({ run, span, position }: { run: Execution; span: number; position?: number }) {
  return (
    <div className="relative">
      <Bars run={run} span={span} />
      {position !== undefined && position < span && (
        <div className="pointer-events-none absolute inset-y-0 right-0 left-26">
          <div className="absolute inset-y-0 right-0 border-l-2 border-critical bg-surface/90" style={{ left: left(position, span) }} />
        </div>
      )}
    </div>
  )
}

export function TimeAxis({ span }: { span: number }) {
  return (
    <div className="ml-26 flex justify-between border-t border-line pt-0.5 font-mono text-[10px] text-muted">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{msFine(f * span)}</span>)}
    </div>
  )
}

export function TimelineLegend({ run }: { run: Execution }) {
  const items: [string, string][] = []
  if (run.stages.some((s) => isMergeStage(s.name))) items.push([MERGE_COLOR, 'merge (one thread)'])
  if (run.stages.some((s) => !s.parallel && !isMergeStage(s.name))) items.push(['#738196', 'other one-thread stage'])
  if (run.stages.some((s) => s.name === 'generate_bags')) items.push(['#cfd6df', 'generate-bags stage (its tasks are in the thread rows)'])
  if (run.stages.some((s) => s.parallel && s.name !== 'generate_bags')) items.push([HATCH, 'parallel stage without per-task records'])
  if (items.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([color, text]) => (
        <li key={text} className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: color }} aria-hidden />{text}</li>
      ))}
    </ul>
  )
}
