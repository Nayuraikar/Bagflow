import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useApiState } from '../../hooks/useHealth'
import { useHistory } from '../../hooks/useHistory'
import { useSweepMetrics } from '../../hooks/useSweep'
import type { SweepRun } from '../../types/models'
import { EMPTY, dateTime, int, msFine, pct, times } from '../../utils/format'
import { NOISE_PCT, repeatSpread } from '../../utils/sweep'
import { Card, CardTitle } from '../common/Card'
import { DataState } from '../common/DataState'
import { RealBanner } from '../common/RealBanner'
import { StatusLabel } from '../common/StatusLabel'
import { Table } from '../common/Table'

function LatestSweep({ run, repeats }: { run: SweepRun; repeats: SweepRun[] }) {
  const { data: m, error } = useSweepMetrics(run.id)
  if (!m) return <DataState error={error} />
  const c = m.consistency
  const noisy = repeatSpread(repeats).filter((r) => r.noisy)
  return (
    <div className="space-y-2">
      <RealBanner machine={m.machine} debugBuild={m.debugBuild}>
        latest finished sweep: {int(m.experiments.length)} experiments, {int(m.config.bagCount)} bags requested each, finished {dateTime(run.finishedAt)}
      </RealBanner>
      <Table
        head={['Threads', 'Wall time', 'Speedup vs 1 thread', 'Efficiency', 'Time saved', 'Source']}
        rows={m.passes.map((p) => ({
          key: p.threads,
          cells: [
            p.threads, msFine(p.wallMs), times(p.speedup), pct(p.efficiencyPct),
            p.isBaseline ? EMPTY : `${p.timeSavedMs < 0 ? '-' : ''}${msFine(Math.abs(p.timeSavedMs))}`,
            <StatusLabel key="s" status="Measured" />,
          ],
        }))}
      />
      {noisy.length > 0 && (
        <p role="alert" className="rounded-lg border border-warning bg-warning/15 p-3 text-sm">
          <strong>Noisy timings.</strong> {int(repeats.length)} saved sweeps with these settings differ by more than {NOISE_PCT}% at{' '}
          {noisy.map((r) => `${r.threads} thread${r.threads === 1 ? '' : 's'}`).join(', ')}. Treat these speedups as approximate.
        </p>
      )}
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {!c.checked ? (
          'One-thread pass only, so results were not compared.'
        ) : (
          <>
            <span className={c.allIdentical ? '' : 'text-critical'}>
              {c.allIdentical ? `All ${int(c.comparedRuns)} compared runs matched the 1-thread results.` : 'Some runs did not match the 1-thread results.'}
            </span>
            <StatusLabel status="Measured" />
          </>
        )}
      </p>
    </div>
  )
}

export function SweepEntry() {
  const { data, error } = useHistory()
  const offline = useApiState() === 'offline'
  const latest = data?.find((r): r is SweepRun => r.kind === 'sweep' && r.status === 'done')
  return (
    <Card className="border-ops/50">
      <CardTitle>Where parallelism pays off: many simulations at once</CardTitle>
      <p className="mb-3 text-sm">
        Each simulation stays sequential, but independent experiments do not depend on each other, so a sweep can run many of them
        at the same time.
      </p>
      {latest ? (
        <LatestSweep
          run={latest}
          repeats={data!.filter((r): r is SweepRun => r.kind === 'sweep' && r.status === 'done' && r.configHash === latest.configHash)}
        />
      ) : !data || offline ? (
        <DataState error={error} />
      ) : (
        <p className="text-sm text-muted">{EMPTY} No sweep result saved by this API yet.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link to="/experiments/sweeps" className="flex items-center gap-2 rounded-lg bg-ops px-4 py-2 text-sm font-semibold text-white">
          Open parallel sweeps <ArrowRight size={15} aria-hidden />
        </Link>
        {latest && <Link to={`/experiments/sweeps?run=${latest.id}`} className="text-sm text-perf underline">Replay this sweep</Link>}
      </div>
    </Card>
  )
}
