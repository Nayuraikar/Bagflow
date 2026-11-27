import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import type { SimulationRun } from '../../types/models'
import { int, pct } from '../../utils/format'
import { StatusLabel } from '../common/StatusLabel'

/** "Most bags": more than this share delayed. */
const SATURATED_PCT = 50

/** Shown whenever most bags of the run were delayed. */
export function SaturationBanner({ run }: { run: SimulationRun }) {
  const s = run.summary
  if (!s || s.delayedPct <= SATURATED_PCT) return null
  const { bagCount, serverMultiplier, capacityPct } = run.config
  return (
    <div role="alert" data-testid="saturation" className="flex gap-3 rounded-xl border border-warning bg-warning/10 p-4 text-sm">
      <TriangleAlert size={20} className="shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <span>
            Saturated run: {int(s.delayedBags)} of {int(s.totalBags)} bags ({pct(s.delayedPct, 3)}) were delayed in simulation{' '}
            <span className="font-mono text-xs break-all">{run.id}</span>.
          </span>
          <StatusLabel status="Measured" />
        </p>
        <p>
          It ran {int(bagCount)} requested bags with <strong>server multiplier ×{serverMultiplier}</strong> and {capacityPct}% capacity. The
          server multiplier multiplies the number of servers at every facility. Servers are fixed apart from that and the capacity setting:
          they do <strong>not</strong> grow with the bag count, and all bags arrive within one synthetic day. When bags reach a facility faster
          than its servers can serve them, its queue keeps growing and bags miss their deadlines.
        </p>
        <p>
          Read these results as an overloaded system, not normal operation. To compare under less load, raise the server multiplier, raise
          capacity or use fewer bags in the <Link to="/experiments/scenarios" className="text-perf underline">Scenario Studio</Link>.
        </p>
      </div>
    </div>
  )
}
