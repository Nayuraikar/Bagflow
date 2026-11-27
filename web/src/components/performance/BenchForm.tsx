import { Play } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Health } from '../../types/models'
import { benchProblems, toBenchRequest, type BenchFormState } from '../../utils/bench'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'

const FIELD = 'mt-1 block w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-sm'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="text-xs text-muted">{label}{children}</label>
}

interface Props {
  form: BenchFormState
  health: Health
  onChange: (patch: Partial<BenchFormState>) => void
  onRun: () => void
  busy: boolean
  offline: boolean
  error: string | null
}

export function BenchForm({ form, health, onChange, onRun, busy, offline, error }: Props) {
  const problems = benchProblems(toBenchRequest(form), health.benchmark)
  const ids = health.backends.map((b) => b.id)
  return (
    <Card>
      <CardTitle>Benchmark the deadline-risk kernel</CardTitle>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          onRun()
        }}
      >
        <fieldset>
          <legend className="mb-1 text-xs text-muted">Backends</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {health.backends.map((b) => (
              <label key={b.id} className={`flex items-center gap-1.5 font-mono text-xs ${b.available ? '' : 'text-muted'}`} title={b.reason ?? undefined}>
                <input
                  type="checkbox" className="accent-ops" disabled={!b.available} checked={form.backends.includes(b.id)}
                  onChange={(e) => onChange({ backends: ids.filter((x) => (x === b.id ? e.target.checked : form.backends.includes(x))) })}
                />
                {b.id}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="text-xs">
          <p className="mb-1 flex items-center gap-2 text-muted">Not selectable <StatusLabel status="Unavailable" /></p>
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {health.backends.filter((b) => !b.available).map((b) => (
              <li key={b.id}><span className="font-mono">{b.id}</span> <span className="text-muted">— {b.reason ?? 'no reason given'}</span></li>
            ))}
          </ul>
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Bags requested"><input className={FIELD} inputMode="numeric" value={form.bagCount} onChange={(e) => onChange({ bagCount: e.target.value })} /></Field>
          <Field label="Thread counts for Rayon backends"><input className={FIELD} value={form.threads} onChange={(e) => onChange({ threads: e.target.value })} /></Field>
          <Field label="Timed repetitions"><input className={FIELD} inputMode="numeric" value={form.repetitions} onChange={(e) => onChange({ repetitions: e.target.value })} /></Field>
          <Field label="Warm-up repetitions"><input className={FIELD} inputMode="numeric" value={form.warmup} onChange={(e) => onChange({ warmup: e.target.value })} /></Field>
          <button
            type="submit" disabled={busy || offline || problems.length > 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-ops px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Play size={15} aria-hidden />
            {busy ? 'In progress…' : 'Run benchmark'}
          </button>
        </div>
        {problems.map((p) => <p key={p} role="alert" className="text-sm text-critical">{p}</p>)}
        {error && <p role="alert" className="text-sm text-critical">{error}</p>}
      </form>
    </Card>
  )
}
