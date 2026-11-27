import { useBaselineJob } from '../../hooks/jobContext'
import type { DemoRuns } from '../../hooks/useDemoRuns'
import { PROBLEM_CONFIG } from '../../config/demo'
import { fixed, int, pct } from '../../utils/format'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'
import { Stat } from '../parallel/Stat'
import { QueueBars } from './QueueBars'
import { SimulationStepFrame } from './SimulationStepFrame'

export function ProblemStep({ runs }: { runs: DemoRuns }) {
  const { activeId } = useBaselineJob()
  const m = runs.problem.metrics.data
  const worst = m?.nodes.reduce((a, b) => (b.maxQueue > a.maxQueue ? b : a))
  return (
    <>
      <Card className="space-y-2 text-sm">
        <p>
          Every bag has a deadline for being loaded. It queues at check-in, identification, screening, sorting and loading. When a facility
          cannot keep up, its queue grows and bags miss their flights. An operator wants to know which routing, queue rule or capacity
          change helps, and that means simulating many alternatives.
        </p>
        <p className="text-muted">All data is synthetic. This is a simulation study, not a real airport.</p>
      </Card>
      <SimulationStepFrame
        step="problem" state={runs.problem} config={PROBLEM_CONFIG} activeId={activeId}
        why="Capacity is cut to 70% on purpose, to make congestion appear. It is a stress setting chosen for this demo."
      >
        {m && worst && (
          <Card className="space-y-4">
            <CardTitle aside={<StatusLabel status="Real" />}>With 70% of the servers</CardTitle>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Bags that missed their deadline" value={pct(m.summary.delayedPct, 3)} note={`${int(m.summary.delayedBags)} of ${int(m.summary.totalBags)} bags`} />
              <Stat label="Mean queueing time per bag" value={`${fixed(m.summary.averageWaitingTimeS / 60, 1)} min`} note="simulated time" />
              <Stat label={`Longest queue: ${worst.name}`} value={int(worst.maxQueue)} note="bags waiting at one moment" />
              <Stat label="Congested facilities" value={int(m.summary.congestedFacilities)} status="Simplified" note="API display rule on engine samples" />
            </dl>
            <QueueBars nodes={m.nodes} />
          </Card>
        )}
      </SimulationStepFrame>
    </>
  )
}
