// View A: the workload, how it was split, who ran what and when, the merge and the check.

import { Pause, Play, SkipForward } from 'lucide-react'
import type { ReactNode } from 'react'
import { SPEEDS, useReplay, type Replay } from '../../hooks/useReplay'
import type { Execution, ParallelMetrics } from '../../types/parallel'
import { fixed, int, msFine } from '../../utils/format'
import { isMergeStage } from '../../utils/telemetry'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'
import { ChecksumVerifier } from './ChecksumVerifier'
import { ExecutionTimeline, TimeAxis, TimelineLegend } from './ExecutionTimeline'
import { GpuPhaseBars } from './GpuPhaseBars'
import { Stat } from './Stat'
import { STAGE_NAMES, workerColor } from './style'

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardTitle>{n}. {title}</CardTitle>
      {children}
    </Card>
  )
}

function Controls({ replay, span }: { replay: Replay; span: number }) {
  const slow = replay.slowdown
  return (
    <div className="space-y-2">
      <p className="rounded-lg border border-warning/60 bg-warning/10 px-3 py-2 text-sm">
        <strong>Replay of a measured run, not a live view.</strong> Positions come from the recorded start and end times. Speed changes only how
        fast the replay moves, never a measured value.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={replay.toggle} className="flex items-center gap-2 rounded-lg bg-ops px-3 py-1.5 text-sm font-semibold text-white">
          {replay.playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
          {replay.playing ? 'Pause' : 'Play replay'}
        </button>
        <button type="button" onClick={() => replay.seek(span)} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm">
          <SkipForward size={14} aria-hidden /> Show full run
        </button>
        <label className="text-sm">
          Speed{' '}
          <select value={replay.speed} onChange={(e) => replay.setSpeed(Number(e.target.value))} className="rounded-lg border border-line px-2 py-1">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <span className="text-sm">
          Elapsed job time <span role="timer" className="inline-block min-w-24 text-right font-mono text-lg font-semibold">{msFine(replay.position)}</span>
        </span>
        <span className="text-xs text-muted">
          shown {slow >= 1 ? `about ${int(Math.round(slow))}× slower` : `about ${fixed(1 / slow, 1)}× faster`} than it ran
        </span>
        <StatusLabel status="Measured" />
      </div>
      <input
        type="range" min={0} max={span} step={span / 1000} value={replay.position}
        onChange={(e) => replay.seek(Number(e.target.value))}
        className="w-full accent-ops" aria-label="Replay position"
      />
    </div>
  )
}

/** Chunks in workload order, coloured by the thread that ran each, as of the playhead. */
function Chunks({ run, position }: { run: Execution; position: number }) {
  const done = run.tasks.filter((t) => t.endMs <= position).length
  const active = run.tasks.filter((t) => t.startMs <= position && t.endMs > position).length
  return (
    <>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span>
          At the playhead: <span className="font-mono">{int(done)}</span> done, <span className="font-mono">{int(active)}</span> running,{' '}
          <span className="font-mono">{int(run.tasks.length - done - active)}</span> not started.
        </span>
        <StatusLabel status="Measured" />
      </p>
      <ul className="flex flex-wrap gap-1">
        {run.tasks.map((t) => {
          const state = t.endMs <= position ? 'done' : t.startMs <= position ? 'running' : 'waiting'
          return (
            <li
              key={t.id}
              title={`chunk ${t.id}: ${int(t.size)} bags, thread ${t.worker}, ${state}`}
              className={`flex h-6 min-w-6 items-center justify-center rounded border px-1 font-mono text-[10px] ${state === 'done' ? 'text-white' : ''}`}
              style={{
                borderColor: state === 'waiting' ? '#cfd6df' : workerColor(t.worker),
                borderWidth: state === 'running' ? 3 : 1,
                background: state === 'done' ? workerColor(t.worker) : undefined,
              }}
            >
              {t.id}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Assignment({ run, threads }: { run: Execution; threads: number | null }) {
  return (
    <>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span>
          <span className="font-mono">{int(run.workers.length)}</span> of <span className="font-mono">{int(threads)}</span> threads ran at least one chunk.
        </span>
        <StatusLabel status="Measured" />
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-100 text-sm">
          <thead className="text-muted">
            <tr>{['Thread', 'Chunks', 'Bags', 'Task time', 'Source'].map((h) => <th key={h} className="border-b border-line py-1 text-right font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="font-mono">
            {run.workers.map((w) => (
              <tr key={w.worker}>
                <td className="py-1 text-right"><span className="mr-2 inline-block size-2.5 rounded-sm" style={{ background: workerColor(w.worker) }} aria-hidden />{w.worker}</td>
                <td className="py-1 text-right">{int(w.tasks)}</td>
                <td className="py-1 text-right">{int(w.size)}</td>
                <td className="py-1 text-right">{msFine(w.busyMs)}</td>
                <td className="py-1 text-right font-sans"><StatusLabel status="Measured" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Merge({ run, position }: { run: Execution; position: number }) {
  const merges = run.stages.filter((s) => isMergeStage(s.name))
  if (run.mergeMs === null) {
    return <p className="text-sm text-muted">No separate merge step in this run{run.tasks.length > 0 ? ': one thread accumulates the result as it goes.' : '.'}</p>
  }
  const end = Math.max(...merges.map((s) => s.endMs))
  const state = position >= end ? 'complete' : merges.some((s) => position >= s.startMs && position < s.endMs) ? 'merging' : 'waiting for chunks'
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Stat label={`Merge time (${[...new Set(merges.map((s) => STAGE_NAMES[s.name] ?? s.name))].join(', ')}), one thread`} value={msFine(run.mergeMs)} />
        <Stat label="At the playhead" value={state} />
      </dl>
    </>
  )
}

export function WorkloadView({ m }: { m: ParallelMetrics }) {
  const span = Math.max(m.sequential.wallMs, m.selected.wallMs)
  const replay = useReplay(span)
  const run = m.selected
  const traced = run.tasks.length > 0
  const parallelStages = run.stages.filter((s) => s.parallel && s.name !== 'generate_bags')
  return (
    <div className="space-y-4">
      <Step n={1} title="Original workload">
        <dl className="grid gap-3 sm:grid-cols-3">
          <Stat label="Bags" value={int(m.bags)} note={`${int(m.requestedBags)} requested`} />
          {Object.entries(m.output).map(([k, v]) => <Stat key={k} label={`Result: ${k.replaceAll('_', ' ')}`} value={int(v)} />)}
        </dl>
      </Step>

      <Card><Controls replay={replay} span={span} /></Card>

      <Step n={2} title="Partition into chunks">
        {traced ? (
          <>
            <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span><span className="font-mono">{int(run.tasks.length)}</span> chunks of up to <span className="font-mono">{int(m.chunk.size)}</span> {m.chunk.unit}.</span>
              <StatusLabel status="Measured" />
            </p>
            <Chunks run={run} position={replay.position} />
          </>
        ) : (
          <p className="text-sm">{m.backend} reports no chunk records, so no partition is drawn. {m.taskNote}.</p>
        )}
      </Step>

      <Step n={3} title="Worker assignment">
        {traced ? <Assignment run={run} threads={m.threads} /> : <p className="text-sm">No per-task times for {m.backend}, so no worker lanes. Its measured phases are in step 4.</p>}
      </Step>

      <Step n={4} title="Concurrent execution">
        <p className="mb-3 text-sm text-muted">Both runs share one clock starting at 0, so the shorter one finishes first. {m.taskNote}.</p>
        <h3 className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
          Sequential: {m.sequential.backend} <span className="font-mono font-normal">{msFine(m.sequential.wallMs)}</span> <StatusLabel status="Measured" />
        </h3>
        <ExecutionTimeline run={m.sequential} span={span} position={replay.position} />
        <h3 className="mt-4 mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
          Selected: {m.backend} <span className="font-mono font-normal">{msFine(run.wallMs)}</span> <StatusLabel status="Measured" />
        </h3>
        {m.gpu ? <GpuPhaseBars gpu={m.gpu} /> : <ExecutionTimeline run={run} span={span} position={replay.position} />}
        <TimeAxis span={span} />
        <div className="mt-2"><TimelineLegend run={run} /></div>
        {parallelStages.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {parallelStages.map((s) => STAGE_NAMES[s.name] ?? s.name).join(' and ')} ran in parallel, but the API records no tasks for them, so no thread
            activity is drawn.
          </p>
        )}
      </Step>

      <Step n={5} title="Result merge">
        {m.gpu ? <p className="text-sm text-muted">No separate merge stage is reported. {m.gpu.note}.</p> : <Merge run={run} position={replay.position} />}
      </Step>

      <Step n={6} title="Checksum verification">
        <ChecksumVerifier m={m} />
      </Step>
    </div>
  )
}
