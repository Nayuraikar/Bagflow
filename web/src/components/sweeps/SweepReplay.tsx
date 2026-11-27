// The grid filling across worker lanes, replayed from each experiment's worker and start and end times.

import { memo, useState } from 'react'
import { useReplay } from '../../hooks/useReplay'
import type { SweepMetrics, SweepPass } from '../../types/sweep'
import { int, msFine, pct } from '../../utils/format'
import { describeExperiment } from '../../utils/sweep'
import { Card, CardTitle } from '../common/Card'
import { ReplayControls } from '../common/ReplayControls'
import { StatusLabel } from '../common/StatusLabel'
import { workerColor } from '../parallel/style'
import { Stat } from '../parallel/Stat'
import { ExperimentGrid, type Cell } from './ExperimentGrid'

const Bars = memo(function Bars({ pass, span, labels }: { pass: SweepPass; span: number; labels: string[] }) {
  return (
    <div className="space-y-1">
      {pass.workers.map((w) => (
        <div key={w.worker} className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-xs text-muted" data-lane={pass.threads}>worker {w.worker}</span>
          <div className="relative h-5 min-w-0 flex-1 rounded bg-bg">
            {pass.runs.filter((r) => r.worker === w.worker).map((r) => (
              <div
                key={r.index}
                title={`experiment ${r.index}: ${labels[r.index]} · ${msFine(r.startMs)} to ${msFine(r.endMs)} · ${r.status}`}
                className="absolute inset-y-0.5 overflow-hidden rounded-[2px] border-r border-surface text-center font-mono text-[9px] leading-4 text-white"
                style={{
                  left: `${(100 * r.startMs) / span}%`, width: `${(100 * (r.endMs - r.startMs)) / span}%`, minWidth: 1,
                  background: r.status === 'failed' ? '#d95757' : workerColor(w.worker),
                }}
              >
                {(r.endMs - r.startMs) / span > 0.025 && r.index}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
})

/** Lanes on the shared clock, with everything after the playhead covered. */
function Lanes({ pass, span, position, labels }: { pass: SweepPass; span: number; position: number; labels: string[] }) {
  return (
    <div>
      <h3 className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
        {pass.threads} thread{pass.threads === 1 ? '' : 's'}{pass.isBaseline ? ' (baseline)' : ''}
        <span className="font-mono font-normal">{msFine(pass.wallMs)}</span> <StatusLabel status="Measured" />
      </h3>
      <div className="relative">
        <Bars pass={pass} span={span} labels={labels} />
        {position < span && (
          <div className="pointer-events-none absolute inset-y-0 right-0 left-26">
            <div className="absolute inset-y-0 right-0 border-l-2 border-critical bg-surface/90" style={{ left: `${(100 * position) / span}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

function Distribution({ pass }: { pass: SweepPass }) {
  return (
    <Card>
      <CardTitle>Per-thread distribution, {pass.threads}-thread pass</CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-100 text-sm">
          <thead className="text-muted">
            <tr>{['Worker', 'Experiments', 'Time in experiments', 'Share of pass wall time', 'Source'].map((h) => <th key={h} className="border-b border-line py-1 text-right font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="font-mono">
            {pass.workers.map((w) => (
              <tr key={w.worker}>
                <td className="py-1 text-right"><span className="mr-2 inline-block size-2.5 rounded-sm" style={{ background: workerColor(w.worker) }} aria-hidden />{w.worker}</td>
                <td className="py-1 text-right">{int(w.experiments)}</td>
                <td className="py-1 text-right">{msFine(w.busyMs)}</td>
                <td className="py-1 text-right">{pct(pass.wallMs > 0 ? (100 * w.busyMs) / pass.wallMs : null)}</td>
                <td className="py-1 text-right font-sans"><StatusLabel status="Measured" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Replay({ m, pass }: { m: SweepMetrics; pass: SweepPass }) {
  const baseline = m.passes.find((p) => p.isBaseline)!
  const span = Math.max(pass.wallMs, baseline.wallMs)
  const replay = useReplay(span)
  const at = replay.position
  const [selected, setSelected] = useState<number>()
  const cells: Cell[] = m.experiments.map(() => ({ state: 'waiting', worker: null }))
  for (const r of pass.runs) {
    if (r.endMs <= at) cells[r.index] = { state: r.status, worker: r.worker }
    else if (r.startMs <= at) cells[r.index] = { state: 'running', worker: r.worker }
  }
  const count = (s: Cell['state']) => cells.filter((c) => c.state === s).length
  const labels = m.experiments.map(describeExperiment)
  const chosen = selected === undefined ? undefined : m.experiments[selected]
  return (
    <>
      <Card className="space-y-4">
        <ReplayControls replay={replay} span={span} clock="Elapsed time in the pass" />
        <dl className="grid gap-3 sm:grid-cols-4">
          <Stat label="Completed at the playhead" value={int(count('completed'))} />
          <Stat label="Running at the playhead" value={int(count('running'))} />
          <Stat label="Failed at the playhead" value={int(count('failed'))} />
          <Stat label="Not started" value={int(count('waiting'))} />
        </dl>
        <ExperimentGrid cells={cells} experiments={m.experiments} selected={selected} onSelect={setSelected} />
        {chosen ? (
          <div className="rounded-lg bg-bg p-3 text-sm">
            <p className="mb-2 font-semibold">Experiment {chosen.index}: {describeExperiment(chosen)}</p>
            {chosen.result ? (
              <dl className="grid gap-3 sm:grid-cols-3">
                <Stat label="Bags simulated" value={int(chosen.result.bagsSimulated)} status="Real" />
                <Stat label="Delayed bags" value={`${int(chosen.result.delayedBags)} (${pct(chosen.result.delayedPct, 3)})`} status="Real" />
                <Stat label="Mean time in system" value={`${chosen.result.meanSojournS.toFixed(1)} s`} status="Real" />
                <Stat label="95th percentile" value={`${chosen.result.p95SojournS.toFixed(1)} s`} status="Real" />
                <Stat label="Longest queue" value={int(chosen.result.maxQueue)} status="Real" />
                <Stat label="Engine checksum" value={chosen.result.engineChecksum} status="Real" />
              </dl>
            ) : <p className="text-critical">Failed: {chosen.error}</p>}
          </div>
        ) : <p className="text-xs text-muted">Select a cell to see that experiment’s result.</p>}
        <div className="space-y-4">
          <p className="text-sm text-muted">Worker lanes on one clock, each pass counted from its own start.</p>
          <Lanes pass={pass} span={span} position={at} labels={labels} />
          {!pass.isBaseline && <Lanes pass={baseline} span={span} position={at} labels={labels} />}
          <div className="ml-26 flex justify-between border-t border-line pt-0.5 font-mono text-[10px] text-muted">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{msFine(f * span)}</span>)}
          </div>
        </div>
      </Card>
      <Distribution pass={pass} />
    </>
  )
}

export function SweepReplay({ m }: { m: SweepMetrics }) {
  const [threads, setThreads] = useState(m.passes[m.passes.length - 1].threads)
  const pass = m.passes.find((p) => p.threads === threads) ?? m.passes[0]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-semibold">Experiments filling the worker lanes</h2>
        {m.passes.map((p) => (
          <button
            key={p.threads} type="button" aria-pressed={p.threads === pass.threads} onClick={() => setThreads(p.threads)}
            className={`rounded-lg border px-3 py-1 text-sm ${p.threads === pass.threads ? 'border-ops bg-ops/10 font-semibold text-ops' : 'border-line bg-surface'}`}
          >
            {p.threads} thread{p.threads === 1 ? '' : 's'}
          </button>
        ))}
      </div>
      <Replay key={`${m.id}-${pass.threads}`} m={m} pass={pass} />
    </div>
  )
}
