import { Play } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Health } from '../../types/models'
import type { ParallelRequest, Workload } from '../../types/parallel'
import { EMPTY } from '../../utils/format'
import { requestProblem, WORKLOADS } from '../../utils/parallelRequest'
import { takesThreads } from '../../utils/telemetry'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'

const FIELD = 'mt-1 block w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-sm disabled:opacity-50'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs text-muted">
      {label}
      {children}
    </label>
  )
}

interface Props {
  request: ParallelRequest
  health: Health | undefined
  onChange: (patch: Partial<ParallelRequest>) => void
  onRun: () => void
  busy: boolean
  offline: boolean
  error: string | null
}

export function WorkloadInput({ request, health, onChange, onRun, busy, offline, error }: Props) {
  const backends = health?.parallel.workloads.find((w) => w.id === request.workload)?.backends ?? []
  const unavailable = request.workload === 'classify' ? (health?.backends.filter((b) => !b.available) ?? []) : []
  const problem = health ? requestProblem(request, health) : null
  const number = (v: number) => (Number.isNaN(v) ? '' : v)
  const read = (v: string) => (v === '' ? NaN : Number(v))
  return (
    <Card>
      <CardTitle>Workload</CardTitle>
      <form
        className="grid items-end gap-3 sm:grid-cols-3 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault()
          onRun()
        }}
      >
        <Field label="Workload">
          <select className={FIELD} value={request.workload} onChange={(e) => onChange({ workload: e.target.value as Workload })}>
            {Object.entries(WORKLOADS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
        <Field label="Backend">
          <select className={FIELD} value={request.backend} disabled={!health} onChange={(e) => onChange({ backend: e.target.value })}>
            {!health && <option value={request.backend}>{EMPTY}</option>}
            {backends.map((id) => <option key={id} value={id}>{id}</option>)}
            {unavailable.map((b) => <option key={b.id} value={b.id} disabled>{b.id} (unavailable)</option>)}
          </select>
        </Field>
        <Field label={takesThreads(request.backend) ? 'Threads' : 'Threads (not selectable)'}>
          {takesThreads(request.backend) ? (
            <input className={FIELD} type="number" value={number(request.threads)} onChange={(e) => onChange({ threads: read(e.target.value) })} />
          ) : (
            <input className={FIELD} disabled value={EMPTY} />
          )}
        </Field>
        <Field label="Bags requested">
          <input className={FIELD} type="number" step={1000} value={number(request.bagCount)} onChange={(e) => onChange({ bagCount: read(e.target.value) })} />
        </Field>
        <Field label="Timed repetitions">
          <input className={FIELD} type="number" value={number(request.repetitions)} onChange={(e) => onChange({ repetitions: read(e.target.value) })} />
        </Field>
        <button
          type="submit"
          disabled={busy || offline || !health || problem !== null}
          className="flex items-center justify-center gap-2 rounded-lg bg-ops px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Play size={15} aria-hidden />
          {busy ? 'In progress…' : 'Measure'}
        </button>
      </form>
      {problem && <p className="mt-2 text-sm text-critical">{problem}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
      {unavailable.length > 0 && (
        <div className="mt-3 text-xs">
          <p className="mb-1 flex items-center gap-2 text-muted">Not selectable <StatusLabel status="Unavailable" /></p>
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {unavailable.map((b) => (
              <li key={b.id}><span className="font-mono">{b.id}</span> <span className="text-muted">— {b.reason ?? 'no reason given'}</span></li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
