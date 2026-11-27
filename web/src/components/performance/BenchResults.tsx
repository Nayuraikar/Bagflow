// Charts, tables and a plain reading of one benchmark run. Every sentence comes from its numbers.

import type { BenchMetrics, BenchRow } from '../../types/bench'
import { EMPTY, fixed, int, msFine, pct, times } from '../../utils/format'
import { fastest, rowKey, rowLabel, spreadPct, throughput } from '../../utils/bench'
import { Card, CardTitle } from '../common/Card'
import { BarList, type BarRow } from '../common/BarList'
import { StatusLabel } from '../common/StatusLabel'
import { Table } from '../common/Table'
import { Stat } from '../parallel/Stat'

/** A spread above this share of the median is pointed out. A display rule. */
const WIDE_SPREAD_PCT = 20

const bars = (rows: BenchRow[], value: (r: BenchRow) => number | null, text: (v: number) => string): BarRow[] =>
  rows.map((r) => {
    const v = value(r)
    return { key: rowKey(r), label: rowLabel(r), value: v, text: v === null ? EMPTY : text(v) }
  })

function Chart({ title, note, rows }: { title: string; note: string; rows: BarRow[] }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <p className="mb-2 text-xs text-muted">{note}</p>
      {rows.length ? <BarList rows={rows} /> : <p className="text-sm text-muted">{EMPTY} No backend in this run has this figure.</p>}
    </Card>
  )
}

export function BenchSummaryCards({ m }: { m: BenchMetrics }) {
  const scalar = m.rows.find((r) => r.backend === 'scalar')
  const best = fastest(m.rows)
  const maxSpeedup = m.rows.reduce((a, b) => (b.speedup > a.speedup ? b : a))
  const peak = m.rows.reduce((a, b) => (b.throughputBagsPerS > a.throughputBagsPerS ? b : a))
  return (
    <Card>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Workload" value={`${int(m.workloadSize)} bags`} />
        <Stat label="Scalar baseline, median" value={msFine(scalar?.timeMs.median)} />
        <Stat label="Shortest median time" value={msFine(best.timeMs.median)} note={rowLabel(best)} />
        <Stat label="Largest speedup vs scalar" value={times(maxSpeedup.speedup)} note={rowLabel(maxSpeedup)} />
        <Stat label="Peak throughput" value={throughput(peak.throughputBagsPerS)} note={`${rowLabel(peak)}, million bags per second`} />
      </dl>
    </Card>
  )
}

function Reading({ m }: { m: BenchMetrics }) {
  const best = fastest(m.rows)
  const lines = [
    `At ${int(m.workloadSize)} bags, with ${m.repetitions} timed repetitions after ${m.warmup} warm-up, ${rowLabel(best)} had the shortest median time ` +
    `(${msFine(best.timeMs.median)}, ${times(best.speedup)} against scalar). This holds for this run only.`,
  ]
  const slower = m.rows.filter((r) => r.backend !== 'scalar' && r.speedup < 1)
  if (slower.length) lines.push(`Slower than scalar here: ${slower.map((r) => `${rowLabel(r)} (${times(r.speedup)})`).join(', ')}.`)
  for (const r of slower) {
    if (r.gpu && r.gpu.kernelOnlySpeedup > 1) {
      lines.push(
        `${r.backend}: the kernel alone was ${times(r.gpu.kernelOnlySpeedup)} against scalar, so the loss is in the time outside the kernel ` +
        `(median copy in ${msFine(r.gpu.copyInMs)}, launch and wait ${msFine(r.gpu.launchOverheadMs)}, copy out ${msFine(r.gpu.copyOutMs)}).`,
      )
    }
  }
  const wide = m.rows.filter((r) => spreadPct(r) > WIDE_SPREAD_PCT)
  if (wide.length) {
    lines.push(
      `Repetitions varied by more than ${WIDE_SPREAD_PCT}% of the median for ${wide.map((r) => `${rowLabel(r)} (${pct(spreadPct(r), 0)})`).join(', ')}, ` +
      'so small differences between these are not meaningful.',
    )
  }
  return (
    <Card className="space-y-1 text-sm">
      <CardTitle aside={<StatusLabel status="Measured" />}>What this run shows</CardTitle>
      {lines.map((l) => <p key={l}>{l}</p>)}
    </Card>
  )
}

function Scalability({ m }: { m: BenchMetrics }) {
  const ids = [...new Set(m.rows.filter((r) => r.efficiencyPct !== null).map((r) => r.backend))]
  const groups = ids.map((id) => m.rows.filter((r) => r.backend === id)).filter((g) => g.length > 1)
  // one scale for every backend, so the groups can be compared
  const max = Math.max(0, ...groups.flat().map((r) => r.speedup))
  return (
    <Card className="space-y-3">
      <CardTitle>Scalability: speedup vs scalar by thread count</CardTitle>
      {groups.length === 0 && (
        <p className="text-sm text-muted">
          {EMPTY} Needs a Rayon backend measured at two or more thread counts. OpenMP always runs at its own thread count.
        </p>
      )}
      {groups.map((g) => (
        <div key={g[0].backend}>
          <h3 className="mb-1 font-mono text-sm">{g[0].backend}</h3>
          <ul className="space-y-1">
            {g.map((r) => (
              <li key={rowKey(r)} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-20 shrink-0">{r.threads} thread{r.threads === 1 ? '' : 's'}</span>
                <span className="h-3 min-w-16 flex-1"><span className="block h-3 rounded-r bg-perf" style={{ width: `${(100 * r.speedup) / max}%` }} /></span>
                <span className="w-16 text-right font-mono">{times(r.speedup)}</span>
                <StatusLabel status="Measured" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  )
}

/** Only what the API collects. */
export function Collected({ m }: { m: BenchMetrics }) {
  const memory = m.rows.filter((r) => r.memoryBytes !== null)
  return (
    <Card>
      <CardTitle>Memory and GPU utilisation</CardTitle>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Memory use"
          value={memory.length ? memory.map((r) => `${rowLabel(r)}: ${int(r.memoryBytes)} B`).join(', ') : EMPTY}
          note={memory.length ? undefined : 'Not collected: the API returns no memory measurement for any backend.'}
        />
        <Stat label="GPU utilisation" value={EMPTY} note="Not collected: the API reports no GPU utilisation. GPU phase times are measured and shown separately." />
        <Stat
          label="Bag columns the kernel reads and writes" status="Simplified" value={`${fixed(m.dataFootprintBytes / 1e6, 2)} MB`}
          note="Computed by the API from the workload size. It is not a memory measurement."
        />
      </dl>
    </Card>
  )
}

export function GpuPhaseTable({ m }: { m: BenchMetrics }) {
  const gpus = m.rows.filter((r) => r.gpu)
  if (!gpus.length) return null
  return (
    <Card>
      <CardTitle>GPU phases, medians</CardTitle>
      <Table
        head={['Backend', 'Copy in', 'Kernel', 'Launch and wait', 'Copy out', 'Kernel-only speedup', 'Source']}
        rows={gpus.map((r) => ({
          key: r.backend,
          cells: [
            r.backend, msFine(r.gpu!.copyInMs), msFine(r.gpu!.kernelMs), msFine(r.gpu!.launchOverheadMs), msFine(r.gpu!.copyOutMs),
            times(r.gpu!.kernelOnlySpeedup), <StatusLabel key="s" status="Measured" />,
          ],
        }))}
      />
      {gpus.map((r) => <p key={r.backend} className="mt-2 text-xs text-muted">{r.backend} on {r.gpu!.device ?? 'the GPU'}: {r.gpu!.note}.</p>)}
    </Card>
  )
}

export function BenchTable({ m }: { m: BenchMetrics }) {
  return (
    <Card>
      <CardTitle>All measured rows</CardTitle>
      <Table
        minWidth="56rem"
        head={['Backend × threads', 'Median', 'Mean', 'Std', 'Min', 'Max', 'Speedup', 'Efficiency', 'Output vs scalar', 'Source']}
        rows={m.rows.map((r) => ({
          key: rowKey(r),
          cells: [
            `${rowLabel(r)}${r.requested ? '' : ' (added)'}`, msFine(r.timeMs.median), msFine(r.timeMs.mean), msFine(r.timeMs.std),
            msFine(r.timeMs.min), msFine(r.timeMs.max), times(r.speedup), pct(r.efficiencyPct),
            r.identical ? 'identical' : <span key="d" className="text-critical">differs</span>,
            <StatusLabel key="s" status="Measured" />,
          ],
        }))}
      />
      <p className="mt-2 text-xs text-muted">
        Speedup: {m.definitions.speedup}. Time: {m.definitions.time_ms}. “Added” rows are baselines the API ran for speedup or efficiency.
      </p>
    </Card>
  )
}

export function BenchCharts({ m }: { m: BenchMetrics }) {
  const efficient = m.rows.filter((r) => r.efficiencyPct !== null)
  return (
    <>
      <Reading m={m} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Chart title="Execution time" note="Median per repetition. Shorter is better." rows={bars(m.rows, (r) => r.timeMs.median, msFine)} />
        <Chart title="Throughput" note="Million bags per second. Longer is better." rows={bars(m.rows, (r) => r.throughputBagsPerS, throughput)} />
        <Chart title="Speedup vs scalar" note="Median scalar time ÷ median backend time, same data." rows={bars(m.rows, (r) => r.speedup, times)} />
        <Chart
          title="Parallel efficiency"
          note={`Thread backends only; the others have no thread count. ${m.definitions.parallel_efficiency_pct}.`}
          rows={bars(efficient, (r) => r.efficiencyPct, (v) => pct(v))}
        />
        <Scalability m={m} />
      </div>
      <GpuPhaseTable m={m} />
      <Collected m={m} />
    </>
  )
}
