import { CircleCheck, CircleX } from 'lucide-react'
import type { SweepMetrics, SweepPass } from '../../types/sweep'
import { EMPTY, int, msFine, pct, times } from '../../utils/format'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'
import { Table } from '../common/Table'
import { Stat } from '../parallel/Stat'

const identical = (p: SweepPass) =>
  p.isBaseline ? 'baseline' : p.identical ? 'identical' : <span className="text-critical">differs ({p.mismatches.length})</span>

const saved = (ms: number) => (ms < 0 ? `-${msFine(-ms)}` : msFine(ms))

export function SweepResults({ m }: { m: SweepMetrics }) {
  const baseline = m.passes.find((p) => p.isBaseline)!
  const others = m.passes.filter((p) => !p.isBaseline)
  const best = others.length ? others.reduce((a, b) => (b.wallMs < a.wallMs ? b : a)) : null
  const c = m.consistency
  const above = m.passes.filter((p) => !p.isBaseline && p.efficiencyPct > 100)
  return (
    <Card className="space-y-4">
      <CardTitle aside={<StatusLabel status="Real" />}>Results by thread count</CardTitle>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="1-thread wall time" value={msFine(baseline.wallMs)} />
        <Stat label={best ? `Shortest wall time (${best.threads} threads)` : 'Shortest parallel wall time'} value={msFine(best?.wallMs)} />
        <Stat
          label="Total time saved"
          value={best ? saved(best.timeSavedMs) : EMPTY}
          note={best ? `1-thread wall time minus the ${best.threads}-thread wall time, for the same grid.` : 'Only the 1-thread pass ran, so nothing was saved.'}
        />
      </dl>
      <Table
        minWidth="44rem"
        head={['Threads', 'Wall time', 'Speedup', 'Efficiency', 'Time saved', 'Completed', 'Failed', '1-thread check', 'Source']}
        rows={m.passes.map((p) => ({
          key: p.threads,
          cells: [
            `${p.threads}${p.requested ? '' : ' (added)'}`, msFine(p.wallMs), times(p.speedup), pct(p.efficiencyPct),
            p.isBaseline ? EMPTY : saved(p.timeSavedMs), int(p.completed), int(p.failed), identical(p),
            <StatusLabel key="s" status="Measured" />,
          ],
        }))}
      />
      {above.length > 0 && (
        <p className="rounded-lg border border-warning/60 bg-warning/10 p-3 text-sm">
          <strong>Efficiency above 100% at {above.map((p) => `${p.threads} threads`).join(', ')}.</strong> That is more than one thread’s worth
          of speedup per thread. Each pass is timed once, so do not take this figure literally; run the sweep again and compare.
        </p>
      )}
      <div
        role="status"
        className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm ${!c.checked ? 'border-line' : c.allIdentical ? 'border-ops/50 bg-ops/10' : 'border-critical bg-critical/10'}`}
      >
        {c.checked && (c.allIdentical ? <CircleCheck size={18} className="text-ops" aria-hidden /> : <CircleX size={18} className="text-critical" aria-hidden />)}
        {!c.checked ? (
          <span>{EMPTY} Only the 1-thread pass ran, so there is nothing to compare it with.</span>
        ) : (
          <>
            <strong>
              {c.allIdentical
                ? `All ${int(c.comparedRuns)} compared runs gave the 1-thread results.`
                : `Not all of the ${int(c.comparedRuns)} compared runs gave the 1-thread results.`}
            </strong>
            <StatusLabel status="Measured" />
          </>
        )}
      </div>
      <p className="text-xs text-muted">
        Wall time: {m.definitions.wall_ms.replace(' (prepare_ms)', '')}. Efficiency: {m.definitions.efficiency_pct}. The check: {m.definitions.identical_to_one_thread}.
      </p>
    </Card>
  )
}
