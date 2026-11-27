import { Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { SCENARIO_NOTES } from '../../config/ops'
import type { Health, SimulationConfig } from '../../types/models'
import { int } from '../../utils/format'
import type { ScenarioFormState } from '../../utils/scenario'
import { scenarioProblems, toSimulationConfig } from '../../utils/scenario'
import { Card, CardTitle } from '../common/Card'

const FIELD = 'mt-1 block w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-heading'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted">{label}{children}</label>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

interface Props {
  form: ScenarioFormState
  health: Health
  onChange: (patch: Partial<ScenarioFormState>) => void
  onRun: (config: SimulationConfig) => void
  busy: boolean
  offline: boolean
  error: string | null
}

export function ScenarioForm({ form, health, onChange, onRun, busy, offline, error }: Props) {
  const limits = health.simulation
  const config = toSimulationConfig(form)
  const problems = scenarioProblems(config, limits)
  const range = ([lo, hi]: [number, number]) => `${int(lo)} to ${int(hi)}`
  const select = (label: string, key: 'scenario' | 'routing' | 'policy', options: string[], hint?: string) => (
    <Field label={label} hint={hint}>
      <select className={FIELD} value={form[key]} onChange={(e) => onChange({ [key]: e.target.value })}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  )
  const number = (label: string, key: 'capacityPct' | 'serverMultiplier' | 'bagCount' | 'threads', hint: string) => (
    <Field label={label} hint={hint}>
      <input className={FIELD} inputMode="numeric" value={form[key]} onChange={(e) => onChange({ [key]: e.target.value })} />
    </Field>
  )
  return (
    <Card>
      <CardTitle>Configure a run</CardTitle>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!problems.length) onRun(config)
        }}
      >
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-semibold">Scenario and strategy</legend>
          {select('Scenario', 'scenario', health.sweep.scenarios, SCENARIO_NOTES[form.scenario])}
          {select('Routing strategy', 'routing', health.sweep.routings)}
          {select('Queue policy', 'policy', health.sweep.policies)}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-semibold">Load and infrastructure</legend>
          {number('Bags requested', 'bagCount', `${range(limits.bagCount)}. Servers do not grow with this.`)}
          {number('Capacity %', 'capacityPct', `${range(limits.capacityPct)}. Scales servers at every facility (at least one each).`)}
          {number('Server multiplier', 'serverMultiplier', `${range(limits.serverMultiplier)}. Multiplies the servers at every facility.`)}
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-semibold">Parallel pipeline phases</legend>
          {number('Threads', 'threads', `${range(limits.threads)}. For generation and aggregation, and thread backends.`)}
          <Field label="Deadline-risk classification backend">
            <select className={FIELD} value={form.classifyBackend} onChange={(e) => onChange({ classifyBackend: e.target.value })}>
              {health.backends.map((b) => <option key={b.id} value={b.id} disabled={!b.available}>{b.id}{b.available ? '' : ' (unavailable)'}</option>)}
            </select>
          </Field>
          <p className="self-center text-xs text-muted">
            Threads and backend never change the simulation result: the simulation itself is sequential, and the classification is a separate
            batch analysis.
          </p>
        </fieldset>
        <button
          type="submit" disabled={busy || offline || problems.length > 0}
          className="flex items-center gap-2 rounded-lg bg-ops px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Play size={15} aria-hidden />
          {busy ? 'A simulation is in progress' : 'Run simulation'}
        </button>
        {problems.map((p) => <p key={p} role="alert" className="text-sm text-critical">{p}</p>)}
        {error && <p role="alert" className="text-sm text-critical">{error}</p>}
      </form>
    </Card>
  )
}
