import type { SimulationRun } from '../../types/models'
import { EMPTY, dateTime, int, pct } from '../../utils/format'
import { Card } from '../common/Card'
import type { Status } from '../common/status'
import { StatusLabel } from '../common/StatusLabel'

function Kpi({ title, value, note, status }: { title: string; value: string; note?: string; status: Status }) {
  return (
    <Card>
      <h3 className="text-sm text-muted">{title}</h3>
      <p className="my-1 font-mono text-2xl font-semibold">{value}</p>
      <div className="flex flex-wrap items-center gap-2">
        {value !== EMPTY && <StatusLabel status={status} />}
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
    </Card>
  )
}

export function KpiRow({ run, emptyText }: { run: SimulationRun | undefined; emptyText: string }) {
  const s = run?.summary
  const c = run?.config
  return (
    <section aria-labelledby="kpi-title">
      <h2 id="kpi-title" className="text-base font-semibold">Latest finished simulation</h2>
      <p className="mb-3 text-sm text-muted">
        {run && c
          ? `${c.scenario} · ${c.routing} · ${c.policy} · ${c.capacityPct}% capacity · server multiplier ${c.serverMultiplier} · ${int(c.bagCount)} bags requested · finished ${dateTime(run.finishedAt)}`
          : emptyText}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Total baggage" value={int(s?.totalBags)} note="bags simulated" status="Measured" />
        <Kpi title="Loaded on time" value={int(s?.loadedOnTime)} note={s ? `${pct(100 * s.onTimeLoadingRate, 3)} of bags` : undefined} status="Measured" />
        <Kpi title="Delayed bags" value={int(s?.delayedBags)} note={s ? `${pct(s.delayedPct, 3)} of bags` : undefined} status="Measured" />
        <Kpi title="Congested facilities" value={int(s?.congestedFacilities)} note="API display rule on engine samples" status="Simplified" />
      </div>
    </section>
  )
}
