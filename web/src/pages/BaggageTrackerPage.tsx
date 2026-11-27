import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Card, CardTitle } from '../components/common/Card'
import { DataState } from '../components/common/DataState'
import { StatusLabel } from '../components/common/StatusLabel'
import { BagDrawer } from '../components/operations/BagDrawer'
import { RedirectedBadge } from '../components/operations/RedirectedBadge'
import { RunExpired } from '../components/operations/RunExpired'
import { OperationsFrame } from '../components/operations/SelectedRun'
import { Stat } from '../components/parallel/Stat'
import { BAG_STATUS_LABEL, DEFAULT_PLAYBACK_MS, FINAL_STATUSES, NOT_PRODUCED, PLAYBACK_STATUSES, PRIORITY_LABEL } from '../config/ops'
import { isExpired, useBaggage } from '../hooks/useRunData'
import type { SimulationRun } from '../types/models'
import type { Bag, BagQuery, BagStatus, RunMetrics } from '../types/ops'
import { EMPTY, int } from '../utils/format'
import { simClock } from '../utils/simTime'

const PAGE_SIZES = [25, 100, 500]
const CONTROL = 'rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-heading'
type Sort = NonNullable<BagQuery['sort']>

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs text-muted">{label}{children}</label>
}

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 9)

function Tracker({ run, metrics }: { run: SimulationRun; metrics: RunMetrics }) {
  const endMs = metrics.summary.endMs
  const initial = Math.min(DEFAULT_PLAYBACK_MS, endMs)
  const [final, setFinal] = useState(false)
  const [slider, setSlider] = useState(initial)
  const [time, setTime] = useState(initial)
  const [filters, setFilters] = useState<{ q: string; flight: string; status: BagStatus | ''; node: string }>({ q: '', flight: '', status: '', node: '' })
  const [sort, setSort] = useState<{ key: Sort; order: 'asc' | 'desc' }>({ key: 'id', order: 'asc' })
  const [paging, setPaging] = useState({ page: 1, size: PAGE_SIZES[0] })
  const [open, setOpen] = useState<number | null>(null)

  const atMs = final ? undefined : time
  const table = useBaggage(run.id, {
    atMs, page: paging.page, pageSize: paging.size, q: filters.q, flight: filters.flight, node: filters.node,
    status: filters.status || undefined, sort: sort.key, order: sort.order,
  })
  if (isExpired(table.error) || (!run.retained && !table.data)) return <RunExpired run={run} what="The bag table and timelines" />
  const data = table.error ? undefined : table.data
  const counts = data?.counts
  const pages = data ? Math.max(1, Math.ceil(data.total / paging.size)) : 1
  const name = (id: number | null) => metrics.nodes.find((n) => n.id === id)?.name ?? EMPTY
  const location = (b: Bag) => (b.currentNode !== null ? name(b.currentNode) : b.nextNode !== null ? `→ ${name(b.nextNode)} (travelling)` : EMPTY)
  const first = () => setPaging((p) => ({ ...p, page: 1 }))
  const filter = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    first()
  }
  // ask the API only when the slider is released, not on every step of a drag
  const commit = () => {
    if (slider !== time) {
      setTime(slider)
      first()
    }
  }
  const sortable = (key: Sort, label: string) => (
    <th className="px-2 py-2 font-medium" aria-sort={sort.key === key ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button" className="flex items-center gap-1 underline decoration-dotted"
        onClick={() => {
          setSort({ key, order: sort.key === key && sort.order === 'asc' ? 'desc' : 'asc' })
          first()
        }}
      >
        {label}
        {sort.key === key && (sort.order === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
      </button>
    </th>
  )
  const th = (label: string) => <th className="px-2 py-2 font-medium">{label}</th>

  return (
    <>
      <Card className="flex flex-wrap items-center gap-3">
        <Field label="Show bags">
          <select
            className={CONTROL} value={final ? 'final' : 'time'}
            onChange={(e) => {
              setFinal(e.target.value === 'final')
              filter({ status: '', node: '' })
            }}
          >
            <option value="time">At a playback time</option>
            <option value="final">At the end of the run</option>
          </select>
        </Field>
        <input
          type="range" aria-label="Playback time" className="min-w-40 flex-1 accent-ops disabled:opacity-40" disabled={final}
          min={0} max={endMs} step={1000} value={slider} aria-valuetext={simClock(slider)}
          onChange={(e) => setSlider(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit}
        />
        <output className="font-mono text-sm">{final ? 'end of run' : simClock(slider)}</output>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><dl><Stat label="Total bags" value={int(counts?.total)} note={counts && !final ? `${int(counts.notArrived)} not arrived yet` : 'All bags in the run'} /></dl></Card>
        <Card><dl><Stat label="In transit (on a link)" value={int(counts?.travelling)} note={counts ? `${int(counts.inService)} more are in service` : undefined} /></dl></Card>
        <Card><dl><Stat label="Waiting (in a queue)" value={int(counts?.waiting)} /></dl></Card>
        <Card><dl><Stat label="Delayed" value={int(counts?.delayed)} note={final ? 'Loaded after the deadline' : 'Loaded after the deadline so far; overdue bags still in the system are not counted'} /></dl></Card>
      </div>
      <p className="text-xs text-muted">
        {final ? 'At the end of the run every bag has been loaded, so none are waiting or in transit.' : `Counts at ${simClock(time)}.`} The cards
        cover the whole run; the filters apply to the table only. {NOT_PRODUCED}
      </p>

      <Card>
        <CardTitle aside={<StatusLabel status="Real" />}>Bags</CardTitle>
        <form className="mb-3 flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()} role="search">
          <Field label="Bag id (exact)">
            <input className={`${CONTROL} w-32`} inputMode="numeric" value={filters.q} onChange={(e) => filter({ q: digits(e.target.value) })} />
          </Field>
          <Field label="Flight number">
            <input className={`${CONTROL} w-32`} inputMode="numeric" value={filters.flight} onChange={(e) => filter({ flight: digits(e.target.value) })} />
          </Field>
          <Field label="Status">
            <select className={CONTROL} value={filters.status} onChange={(e) => filter({ status: e.target.value as BagStatus | '' })}>
              <option value="">Any</option>
              {(final ? FINAL_STATUSES : PLAYBACK_STATUSES).map((s) => <option key={s} value={s}>{BAG_STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label={final ? 'Facility visited' : 'At facility now'}>
            <select className={CONTROL} value={filters.node} onChange={(e) => filter({ node: e.target.value })}>
              <option value="">Any</option>
              {metrics.nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </Field>
          <button type="button" className={CONTROL} onClick={() => filter({ q: '', flight: '', status: '', node: '' })}>Clear filters</button>
        </form>
        <p className="mb-3 text-xs text-muted">The API sorts by bag id, arrival or deadline; use those column headers.</p>
        {run.config.scenario === 'SorterOverload' && (
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <RedirectedBadge />
            marks bags that SorterOverload sent to Loading area 1. Their flight number is the original one.
          </p>
        )}
        {!data ? (
          <DataState error={table.error} />
        ) : (
          <div className={`overflow-x-auto ${table.isPlaceholderData ? 'opacity-50' : ''}`} aria-busy={table.isFetching}>
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  {sortable('id', 'Bag id')}
                  {th('Flight')}
                  {th(final ? 'Final location' : 'Current location')}
                  {th('Status')}
                  {th('Priority')}
                  {sortable('arrival', 'Arrival')}
                  {sortable('deadline', 'Deadline')}
                  {th('Departure')}
                </tr>
              </thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-bg" onClick={() => setOpen(b.id)}>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button type="button" className="font-mono text-perf underline">{b.id}</button>
                      {b.redirected && <span className="ml-2"><RedirectedBadge /></span>}
                    </td>
                    <td className="px-2 py-2 font-mono">{b.flightId}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{location(b)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={b.status === 'DELAYED' ? 'text-critical' : ''}>{b.status ? BAG_STATUS_LABEL[b.status] : 'Not arrived'}</span>
                      {b.overdue && <span className="ml-1.5 text-xs text-critical">overdue</span>}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{PRIORITY_LABEL[b.priority] ?? b.priority}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{simClock(b.arrivalMs)}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{simClock(b.deadlineMs)}</td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{simClock(b.departureMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 && <p className="pt-3 text-sm text-muted">{EMPTY} No bags match these filters.</p>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span aria-live="polite" className="flex flex-wrap items-center gap-2">
            <span data-testid="matching">{int(data?.total)} matching bags. Page {int(data ? paging.page : undefined)} of {int(data ? pages : undefined)}.</span>
            {data && <StatusLabel status="Measured" />}
          </span>
          <label className="flex items-center gap-2">
            Rows per page
            <select className={CONTROL} value={paging.size} onChange={(e) => setPaging({ page: 1, size: Number(e.target.value) })}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="ml-auto flex gap-2">
            {([['First', 1], ['Previous', paging.page - 1], ['Next', paging.page + 1], ['Last', pages]] as const).map(([label, to]) => (
              <button
                key={label} type="button" className={`${CONTROL} disabled:opacity-40`}
                disabled={!data || to < 1 || to > pages || to === paging.page} onClick={() => setPaging((p) => ({ ...p, page: to }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>
      <BagDrawer runId={run.id} bag={open} atMs={atMs} nodes={metrics.nodes} onClose={() => setOpen(null)} />
    </>
  )
}

export function BaggageTrackerPage() {
  return (
    <OperationsFrame title="Baggage Tracker" subtitle="Search bags and follow one through the run. All bags, flights and passengers are synthetic.">
      {(run, metrics) => <Tracker run={run} metrics={metrics} />}
    </OperationsFrame>
  )
}
