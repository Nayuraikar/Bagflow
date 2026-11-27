import { Link } from 'react-router'
import { BASELINE_CONFIG } from '../../config/demo'
import { useBaselineJob } from '../../hooks/jobContext'
import type { DemoRuns } from '../../hooks/useDemoRuns'
import { fixed, int, pct } from '../../utils/format'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'
import { Stat } from '../parallel/Stat'
import { PhaseCard } from '../pipeline/PhaseCard'
import { QueueBars } from './QueueBars'
import { SimulationStepFrame } from './SimulationStepFrame'

export function SimulationStep({ runs }: { runs: DemoRuns }) {
  const { activeId } = useBaselineJob()
  const m = runs.simulation.metrics.data
  const phase = runs.simulation.simulation.data?.pipeline?.phases.find((p) => p.id === 'simulate')
  const id = runs.simulation.id
  return (
    <>
      <p className="text-sm">
        The engine moves each bag through the network one event at a time. Events must happen in time order, because who is served next
        depends on everything that happened before, so <strong>this part stays sequential</strong>.
      </p>
      <SimulationStepFrame step="simulation" state={runs.simulation} config={BASELINE_CONFIG} activeId={activeId} why="Full capacity: the Dashboard’s baseline.">
        {m && (
          <Card className="space-y-4">
            <CardTitle aside={<StatusLabel status="Real" />}>Movement, queues and deadlines</CardTitle>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Bags simulated" value={int(m.summary.totalBags)} />
              <Stat label="Missed their deadline" value={pct(m.summary.delayedPct, 3)} note={`${int(m.summary.delayedBags)} bags`} />
              <Stat label="Mean queueing time per bag" value={`${fixed(m.summary.averageWaitingTimeS / 60, 1)} min`} note="simulated time" />
              <Stat label="Longest queue at one facility" value={int(m.summary.maxQueue)} note="bags" />
            </dl>
            <QueueBars nodes={m.nodes} />
            {phase && (
              <div className="max-w-md">
                <h3 className="mb-1 text-sm font-semibold">Wall time of the simulation on this machine</h3>
                <PhaseCard phase={phase} />
              </div>
            )}
            <p className="flex flex-wrap gap-4 text-sm">
              <Link to={`/operations/network?sim=${id}`} className="text-perf underline">Watch it on the Airport Network</Link>
              <Link to={`/operations/congestion?sim=${id}`} className="text-perf underline">Congestion over time</Link>
            </p>
          </Card>
        )}
      </SimulationStepFrame>
    </>
  )
}
