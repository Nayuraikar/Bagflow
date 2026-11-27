import { Play } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Health } from '../../types/models'
import { int } from '../../utils/format'
import { sweepProblems, sweepSize, toRequest, type SweepForm } from '../../utils/sweep'
import { Card, CardTitle } from '../common/Card'

const FIELD = 'mt-1 block w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-sm'

function Choices({ title, all, chosen, onChange }: { title: string; all: string[]; chosen: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="text-sm">
      <legend className="mb-1 text-xs text-muted">{title}</legend>
      {all.map((v) => (
        <label key={v} className="flex items-center gap-2">
          <input
            type="checkbox" className="accent-ops" checked={chosen.includes(v)}
            // keep the API's order, whatever the order of the clicks
            onChange={(e) => onChange(all.filter((x) => (x === v ? e.target.checked : chosen.includes(x))))}
          />
          <span className="font-mono text-xs">{v}</span>
        </label>
      ))}
    </fieldset>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="text-xs text-muted">{label}{children}</label>
}

interface Props {
  form: SweepForm
  health: Health
  onChange: (patch: Partial<SweepForm>) => void
  onRun: () => void
  busy: boolean
  offline: boolean
  error: string | null
}

export function SweepConfiguration({ form, health, onChange, onRun, busy, offline, error }: Props) {
  const limits = health.sweep
  const request = toRequest(form)
  const problems = sweepProblems(request, limits)
  const size = sweepSize(request)
  return (
    <Card>
      <CardTitle>Configure the sweep</CardTitle>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          onRun()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Choices title="Scenarios" all={limits.scenarios} chosen={form.scenarios} onChange={(scenarios) => onChange({ scenarios })} />
          <Choices title="Routing strategies" all={limits.routings} chosen={form.routings} onChange={(routings) => onChange({ routings })} />
          <Choices title="Queue policies" all={limits.policies} chosen={form.policies} onChange={(policies) => onChange({ policies })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Capacity values, % (comma-separated)"><input className={FIELD} value={form.capacities} onChange={(e) => onChange({ capacities: e.target.value })} /></Field>
          <Field label="Thread counts (1 always runs first)"><input className={FIELD} value={form.threads} onChange={(e) => onChange({ threads: e.target.value })} /></Field>
          <Field label="Bags requested per simulation"><input className={FIELD} inputMode="numeric" value={form.bagCount} onChange={(e) => onChange({ bagCount: e.target.value })} /></Field>
          <Field label="Server multiplier"><input className={FIELD} inputMode="numeric" value={form.serverMultiplier} onChange={(e) => onChange({ serverMultiplier: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            This form: <span className="font-mono">{int(size.experiments)}</span> experiments (limit {int(limits.maxExperiments)}) ×{' '}
            <span className="font-mono">{int(size.passes)}</span> passes, 1-thread baseline included ·{' '}
            <span className="font-mono">{int(size.simulatedBags)}</span> requested bags in all (limit {int(limits.maxSimulatedBags)}).
          </p>
          <button
            type="submit" disabled={busy || offline || problems.length > 0}
            className="flex items-center gap-2 rounded-lg bg-ops px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Play size={15} aria-hidden />
            {busy ? 'In progress…' : 'Run sweep'}
          </button>
        </div>
        {problems.map((p) => <p key={p} role="alert" className="text-sm text-critical">{p}</p>)}
        {error && <p role="alert" className="text-sm text-critical">{error}</p>}
      </form>
    </Card>
  )
}
