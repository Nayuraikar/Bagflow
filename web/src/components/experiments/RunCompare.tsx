// Two saved runs side by side. Values come from the summaries and metrics the API keeps.

import { X } from 'lucide-react'
import { useRunMetrics } from '../../hooks/useRunData'
import { useSweepMetrics } from '../../hooks/useSweep'
import type { SimulationRun, SweepRun } from '../../types/models'
import type { RunMetrics } from '../../types/ops'
import type { SweepMetrics } from '../../types/sweep'
import { EMPTY, dateTime, int, msFine, pct, times } from '../../utils/format'
import { duration } from '../../utils/simTime'
import { Card, CardTitle } from '../common/Card'
import { DataState } from '../common/DataState'
import { StatusLabel } from '../common/StatusLabel'
import type { Status } from '../common/status'
import { Table } from '../common/Table'

interface Line {
  label: string
  a: number | string | null | undefined
  b: number | string | null | undefined
  format?: (v: number) => string
  status?: Status
}

const show = (v: Line['a'], format: Line['format'] = int) => (v === null || v === undefined ? EMPTY : typeof v === 'string' ? v : format(v))

function difference({ a, b, format = int }: Line) {
  if (typeof a === 'number' && typeof b === 'number') {
    const d = b - a
    return d === 0 ? 'same' : `${d > 0 ? '+' : '−'}${format(Math.abs(d))}`
  }
  return a === undefined || b === undefined ? EMPTY : a === b ? 'same' : 'differs'
}

/** Settings carry no source label; results do. */
function CompareTable({ lines, source }: { lines: Line[]; source: boolean }) {
  return (
    <Table
      minWidth="36rem"
      head={source ? ['', 'Run A', 'Run B', 'B − A', 'Source'] : ['Setting', 'Run A', 'Run B', 'B − A']}
      rows={lines.map((l) => {
        const d = difference(l)
        const cells = [
          <span key="l" className="font-sans">{l.label}</span>,
          show(l.a, l.format), show(l.b, l.format),
          source ? d : <span key="d" className={d === 'same' ? '' : 'font-bold'}>{d === 'same' ? 'same' : 'differs'}</span>,
        ]
        if (source) cells.push(l.a === undefined && l.b === undefined ? EMPTY : <StatusLabel key="s" status={l.status ?? 'Measured'} />)
        return { key: l.label, cells }
      })}
    />
  )
}

const setting = (label: string, a: string | number | undefined, b: string | number | undefined): Line => ({ label, a: String(a ?? EMPTY), b: String(b ?? EMPTY) })

function Simulations({ a, b }: { a: SimulationRun; b: SimulationRun }) {
  const ma = useRunMetrics(a.id)
  const mb = useRunMetrics(b.id)
  const r = (label: string, f: (m: RunMetrics) => number | string, format?: Line['format'], status?: Status): Line => ({
    label, a: ma.data && f(ma.data), b: mb.data && f(mb.data), format, status,
  })
  const x = a.config
  const y = b.config
  return (
    <>
      <CompareTable
        source={false}
        lines={[
          setting('Finished', dateTime(a.finishedAt), dateTime(b.finishedAt)),
          setting('Scenario', x.scenario, y.scenario), setting('Routing', x.routing, y.routing), setting('Queue policy', x.policy, y.policy),
          setting('Capacity %', x.capacityPct, y.capacityPct), setting('Server multiplier', x.serverMultiplier, y.serverMultiplier),
          setting('Bags requested', int(x.bagCount), int(y.bagCount)), setting('Threads', x.threads, y.threads),
          setting('Classification backend', x.classifyBackend, y.classifyBackend),
        ]}
      />
      {x.bagCount !== y.bagCount && <p className="text-sm text-warning">The runs have different bag counts, so compare shares rather than counts.</p>}
      {(!ma.data || !mb.data) && <DataState error={ma.error ?? mb.error} />}
      <CompareTable
        source
        lines={[
          r('Bags simulated', (m) => m.summary.totalBags), r('Loaded on time', (m) => m.summary.loadedOnTime),
          r('Delayed bags', (m) => m.summary.delayedBags), r('Delayed %', (m) => m.summary.delayedPct, (v) => pct(v, 3)),
          r('Average queue wait', (m) => 1000 * m.summary.averageWaitingTimeS, duration),
          r('Longest queue', (m) => m.summary.maxQueue), r('Highest run utilisation', (m) => 100 * m.summary.maxUtilisation, (v) => pct(v)),
          r('Congested facilities (display rule)', (m) => m.summary.congestedFacilities, undefined, 'Simplified'),
          r('Last event', (m) => m.summary.endMs, duration),
          r('Dataset checksum', (m) => m.datasetChecksum), r('Engine checksum', (m) => m.engineChecksum),
        ]}
      />
      {ma.data && mb.data && (
        <>
          <h3 className="font-semibold">Longest queue by facility</h3>
          <CompareTable source lines={ma.data.nodes.map((n, i) => ({ label: n.name, a: n.maxQueue, b: mb.data.nodes[i].maxQueue }))} />
        </>
      )}
    </>
  )
}

function Sweeps({ a, b }: { a: SweepRun; b: SweepRun }) {
  const ma = useSweepMetrics(a.id)
  const mb = useSweepMetrics(b.id)
  const threads = [...new Set([...(ma.data?.passes ?? []), ...(mb.data?.passes ?? [])].map((p) => p.threads))].sort((p, q) => p - q)
  const pass = (m: SweepMetrics | undefined, t: number) => m?.passes.find((p) => p.threads === t)
  const config = (label: string, f: (m: SweepMetrics) => string) => setting(label, ma.data && f(ma.data), mb.data && f(mb.data))
  const same = a.configHash === b.configHash
  return (
    <>
      <CompareTable
        source={false}
        lines={[
          setting('Finished', dateTime(a.finishedAt), dateTime(b.finishedAt)),
          config('Scenarios', (m) => m.config.scenarios.join(', ')), config('Routings', (m) => m.config.routings.join(', ')),
          config('Policies', (m) => m.config.policies.join(', ')), config('Capacity %', (m) => m.config.capacityPcts.join(', ')),
          config('Server multiplier', (m) => String(m.config.serverMultiplier)), config('Bags requested', (m) => int(m.config.bagCount)),
          config('Thread counts', (m) => m.config.threads.join(', ')),
        ]}
      />
      <p className="text-sm">
        {same ? 'Identical settings: differences in the times below are run-to-run variation.' : 'Different settings: wall times are for different work.'}
      </p>
      {(!ma.data || !mb.data) && <DataState error={ma.error ?? mb.error} />}
      <CompareTable
        source
        lines={[
          { label: 'Experiments', a: ma.data?.experiments.length, b: mb.data?.experiments.length },
          ...threads.flatMap((t): Line[] => [
            { label: `Wall time, ${t} threads`, a: pass(ma.data, t)?.wallMs, b: pass(mb.data, t)?.wallMs, format: msFine },
            { label: `Speedup, ${t} threads`, a: pass(ma.data, t)?.speedup, b: pass(mb.data, t)?.speedup, format: times },
          ]),
        ]}
      />
    </>
  )
}

export function RunCompare({ a, b, onClose }: { a: SimulationRun | SweepRun; b: SimulationRun | SweepRun; onClose: () => void }) {
  return (
    <Card className="space-y-3">
      <CardTitle aside={<button type="button" onClick={onClose} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-sm"><X size={14} aria-hidden /> Close</button>}>
        Comparison of two {a.kind === 'sweep' ? 'sweeps' : 'simulations'}
      </CardTitle>
      <p className="font-mono text-xs break-all text-muted">A: {a.id}<br />B: {b.id}</p>
      {a.kind === 'simulation' && b.kind === 'simulation' && <Simulations a={a} b={b} />}
      {a.kind === 'sweep' && b.kind === 'sweep' && <Sweeps a={a} b={b} />}
    </Card>
  )
}
