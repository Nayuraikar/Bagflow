import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Card } from '../components/common/Card'
import { DataState } from '../components/common/DataState'
import { JobState } from '../components/common/JobState'
import { StatusLabel } from '../components/common/StatusLabel'
import { BackendComparison } from '../components/parallel/BackendComparison'
import { ChecksumVerifier } from '../components/parallel/ChecksumVerifier'
import { RunningRepetitions } from '../components/parallel/RunningRepetitions'
import { SelectedRunBar } from '../components/operations/SelectedRun'
import { ParallelSpeedupCard } from '../components/parallel/ParallelSpeedupCard'
import { TimelineView } from '../components/parallel/TimelineView'
import { WorkloadInput } from '../components/parallel/WorkloadInput'
import { WorkloadView } from '../components/parallel/WorkloadView'
import { useApiState, useHealth } from '../hooks/useHealth'
import { useParallelExecution } from '../hooks/useParallelExecution'
import { createParallelRun } from '../services/parallelService'
import type { ParallelRequest } from '../types/parallel'
import { EMPTY, int } from '../utils/format'
import { requestProblem, WORKLOADS } from '../utils/parallelRequest'
import { submitMessage } from '../utils/submitMessage'

const VIEWS = { a: 'A. Workload distribution', b: 'B. Backend comparison', c: 'C. Execution timeline' } as const
type View = keyof typeof VIEWS

/** The chosen backend, or the first sensible one the workload has here. */
function pickBackend(wanted: string, available: string[]) {
  return [wanted, 'rayon-neon', 'rayon-avx2', 'rayon', 'rayon-ilp'].find((b) => available.includes(b)) ?? wanted
}

export function ParallelStudioPage() {
  const client = useQueryClient()
  const health = useHealth().data
  const offline = useApiState() !== 'online'
  // the run and view live in the URL, so they survive navigation and reloads
  const [params, setParams] = useSearchParams()
  const runId = params.get('run') ?? undefined
  const view: View = (Object.keys(VIEWS) as View[]).find((v) => v === params.get('view')) ?? 'a'
  const setParam = (key: string, value: string) =>
    setParams((p) => {
      p.set(key, value)
      return p
    }, { replace: true })

  const [form, setForm] = useState<Omit<ParallelRequest, 'threads'> & { threads: number | null }>({
    workload: 'classify', backend: 'rayon-neon', threads: null, bagCount: 250_000, repetitions: 3,
  })
  const available = health?.parallel.workloads.find((w) => w.id === form.workload)?.backends ?? []
  const request: ParallelRequest = {
    ...form,
    backend: pickBackend(form.backend, available),
    threads: form.threads ?? health?.machine.logicalCores ?? NaN,
  }

  const { job, metrics } = useParallelExecution(runId)
  const create = useMutation({
    mutationFn: createParallelRun,
    onSuccess: ({ id }) => {
      setParam('run', id)
      void client.invalidateQueries({ queryKey: ['health'] })
    },
  })
  const status = job.data?.status
  const inFlight = status === 'queued' || status === 'running'
  const busy = create.isPending || (inFlight && !offline)
  const run = (r: ParallelRequest) => {
    if (!busy && health && requestProblem(r, health) === null) create.mutate(r)
  }
  const m = metrics.data

  let result
  if (!runId) {
    result = (
      <Card>
        <p className="text-sm text-muted">
          {EMPTY} {offline ? 'The API is not connected, so no run can be shown or measured.' : 'No run selected. Choose a workload and press Measure.'}
        </p>
      </Card>
    )
  } else if (!m || m.id !== runId) {
    result = (
      <JobState
        id={runId} job={job.data} jobError={job.error} metricsError={metrics.error}
        running={<RunningRepetitions job={job.data} title="Running: sequential and selected alternate" unit="executions, warm-ups included" />}
      />
    )
  } else {
    result = (
      <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Showing <strong>{WORKLOADS[m.workload]}</strong> on <strong className="font-mono">{m.backend}</strong>, {int(m.bags)} bags ·{' '}
            {m.machine.os} / {m.machine.arch}, {m.machine.logicalCores} logical cores · <span className="font-mono text-xs break-all">{m.id}</span>
          </span>
          <StatusLabel status="Measured" />
        </p>
        {m.debugBuild && <p className="text-sm text-critical">This run came from a debug build: timings are not representative.</p>}
        <ParallelSpeedupCard m={m} />
        {view === 'a' && <WorkloadView key={m.id} m={m} />}
        {view === 'c' && <><ChecksumVerifier m={m} /><TimelineView m={m} /></>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Parallel Execution Studio</h1>
        <p className="text-sm text-muted">One workload run sequentially and on a chosen backend, with the record of every task.</p>
      </div>
      <SelectedRunBar />
      <WorkloadInput
        request={request} health={health} busy={busy} offline={offline}
        onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        onRun={() => run(request)}
        error={create.error ? submitMessage(create.error) : null}
      />
      <div role="tablist" aria-label="Studio views" className="flex flex-wrap gap-1 border-b border-line">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <button
            key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setParam('view', v)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === v ? 'border-ops font-semibold text-ops' : 'border-transparent'}`}
          >
            {VIEWS[v]}
          </button>
        ))}
      </div>
      {view === 'b' ? (
        <>
          {runId && (!m || m.id !== runId) && result}
          {health ? (
            <BackendComparison
              health={health} request={request} busy={busy || offline || requestProblem(request, health) !== null}
              onMeasure={(backend) => run({ ...request, backend })}
              onOpen={(id) => setParams({ run: id, view: 'a' }, { replace: true })}
            />
          ) : (
            <Card><DataState error={null} /></Card>
          )}
        </>
      ) : (
        result
      )}
    </div>
  )
}
