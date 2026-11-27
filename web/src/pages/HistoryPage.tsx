import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Card, CardTitle } from '../components/common/Card'
import { DataState } from '../components/common/DataState'
import { StatusLabel } from '../components/common/StatusLabel'
import { RerunButton } from '../components/experiments/RerunButton'
import { RunCompare } from '../components/experiments/RunCompare'
import { RunLinks } from '../components/experiments/RunLinks'
import { useApiState } from '../hooks/useHealth'
import { useHistory } from '../hooks/useHistory'
import type { Run, SimulationRun, SweepRun } from '../types/models'
import { EMPTY, dateTime, int, ms, pct, times } from '../utils/format'
import { describeSimulation } from '../utils/runs'

const FILTERS = {
  main: 'Simulations and sweeps', simulation: 'Simulations', sweep: 'Sweeps', parallel: 'Parallel runs', benchmark: 'Benchmarks', all: 'Everything',
} as const
type Filter = keyof typeof FILTERS
const KIND: Record<Run['kind'], string> = { simulation: 'Simulation', sweep: 'Sweep', parallel: 'Parallel run', benchmark: 'Benchmark' }
const PAGE = 25

function settings(r: Run) {
  switch (r.kind) {
    case 'simulation': return describeSimulation(r.config, int)
    case 'sweep': return `${int(r.summary?.experimentCount)} experiments · ${int(r.bagCount)} bags each`
    case 'parallel': return `${r.workload} · ${int(r.bagCount)} bags`
    case 'benchmark': return `${r.backends.join(', ')} · ${int(r.bagCount)} bags`
  }
}

/** `null` until the job has a result. */
function result(r: Run) {
  if (!r.summary) return null
  switch (r.kind) {
    case 'simulation': return `${int(r.summary.delayedBags)} delayed (${pct(r.summary.delayedPct, 3)})`
    case 'sweep': return r.summary.passes.map((p) => `${p.threads} thr ${ms(p.wallMs)}`).join(' · ')
    case 'parallel': return `${r.summary.backend} · ${ms(r.summary.wallMs)} · ${times(r.summary.speedup)}`
    case 'benchmark': return `${int(r.summary.results.length)} result rows`
  }
}

const OPEN: Record<Exclude<Run['kind'], 'simulation'>, [string, string]> = {
  sweep: ['/experiments/sweeps?run=', 'Open sweep'],
  parallel: ['/operations/parallel-studio?run=', 'Open in the studio'],
  benchmark: ['/performance?run=', 'Open benchmark'],
}

function Actions({ run }: { run: Run }) {
  if (run.status !== 'done') {
    return run.kind === 'simulation' && run.status === 'failed' ? <RerunButton run={run} /> : <span className="text-muted">{EMPTY}</span>
  }
  if (run.kind !== 'simulation') {
    const [to, text] = OPEN[run.kind]
    return <Link to={to + run.id} className="text-perf underline">{text}</Link>
  }
  return (
    <div className="space-y-1.5">
      <RunLinks id={run.id} retained={run.retained} />
      {!run.retained && <RerunButton run={run} />}
    </div>
  )
}

const comparable = (r: Run | undefined): r is SimulationRun | SweepRun =>
  r !== undefined && r.status === 'done' && (r.kind === 'simulation' || r.kind === 'sweep')

export function HistoryPage() {
  const history = useHistory()
  const offline = useApiState() === 'offline'
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('main')
  const [shown, setShown] = useState(PAGE)
  const picked = params.get('compare')?.split(',').filter(Boolean) ?? []
  const runs = (history.data ?? []).filter((r) =>
    filter === 'all' ? true : filter === 'main' ? r.kind === 'simulation' || r.kind === 'sweep' : r.kind === filter)
  const chosen = picked.map((id) => history.data?.find((r) => r.id === id)).filter(comparable)
  const pick = (ids: string[]) =>
    setParams((p) => {
      if (ids.length) p.set('compare', ids.join(','))
      else p.delete('compare')
      return p
    }, { replace: true })
  const canPick = (r: Run) => comparable(r) && (picked.includes(r.id) || (picked.length < 2 && (chosen.length === 0 || chosen[0].kind === r.kind)))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Simulation History</h1>
        <p className="text-sm text-muted">
          Saved runs, newest first. Settings and summaries are saved on disk; bag histories and time-series stay for the 3 newest simulations
          only. There is no export or delete: the API supports neither.
        </p>
      </div>
      {chosen.length === 2 && <RunCompare a={chosen[0]} b={chosen[1]} onClose={() => pick([])} />}
      <Card>
        <CardTitle
          aside={
            <label className="flex items-center gap-2 text-sm">
              Show
              <select className="rounded-lg border border-line bg-surface px-2 py-1" value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setShown(PAGE) }}>
                {Object.entries(FILTERS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          }
        >
          Runs
        </CardTitle>
        <p className="mb-2 text-sm" aria-live="polite">
          {chosen.length === 0 && 'Tick two finished simulations, or two finished sweeps, to compare them.'}
          {chosen.length === 1 && `One ${chosen[0].kind} selected. Tick one more of the same kind.`}
          {chosen.length === 2 && 'Comparing the two ticked runs, shown above.'}
          {picked.length > 0 && <button type="button" onClick={() => pick([])} className="ml-2 text-perf underline">Clear</button>}
        </p>
        {offline && history.data && <p className="mb-2 text-sm text-critical">API unreachable. This list was loaded earlier.</p>}
        {!history.data || (offline && history.data.length === 0) ? (
          <DataState error={history.error} />
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted">{EMPTY} No saved runs of this kind.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-200 text-left text-sm">
              <thead className="text-muted">
                <tr>{['Compare', 'Run', 'Settings', 'Status', 'Result', 'Open'].map((h) => <th key={h} className="border-b border-line py-2 pr-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {runs.slice(0, shown).map((r) => (
                  <tr key={r.id} data-run={r.id} className="border-b border-line align-top last:border-0">
                    <td className="py-2 pr-3">
                      {r.kind === 'simulation' || r.kind === 'sweep' ? (
                        <input
                          type="checkbox" className="accent-ops" aria-label={`Compare ${r.id}`} checked={picked.includes(r.id)} disabled={!canPick(r)}
                          onChange={(e) => pick(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))}
                        />
                      ) : <span className="text-muted">{EMPTY}</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {KIND[r.kind]}
                      <span className="block text-xs text-muted">{dateTime(r.createdAt)}</span>
                      <span className="block max-w-40 font-mono text-[10px] break-all text-muted">{r.id}</span>
                    </td>
                    <td className="py-2 pr-3">{settings(r)}</td>
                    <td className="py-2 pr-3">
                      <span className={r.status === 'failed' ? 'text-critical' : ''}>{r.status}</span>
                      {r.error && <span className="block max-w-48 text-xs text-critical">{r.error}</span>}
                      {r.kind === 'simulation' && r.status === 'done' && (
                        <span className={`block text-xs ${r.retained ? 'text-ops' : 'text-muted'}`}>{r.retained ? 'detailed data available' : 'detailed data expired'}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs">{result(r) ?? EMPTY}</span>
                      {result(r) !== null && <span className="mt-1 block"><StatusLabel status="Measured" /></span>}
                    </td>
                    <td className="py-2"><Actions run={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {runs.length > shown && (
          <button type="button" onClick={() => setShown((s) => s + PAGE)} className="mt-3 text-sm text-perf underline">Show more ({int(runs.length - shown)} older)</button>
        )}
      </Card>
    </div>
  )
}
