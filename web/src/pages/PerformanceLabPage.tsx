import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { Card } from '../components/common/Card'
import { DataState } from '../components/common/DataState'
import { JobState } from '../components/common/JobState'
import { RealBanner } from '../components/common/RealBanner'
import { RunningRepetitions } from '../components/parallel/RunningRepetitions'
import { BenchForm } from '../components/performance/BenchForm'
import { BenchPicker } from '../components/performance/BenchPicker'
import { BenchCharts, BenchSummaryCards, BenchTable } from '../components/performance/BenchResults'
import { SavedResults } from '../components/performance/SavedResults'
import { useSelectedBenchmark } from '../hooks/useBenchmarkPage'
import { useApiState, useHealth } from '../hooks/useHealth'
import { createBenchmark } from '../services/benchService'
import { benchProblems, toBenchRequest, type BenchFormState } from '../utils/bench'
import { EMPTY } from '../utils/format'
import { submitMessage } from '../utils/submitMessage'

export function PerformanceLabPage() {
  const client = useQueryClient()
  const health = useHealth()
  const offline = useApiState() !== 'online'
  const { history, runs, runId, open, job, metrics } = useSelectedBenchmark()
  const [edits, setEdits] = useState<Partial<BenchFormState>>({})
  const form: BenchFormState | null = health.data ? {
    backends: health.data.backends.filter((b) => b.available).map((b) => b.id),
    threads: [1, 2, 4, 8].filter((t) => t <= health.data.machine.logicalCores).join(', '),
    bagCount: '1000000', repetitions: '10', warmup: '1',
    ...edits,
  } : null
  const create = useMutation({
    mutationFn: createBenchmark,
    onSuccess: ({ id }) => {
      open(id)
      void client.invalidateQueries({ queryKey: ['health'] })
      void client.invalidateQueries({ queryKey: ['history'] })
    },
  })
  const status = job.data?.status
  const busy = create.isPending || ((status === 'queued' || status === 'running') && !offline)
  const m = metrics.data

  let result
  if (!runId) {
    result = (
      <Card>
        {history.data && !offline ? <p className="text-sm text-muted">{EMPTY} No benchmark saved yet. Press Run benchmark.</p> : <DataState error={history.error} />}
      </Card>
    )
  } else if (!m || m.id !== runId) {
    result = (
      <JobState
        id={runId} job={job.data} jobError={job.error} metricsError={metrics.error}
        running={<RunningRepetitions job={job.data} title="Running the kernels" unit="repetitions, warm-ups included" />}
      />
    )
  } else {
    result = (
      <div className="space-y-4">
        <RealBanner machine={m.machine} debugBuild={m.debugBuild}>
          live benchmark run · <span className="font-mono text-xs break-all">{m.id}</span>
        </RealBanner>
        {offline && <p className="text-sm text-critical">API unreachable. These results were loaded earlier.</p>}
        <BenchSummaryCards m={m} />
        <BenchCharts m={m} />
        <BenchTable m={m} />
        <Link to={`/performance/backends?run=${m.id}`} className="inline-block text-sm text-perf underline">Compare the backends of this run</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Performance Lab</h1>
        <p className="text-sm text-muted">
          The batch deadline-risk kernel, timed on this machine. It is an analysis of the bag table; the simulation does not use its output.
        </p>
      </div>
      {form && health.data ? (
        <BenchForm
          form={form} health={health.data} busy={busy} offline={offline}
          onChange={(patch) => setEdits((e) => ({ ...e, ...patch }))}
          onRun={() => {
            const r = toBenchRequest(form)
            if (!busy && !offline && benchProblems(r, health.data.benchmark).length === 0) create.mutate(r)
          }}
          error={create.error ? submitMessage(create.error) : null}
        />
      ) : (
        <Card><DataState error={health.error} /></Card>
      )}
      <BenchPicker runs={runs} value={runId} onChange={open} />
      {result}
      <SavedResults />
    </div>
  )
}
