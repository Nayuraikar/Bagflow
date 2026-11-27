import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Card } from '../components/common/Card'
import { DataState } from '../components/common/DataState'
import { JobState } from '../components/common/JobState'
import { RealBanner } from '../components/common/RealBanner'
import { RunPicker } from '../components/common/RunPicker'
import { NoiseCheck } from '../components/sweeps/NoiseCheck'
import { SweepConfiguration } from '../components/sweeps/SweepConfiguration'
import { SweepProgress } from '../components/sweeps/SweepProgress'
import { SweepReplay } from '../components/sweeps/SweepReplay'
import { SweepResults } from '../components/sweeps/SweepResults'
import { useApiState, useHealth } from '../hooks/useHealth'
import { useHistory } from '../hooks/useHistory'
import { useSweep } from '../hooks/useSweep'
import { createSweep } from '../services/sweepService'
import type { SweepRun } from '../types/models'
import type { SweepRequest } from '../types/sweep'
import { EMPTY, int } from '../utils/format'
import { submitMessage } from '../utils/submitMessage'
import { sweepProblems, toRequest, type SweepForm } from '../utils/sweep'

const THREADS = [2, 4, 8]

export function ParallelSweepsPage() {
  const client = useQueryClient()
  const health = useHealth()
  const history = useHistory()
  const offline = useApiState() !== 'online'
  const [params, setParams] = useSearchParams()
  const sweeps = history.data?.filter((r): r is SweepRun => r.kind === 'sweep') ?? []

  // without a run in the URL, follow a sweep in progress, else show the newest finished one
  const wanted = params.get('run') ?? undefined
  const runId = wanted ?? (sweeps.find((r) => r.status === 'queued' || r.status === 'running') ?? sweeps.find((r) => r.status === 'done'))?.id
  const open = (id: string) => setParams({ run: id }, { replace: true })

  const [edits, setEdits] = useState<Partial<SweepForm>>({})
  const d = health.data?.sweep.defaults
  const form: SweepForm | null = d ? {
    scenarios: d.scenarios, routings: d.routings, policies: d.policies,
    capacities: d.capacityPcts.join(', '),
    threads: THREADS.filter((t) => t <= health.data!.machine.logicalCores).join(', '),
    serverMultiplier: String(d.serverMultiplier), bagCount: String(d.bagCount),
    ...edits,
  } : null

  const { job, metrics } = useSweep(runId)
  const create = useMutation({
    mutationFn: createSweep,
    onSuccess: ({ id }) => {
      open(id)
      void client.invalidateQueries({ queryKey: ['health'] })
      void client.invalidateQueries({ queryKey: ['history'] })
    },
  })
  const status = job.data?.status
  const busy = create.isPending || ((status === 'queued' || status === 'running') && !offline)
  const run = (r: SweepRequest) => {
    if (!busy && !offline && health.data && sweepProblems(r, health.data.sweep).length === 0) create.mutate(r)
  }

  const m = metrics.data
  const shown = sweeps.find((r) => r.id === runId)
  const repeats = shown ? sweeps.filter((r) => r.status === 'done' && r.configHash === shown.configHash) : []

  let result
  if (!runId) {
    result = (
      <Card>
        {history.data && !offline ? <p className="text-sm text-muted">{EMPTY} No sweep saved yet. Configure one and press Run sweep.</p> : <DataState error={history.error} />}
      </Card>
    )
  } else if (!m || m.id !== runId) {
    result = (
      <JobState id={runId} job={job.data} jobError={job.error} metricsError={metrics.error} running={<SweepProgress job={job.data} />} />
    )
  } else {
    result = (
      <div className="space-y-4">
        <RealBanner machine={m.machine} debugBuild={m.debugBuild}>
          {int(m.experiments.length)} independent simulations of {int(m.bagsGenerated)} generated bags, each one sequential inside ·{' '}
          <span className="font-mono text-xs break-all">{m.id}</span>
        </RealBanner>
        {offline && <p className="text-sm text-critical">API unreachable. These results were loaded earlier.</p>}
        <SweepResults m={m} />
        <NoiseCheck repeats={repeats} onRepeat={() => run(m.config)} busy={busy || offline} />
        <SweepReplay key={m.id} m={m} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Parallel Sweeps</h1>
        <p className="text-sm text-muted">
          Independent experiments do not depend on each other, so many run at once. The same grid is run on 1 thread first, then on each
          thread count you list.
        </p>
      </div>
      {form && health.data ? (
        <SweepConfiguration
          form={form} health={health.data} busy={busy} offline={offline}
          onChange={(patch) => setEdits((e) => ({ ...e, ...patch }))}
          onRun={() => run(toRequest(form))}
          error={create.error ? submitMessage(create.error) : null}
        />
      ) : (
        <Card><DataState error={health.error} /></Card>
      )}
      {sweeps.length > 0 && (
        <RunPicker
          label="Saved sweeps" runs={sweeps} value={runId} onChange={open}
          describe={(r) => {
            const s = (r as SweepRun).summary
            return s ? `${s.experimentCount} experiments, ${int((r as SweepRun).bagCount)} bags, threads ${s.passes.map((p) => p.threads).join('/')}` : `${int((r as SweepRun).bagCount)} bags`
          }}
        />
      )}
      {result}
    </div>
  )
}
