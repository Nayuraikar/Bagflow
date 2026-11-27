import { useApiState } from '../../hooks/useHealth'
import { useHistory } from '../../hooks/useHistory'
import type { Run } from '../../types/models'
import { EMPTY, dateTime, int, ms, pct, times } from '../../utils/format'
import { Card, CardTitle } from '../common/Card'
import { DataState } from '../common/DataState'
import { StatusLabel } from '../common/StatusLabel'

const SHOWN = 8

const KIND: Record<Run['kind'], string> = { simulation: 'Simulation', sweep: 'Sweep', parallel: 'Parallel run', benchmark: 'Benchmark' }

function workload(r: Run) {
  switch (r.kind) {
    case 'simulation':
      return `${r.config.scenario} · ${r.config.routing} · ${r.config.policy} · ${r.config.capacityPct}% · ×${r.config.serverMultiplier} servers · ${int(r.config.bagCount)} bags`
    case 'sweep':
      return `${int(r.summary?.experimentCount)} experiments · ${int(r.bagCount)} bags each`
    case 'parallel':
      return `${r.workload} · ${int(r.bagCount)} bags`
    case 'benchmark':
      return `${r.backends.join(', ')} · ${int(r.bagCount)} bags`
  }
}

/** `null` until the job has a result. */
function result(r: Run): string | null {
  if (!r.summary) return null
  switch (r.kind) {
    case 'simulation':
      return `${int(r.summary.delayedBags)} delayed (${pct(r.summary.delayedPct, 3)})`
    case 'sweep':
      return r.summary.passes.map((p) => `${p.threads} thr ${ms(p.wallMs)}`).join(' · ')
    case 'parallel':
      return `${r.summary.backend} · ${ms(r.summary.wallMs)} · ${times(r.summary.speedup)} vs sequential`
    case 'benchmark':
      return `${int(r.summary.results.length)} result rows`
  }
}

export function RecentRuns() {
  const { data, error } = useHistory()
  const offline = useApiState() === 'offline'
  return (
    <Card>
      <CardTitle>Recent runs</CardTitle>
      {/* an empty list loaded earlier says nothing once the API is gone */}
      {!data || (offline && data.length === 0) ? (
        <DataState error={error} />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted">{EMPTY} No runs saved yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="text-muted">
              <tr>
                {['Type', 'Workload and configuration', 'Status', 'Result', 'Source', 'Created'].map((h) => (
                  <th key={h} className="border-b border-line py-2 pr-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, SHOWN).map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-3" title={r.id}>{KIND[r.kind]}</td>
                  <td className="py-2 pr-3">{workload(r)}</td>
                  <td className={`py-2 pr-3 ${r.status === 'failed' ? 'text-critical' : ''}`} title={r.error ?? undefined}>{r.status}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{result(r) ?? EMPTY}</td>
                  <td className="py-2 pr-3">{result(r) === null ? EMPTY : <StatusLabel status="Measured" />}</td>
                  <td className="py-2 font-mono text-xs">{dateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
