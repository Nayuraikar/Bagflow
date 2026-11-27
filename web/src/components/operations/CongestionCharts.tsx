// Time-series charts. Loaded lazily, with the chart library.

import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router'
import type { Network } from '../../types/ops'
import { int } from '../../utils/format'
import { flowBins, peakBuckets } from '../../utils/congestion'
import { simClock } from '../../utils/simTime'
import { StatusLabel } from '../common/StatusLabel'
import { Table } from '../common/Table'

const AXIS = { fontSize: 11, fill: '#738196' }
const hour = (ms: number) => `${Math.floor(ms / 3_600_000)}h`
const compact = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))

/** One small chart per facility, so ten series never share colours. */
export function QueueCharts({ network, href }: { network: Network; href: (node: number) => string }) {
  const [shared, setShared] = useState(true)
  const series = useMemo(
    () => network.nodes.map((n, i) => {
      const queue = network.series.nodes[i].queue
      return { node: n, points: peakBuckets(network.series.timesMs, queue), max: queue.reduce((a, b) => Math.max(a, b), 0) }
    }),
    [network],
  )
  const top = Math.max(1, ...series.map((s) => s.max))
  return (
    <>
      <label className="mb-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-ops" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        Same vertical scale for every facility
      </label>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {series.map(({ node, points, max }) => (
          <figure key={node.id} className="min-w-0 rounded-lg border border-line p-2">
            <figcaption className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <Link to={href(node.id)} className="font-semibold text-perf underline">{node.name}</Link>
              <span>highest sample <span className="font-mono">{int(max)}</span></span>
              <StatusLabel status="Measured" />
            </figcaption>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e4e9ef" />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={hour} tick={AXIS} />
                  <YAxis domain={[0, shared ? top : Math.max(1, max)]} tickFormatter={compact} tick={AXIS} />
                  <Tooltip labelFormatter={(v) => simClock(Number(v))} formatter={(v) => [int(Number(v)), 'queue']} />
                  <Line dataKey="v" stroke="#2a78d6" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>
        ))}
      </div>
    </>
  )
}

export function FlowChart({ network, node }: { network: Network; node: number }) {
  const i = network.nodes.findIndex((n) => n.id === node)
  const bins = useMemo(() => flowBins(network.series.timesMs, network.series.nodes[i]), [network, i])
  return (
    <>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={bins} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e4e9ef" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={hour} tick={AXIS} />
            <YAxis tickFormatter={compact} tick={AXIS} />
            <Tooltip labelFormatter={(v) => `15 min from ${simClock(Number(v))}`} formatter={(v, name) => [int(Number(v)), name]} itemStyle={{ color: '#172b45' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span className="text-heading">{v}</span>} />
            <Line dataKey="incoming" name="Incoming" stroke="#2a78d6" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="outgoing" name="Outgoing" stroke="#eb6834" strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-perf">Show the values as a table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <Table
            minWidth="20rem" head={['15 minutes from', 'Incoming', 'Outgoing', 'Source']}
            rows={bins.map((b) => ({ key: b.t, cells: [simClock(b.t), int(b.incoming), int(b.outgoing), <StatusLabel key="s" status="Measured" />] }))}
          />
        </div>
      </details>
    </>
  )
}
