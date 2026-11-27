// The workload and kernel steps: one parallel run each, sequential against parallel on the same input.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useDemo } from '../../hooks/demo'
import type { DemoRuns } from '../../hooks/useDemoRuns'
import { createParallelRun } from '../../services/parallelService'
import type { ParallelMetrics, ParallelRequest } from '../../types/parallel'
import { int, msFine, pct } from '../../utils/format'
import { range, speedupRange } from '../../utils/spread'
import { submitMessage } from '../../utils/submitMessage'
import { takesThreads } from '../../utils/telemetry'
import { BarList } from '../common/BarList'
import { Card, CardTitle } from '../common/Card'
import { JobState } from '../common/JobState'
import { NoiseWarning } from '../common/NoiseWarning'
import { RealBanner } from '../common/RealBanner'
import { ChecksumVerifier } from '../parallel/ChecksumVerifier'
import { ExecutionTimeline, TimeAxis, TimelineLegend } from '../parallel/ExecutionTimeline'
import { RunningRepetitions } from '../parallel/RunningRepetitions'
import { Stat } from '../parallel/Stat'
import { SpeedupFigure } from './SpeedupFigure'
import { StepRunPanel } from './StepRunPanel'
import { bagsPerSecond, millions } from './figures'

const wallText = (samples: number[]) => {
  const r = range(samples)!
  return `${int(r.count)} repetitions: ${msFine(r.min)} to ${msFine(r.max)}`
}

const generate = (m: ParallelMetrics) => m.workload === 'generate'

function Timings({ m }: { m: ParallelMetrics }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label={`Sequential: ${m.sequential.backend}, 1 thread (median)`} value={msFine(m.sequential.wallMs)} note={wallText(m.sequential.samplesMs)} />
      <Stat label={`${m.backend}, ${int(m.threads)} threads (median)`} value={msFine(m.selected.wallMs)} note={wallText(m.selected.samplesMs)} />
      <SpeedupFigure label="Speedup (sequential ÷ parallel)" value={m.speedup} spread={speedupRange(m.sequential.samplesMs, m.selected.samplesMs)} />
      <Stat label="Throughput at the median" value={millions(bagsPerSecond(m.bags, m.selected.wallMs))} note="bags per second" />
      {generate(m) && m.threads !== null && (
        <Stat label="Parallel efficiency" value={pct((100 * m.speedup) / m.threads)} note="speedup ÷ threads, against the sequential generator" />
      )}
    </dl>
  )
}

function Distribution({ m }: { m: ParallelMetrics }) {
  const span = Math.max(m.sequential.wallMs, m.selected.wallMs)
  return (
    <>
      <div>
        <h3 className="mb-2 text-sm font-semibold">
          How {m.backend} shared out {int(m.bags)} bags: {int(m.selected.tasks.length)} chunks over {int(m.selected.workers.length)} threads
        </h3>
        <BarList rows={m.selected.workers.map((w) => ({ key: String(w.worker), label: `thread ${w.worker}`, value: w.size, text: millions(w.size) }))} />
        <p className="mt-1 text-xs text-muted">
          Rayon threads take more chunks when they run out (work stealing), so faster cores can end up with more bags.
        </p>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Recorded timeline of the median repetitions, on one clock</h3>
        <p className="text-xs text-muted">Sequential</p>
        <ExecutionTimeline run={m.sequential} span={span} />
        <p className="pt-2 text-xs text-muted">{m.backend}</p>
        <ExecutionTimeline run={m.selected} span={span} />
        <TimeAxis span={span} />
        <TimelineLegend run={m.selected} />
      </div>
    </>
  )
}

export function ParallelStep({ step, runs }: { step: 'workload' | 'kernel'; runs: DemoRuns }) {
  const demo = useDemo()
  const client = useQueryClient()
  const state = runs[step]
  const request: ParallelRequest | null | undefined = step === 'workload' ? runs.requests?.generate : runs.requests?.kernel
  const create = useMutation({
    mutationFn: createParallelRun,
    onSuccess: ({ id }) => {
      demo.setSubmitted(step, id)
      void client.invalidateQueries({ queryKey: ['health'] })
      void client.invalidateQueries({ queryKey: ['history'] })
    },
  })
  const m = state.metrics.data
  return (
    <>
      <p className="text-sm">
        {step === 'workload'
          ? 'Before anything can be simulated there has to be a day of bags. Each flight’s bags can be generated independently, so the flights are split into chunks that several threads work through at once.'
          : 'Classifying every bag’s deadline risk is the same small calculation millions of times. The scalar kernel does one bag after another; the accelerated one uses more threads, and vector instructions where the backend has them. This is a batch analysis of the bag table: the simulation does not use its output.'}
      </p>
      <StepRunPanel
        state={state} hasResult={m !== undefined} submitting={create.isPending}
        wait="Both sides are timed several times on the same input."
        call={
          <>
            <span className="font-mono text-xs break-words">POST /api/parallel-runs</span>
            {request
              ? `: ${request.workload}, ${request.backend}${takesThreads(request.backend) ? `, ${request.threads} threads` : ''}, ${int(request.bagCount)} bags requested, ${request.repetitions} repetitions per side${request.chunkSize === undefined ? '' : `, ${int(request.chunkSize)} flights per chunk`}.`
              : ': the settings come from the API’s health report.'}
          </>
        }
        onRun={() => request && create.mutate(request)}
        blocked={request === null ? 'This machine reports no accelerated classification backend.' : null}
        error={create.error ? submitMessage(create.error) : null}
      />
      {state.id && !m && (
        <JobState
          id={state.id} job={state.job.data} jobError={state.job.error} metricsError={state.metrics.error}
          running={<RunningRepetitions job={state.job.data} title="Timing both sides" unit="executions, warm-ups included" />}
        />
      )}
      {m && (
        <Card className="space-y-4">
          <CardTitle>{step === 'workload' ? 'Sequential against Rayon' : `Scalar against ${m.backend}`}</CardTitle>
          <RealBanner machine={m.machine} debugBuild={m.debugBuild}>{int(m.bags)} bags</RealBanner>
          <Timings m={m} />
          {generate(m) && m.threads !== null && (speedupRange(m.sequential.samplesMs, m.selected.samplesMs)?.max ?? 0) > m.threads && (
            <NoiseWarning>
              The top of the speedup range is above {m.threads}x on {m.threads} threads. That comes from pairing an unusually slow sequential
              repetition ({msFine(range(m.sequential.samplesMs)!.max)}) with the fastest parallel one. It is timing noise, not extra scaling.
              Run the step again for a cleaner measurement.
            </NoiseWarning>
          )}
          {step === 'workload' ? <Distribution m={m} /> : (
            <p className="text-sm text-muted">
              The baseline is the scalar loop as the compiler builds it, which may already be auto-vectorised.
              {m.backend.includes('neon') || m.backend.includes('avx2')
                ? ' The speedup mixes vector instructions with threads, so dividing it by the thread count would not be a parallel efficiency, and none is shown.'
                : ''}
            </p>
          )}
          <ChecksumVerifier m={m} />
          <Link to={`/operations/parallel-studio?run=${m.id}`} className="inline-block text-sm text-perf underline">Replay this run in the Parallel Execution Studio</Link>
        </Card>
      )}
    </>
  )
}
