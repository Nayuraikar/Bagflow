import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Card, CardTitle } from '../components/common/Card'
import { DataState } from '../components/common/DataState'
import { StatusLabel } from '../components/common/StatusLabel'
import { RunLinks } from '../components/experiments/RunLinks'
import { ScenarioForm } from '../components/experiments/ScenarioForm'
import { SimulationProgress } from '../components/experiments/SimulationProgress'
import { SaturationBanner } from '../components/operations/SaturationBanner'
import { Stat } from '../components/parallel/Stat'
import { useBaselineJob } from '../hooks/jobContext'
import { useSelectedRun } from '../hooks/runSelection'
import { useApiState, useHealth } from '../hooks/useHealth'
import { useHistory } from '../hooks/useHistory'
import type { SimulationRun } from '../types/models'
import { EMPTY, int, pct } from '../utils/format'
import { describeSimulation } from '../utils/runs'
import type { ScenarioFormState } from '../utils/scenario'
import { submitMessage } from '../utils/submitMessage'

/** The run this page submitted, as the saved history knows it. */
function Result({ id }: { id: string }) {
  const history = useHistory()
  const { activeId, outcome } = useBaselineJob()
  const { choose } = useSelectedRun()
  const offline = useApiState() === 'offline'
  const run = history.data?.find((r): r is SimulationRun => r.kind === 'simulation' && r.id === id)
  const lost = outcome?.id === id && outcome.result === 'lost'
  if (activeId === id) return null // its progress is shown above
  let body
  if (run?.status === 'failed') {
    body = <p role="alert" className="text-critical"><strong>Run failed:</strong> {run.error ?? 'no reason given'}</p>
  } else if (outcome?.id === id && outcome.result === 'failed') {
    body = <p role="alert" className="text-critical"><strong>Run failed:</strong> {outcome.error ?? 'no reason given'}</p>
  } else if (run?.status === 'done' && run.summary) {
    const s = run.summary
    body = (
      <div className="space-y-3">
        <SaturationBanner run={run} />
        <dl className="grid gap-3 sm:grid-cols-4">
          <Stat label="Bags simulated" value={int(s.totalBags)} />
          <Stat label="Loaded on time" value={int(s.loadedOnTime)} note={`${pct(100 * s.onTimeLoadingRate, 3)} of bags`} />
          <Stat label="Delayed" value={int(s.delayedBags)} note={`${pct(s.delayedPct, 3)} of bags`} />
          <Stat label="Congested facilities" status="Simplified" value={int(s.congestedFacilities)} note="BagFlow display rule" />
        </dl>
        <p className="text-sm font-semibold">Look at this run</p>
        <div onClickCapture={() => choose(run.id)}><RunLinks id={run.id} retained={run.retained} /></div>
      </div>
    )
  } else if (offline) body = <p className="text-critical">API unreachable. This run’s state is unknown.</p>
  else if (lost || (history.data && !run)) {
    body = <p className="text-critical">The API does not know this run. It may have restarted before the run finished, so there is no result.</p>
  } else if (run) body = <p>This run is {run.status}.</p>
  else body = <DataState error={history.error} />
  return (
    <Card className="text-sm">
      <CardTitle aside={run?.status === 'done' ? <StatusLabel status="Real" /> : undefined}>Your run</CardTitle>
      {run && <p className="mb-2">{describeSimulation(run.config, int)}</p>}
      {body}
      <p className="mt-2 font-mono text-xs break-all text-muted">{id}</p>
    </Card>
  )
}

export function ScenarioStudioPage() {
  const health = useHealth()
  const offline = useApiState() !== 'online'
  const job = useBaselineJob()
  const [params, setParams] = useSearchParams()
  const submitted = params.get('job')
  const [edits, setEdits] = useState<Partial<ScenarioFormState>>({})
  const d = health.data?.simulationDefaults
  const form: ScenarioFormState | null = d ? {
    scenario: d.scenario, routing: d.routing, policy: d.policy, capacityPct: String(d.capacityPct),
    serverMultiplier: String(d.serverMultiplier), bagCount: String(d.bagCount), threads: String(d.threads),
    classifyBackend: d.classifyBackend ?? '', ...edits,
  } : null
  const busy = job.submitting || job.activeId !== null
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Scenario Studio</h1>
        <p className="text-sm text-muted">
          Run one synthetic day under a scenario. To run many combinations at once, use <Link to="/experiments/sweeps" className="text-perf underline">Parallel Sweeps</Link>.
        </p>
      </div>
      {form && health.data ? (
        <ScenarioForm
          form={form} health={health.data} busy={busy} offline={offline}
          onChange={(patch) => setEdits((e) => ({ ...e, ...patch }))}
          onRun={(config) => job.submit(config, (id) => setParams({ job: id }, { replace: true }))}
          error={job.submitError ? submitMessage(job.submitError) : null}
        />
      ) : (
        <Card><DataState error={health.error} /></Card>
      )}
      {job.activeId !== null && (
        <Card>
          <CardTitle>{job.activeId === submitted ? 'Your run is in progress' : 'A simulation is in progress'}</CardTitle>
          <SimulationProgress />
        </Card>
      )}
      {submitted ? <Result id={submitted} /> : job.activeId === null && (
        <Card><p className="text-sm text-muted">{EMPTY} No run submitted from this page yet. Saved runs are in <Link to="/experiments/history" className="text-perf underline">Simulation History</Link>.</p></Card>
      )}
    </div>
  )
}
