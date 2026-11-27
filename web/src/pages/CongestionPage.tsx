import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router'
import { Card, CardTitle } from '../components/common/Card'
import { BarList } from '../components/common/BarList'
import { DataState } from '../components/common/DataState'
import { StatusLabel } from '../components/common/StatusLabel'
import { Table } from '../components/common/Table'
import { StatusPill, StatusRuleNote } from '../components/operations/FacilityStatus'
import { RunExpired } from '../components/operations/RunExpired'
import { OperationsFrame } from '../components/operations/SelectedRun'
import { Stat } from '../components/parallel/Stat'
import { isExpired, useNetwork } from '../hooks/useRunData'
import type { SimulationRun } from '../types/models'
import type { Network, RunMetrics } from '../types/ops'
import { int, pct } from '../utils/format'
import { waitLabels } from '../utils/congestion'
import { duration } from '../utils/simTime'

const QueueCharts = lazy(() => import('../components/operations/CongestionCharts').then((m) => ({ default: m.QueueCharts })))
const FlowChart = lazy(() => import('../components/operations/CongestionCharts').then((m) => ({ default: m.FlowChart })))

const SELECT = 'rounded-lg border border-line bg-surface px-2 py-1.5'

function Congestion({ run, metrics }: { run: SimulationRun; metrics: RunMetrics }) {
  const network = useNetwork(run.id)
  // total queue time at a facility: its average wait times the bags that arrived there
  const ranked = metrics.nodes.map((n) => ({ ...n, totalWaitMs: 1000 * n.avgWaitS * n.arrivals })).sort((a, b) => b.totalWaitMs - a.totalWaitMs)
  const [flowNode, setFlowNode] = useState(ranked[0].id)
  const [waitNode, setWaitNode] = useState('')
  const waitCounts = waitNode
    ? metrics.nodes.find((n) => String(n.id) === waitNode)!.waitHistogram
    : metrics.nodes[0].waitHistogram.map((_, i) => metrics.nodes.reduce((sum, n) => sum + n.waitHistogram[i], 0))
  const peak = metrics.nodes.reduce((a, b) => (b.utilisation > a.utilisation ? b : a))
  const href = (node: number) => `/operations/network?sim=${run.id}&node=${node}`

  const series = (chart: (n: Network) => React.ReactNode) => {
    if (network.data) return <Suspense fallback={<p className="text-sm text-muted">Loading the chart…</p>}>{chart(network.data)}</Suspense>
    if (isExpired(network.error) || !run.retained) return <RunExpired run={run} what="The charts over time" />
    return <DataState error={network.error} />
  }
  const picker = (value: string, set: (v: string) => void, all: boolean) => (
    <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      Facility
      <select className={SELECT} value={value} onChange={(e) => set(e.target.value)}>
        {all && <option value="">All facilities</option>}
        {metrics.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
      {value !== '' && <Link className="text-perf underline" to={href(Number(value))}>Show on the network</Link>}
    </label>
  )
  const bars = (value: (n: RunMetrics['nodes'][number]) => number) =>
    metrics.nodes.map((n) => ({ key: String(n.id), label: n.name, value: value(n), text: pct(100 * value(n)), to: href(n.id) }))
  const labels = waitLabels(metrics.waitBoundsMs)

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><dl><Stat label="Facilities congested at some point" status="Simplified" value={int(metrics.summary.congestedFacilities)} note="Counted by the display rule below" /></dl></Card>
        <Card><dl><Stat label="Average queue wait per bag" value={duration(1000 * metrics.summary.averageWaitingTimeS)} note="Total time in all queues" /></dl></Card>
        <Card><dl><Stat label="Highest run utilisation" value={pct(100 * metrics.summary.maxUtilisation)} note={`${peak.name}. A long idle day lowers a whole-run average.`} /></dl></Card>
        <Card><dl><Stat label="Delayed bags" value={int(metrics.summary.delayedBags)} note={`${pct(metrics.summary.delayedPct, 3)} of bags`} /></dl></Card>
      </div>
      <StatusRuleNote rule={metrics.statusRule} />

      <Card>
        <CardTitle>Bottleneck ranking</CardTitle>
        <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Ranked by total queue time (average wait × arrivals): a BagFlow ranking rule. Click a facility to select it on the network.</span>
          <StatusLabel status="Simplified" />
        </p>
        <Table
          minWidth="60rem"
          head={['Facility', 'Rank', 'Worst status', 'Total queue time', 'Average wait', 'Longest queue', 'Utilisation (run)', 'Peak window', 'Source of values']}
          rows={ranked.map((n, i) => ({
            key: n.id,
            cells: [
              <Link key="f" className="font-sans text-perf underline" to={href(n.id)}>{n.name}</Link>,
              i + 1,
              <span key="p" className="inline-flex items-center gap-2 font-sans"><StatusPill status={n.status} /><StatusLabel status="Simplified" /></span>,
              duration(n.totalWaitMs), duration(1000 * n.avgWaitS), int(n.maxQueue), pct(100 * n.utilisation), pct(100 * n.peakWindowUtilisation),
              <span key="s" className="inline-flex flex-wrap justify-end gap-1"><StatusLabel status="Measured" /></span>,
            ],
          }))}
        />
        <p className="mt-2 text-xs text-muted">Total and average wait, longest queue and run utilisation are measured. Peak window uses the display rule’s window.</p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Utilisation by facility, whole run</CardTitle>
          <p className="mb-2 text-xs text-muted">Average share of servers busy. Click a name to select the facility on the network.</p>
          <BarList rows={bars((n) => n.utilisation)} />
        </Card>
        <Card>
          <CardTitle>Peak window utilisation by facility</CardTitle>
          <p className="mb-2 text-xs text-muted">The highest value of the display rule’s {metrics.statusRule.windowSamples}-sample window.</p>
          <BarList rows={bars((n) => n.peakWindowUtilisation)} status="Simplified" />
        </Card>
      </div>

      <Card>
        <CardTitle>Queue length over time</CardTitle>
        <p className="mb-2 text-xs text-muted">
          Engine samples, one per simulation minute. Long runs are drawn with each point the highest sample of its stretch. A shorter peak
          between samples is not in the series; the ranking’s longest queue is exact.
        </p>
        {series((n) => <QueueCharts network={n} href={href} />)}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle aside={<StatusLabel status="Measured" />}>Incoming vs outgoing</CardTitle>
          <p className="mb-2 text-xs text-muted">Bags arriving at and finishing at one facility per 15 simulation minutes. Bin edges are accurate to one sample.</p>
          {picker(String(flowNode), (v) => setFlowNode(Number(v)), false)}
          {series((n) => <FlowChart network={n} node={flowNode} />)}
        </Card>
        <Card>
          <CardTitle>Waiting-time distribution</CardTitle>
          <p className="mb-2 text-xs text-muted">Queue wait of each service start over the whole run; a bag counts once at each facility it visits. Bins have different widths.</p>
          {picker(waitNode, setWaitNode, true)}
          <BarList rows={waitCounts.map((c, i) => ({ key: labels[i], label: labels[i], value: c, text: int(c) }))} />
        </Card>
      </div>
    </>
  )
}

export function CongestionPage() {
  return (
    <OperationsFrame title="Congestion Analysis" subtitle="Where bags queued in this run.">
      {(run, metrics) => <Congestion run={run} metrics={metrics} />}
    </OperationsFrame>
  )
}
