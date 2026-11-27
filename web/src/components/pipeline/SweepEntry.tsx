import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useApiState } from '../../hooks/useHealth'
import { useHistory } from '../../hooks/useHistory'
import type { SweepRun } from '../../types/models'
import { EMPTY, dateTime, int, ms, times } from '../../utils/format'
import { Card, CardTitle } from '../common/Card'
import { DataState } from '../common/DataState'
import { StatusLabel } from '../common/StatusLabel'

function LatestSweep({ run }: { run: SweepRun }) {
  const s = run.summary!
  const c = s.consistency
  return (
    <>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>
          Latest saved sweep: {int(s.experimentCount)} experiments, {int(run.bagCount)} bags requested each, finished {dateTime(run.finishedAt)}.
        </span>
        <StatusLabel status="Measured" />
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-100 text-sm">
          <thead className="text-muted">
            <tr>
              {['Threads', 'Wall time', 'Speedup vs 1 thread', 'Source'].map((h) => (
                <th key={h} className="border-b border-line py-1.5 text-right font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {s.passes.map((p) => (
              <tr key={p.threads}>
                <td className="py-1 text-right">{int(p.threads)}</td>
                <td className="py-1 text-right">{ms(p.wallMs)}</td>
                <td className="py-1 text-right">{times(p.speedup)}</td>
                <td className="py-1 text-right font-sans"><StatusLabel status="Measured" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm">
        {!c.checked
          ? 'One-thread pass only, so results were not compared.'
          : c.allIdentical
            ? <>All <span className="font-mono">{int(c.comparedRuns)}</span> compared runs matched the 1-thread results. <StatusLabel status="Measured" /></>
            : <span className="text-critical">Some runs did not match the 1-thread results.</span>}
      </p>
    </>
  )
}

export function SweepEntry() {
  const { data, error } = useHistory()
  const offline = useApiState() === 'offline'
  const latest = data?.find((r): r is SweepRun => r.kind === 'sweep' && r.status === 'done' && r.summary !== null)
  return (
    <Card className="border-ops/50">
      <CardTitle>Where parallelism pays off: many simulations at once</CardTitle>
      <p className="mb-3 text-sm">
        Each simulation stays sequential, but independent experiments do not depend on each other, so a sweep can run many of them
        at the same time.
      </p>
      {latest ? (
        <LatestSweep run={latest} />
      ) : !data || offline ? (
        <DataState error={error} />
      ) : (
        <p className="text-sm text-muted">{EMPTY} No sweep result saved by this API yet.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link to="/experiments/sweeps" className="flex items-center gap-2 rounded-lg bg-ops px-4 py-2 text-sm font-semibold text-white">
          Run parallel sweep <ArrowRight size={15} aria-hidden />
        </Link>
        <span className="flex items-center gap-2 text-xs text-muted">
          <StatusLabel status="Planned" /> the sweep page is not built yet
        </span>
      </div>
    </Card>
  )
}
