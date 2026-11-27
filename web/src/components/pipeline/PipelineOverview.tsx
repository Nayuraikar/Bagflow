import { lazy, Suspense } from 'react'
import { useApiState } from '../../hooks/useHealth'
import { useSimulation } from '../../hooks/useSimulation'
import type { Pipeline, SimulationRun } from '../../types/models'
import { EMPTY, int } from '../../utils/format'
import { Card } from '../common/Card'
import { DataState } from '../common/DataState'
import { StatusLabel } from '../common/StatusLabel'
import { AmdahlAnalysis } from './AmdahlAnalysis'
import { PhaseCard } from './PhaseCard'
import { SweepEntry } from './SweepEntry'

// the chart library is the largest dependency, so it loads only when there is something to chart
const PipelineTotals = lazy(() => import('./PipelineTotals'))

function Breakdown({ pipeline }: { pipeline: Pipeline }) {
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>
          {int(pipeline.bagsGenerated)} bags generated, {int(pipeline.bagsSimulated)} simulated · {pipeline.threads} threads ·{' '}
          {pipeline.machine.os} / {pipeline.machine.arch}, {pipeline.machine.logicalCores} logical cores
        </span>
        <StatusLabel status="Measured" />
      </p>
      {pipeline.debugBuild && <p className="text-sm text-critical">This run came from a debug build: timings are not representative.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {pipeline.phases.map((p, i) => (
          <PhaseCard key={p.id} phase={p} step={i + 1} />
        ))}
      </div>
      <p className="rounded-lg border border-warning/60 bg-warning/10 px-4 py-3 text-sm">
        The simulate time includes collection (bag histories and node time-series). Sweep runs use collection off, so this time is
        not comparable with per-run times in a sweep.
      </p>
      <Suspense fallback={<Card><p className="text-sm text-muted">Loading chart…</p></Card>}>
        <PipelineTotals pipeline={pipeline} />
      </Suspense>
      <AmdahlAnalysis pipeline={pipeline} />
    </>
  )
}

export function PipelineOverview({ run, historyError, historyLoaded }: { run: SimulationRun | undefined; historyError: Error | null; historyLoaded: boolean }) {
  const { data, error } = useSimulation(run?.id)
  const offline = useApiState() === 'offline'
  let body
  if (data?.pipeline) body = <Breakdown pipeline={data.pipeline} />
  else {
    body = (
      <Card>
        {!historyLoaded || (offline && !run) ? (
          <DataState error={historyError} />
        ) : !run ? (
          <p className="text-sm text-muted">{EMPTY} No finished simulation yet. Run the baseline to measure the four phases.</p>
        ) : !data ? (
          <DataState error={error} />
        ) : (
          <p className="text-sm text-muted">{EMPTY} The latest run was saved without a pipeline measurement. Run the baseline again.</p>
        )}
      </Card>
    )
  }
  return (
    <section aria-labelledby="pipeline-title" className="space-y-3">
      <h2 id="pipeline-title" className="text-lg font-semibold">Where Parallel Computing Makes a Difference</h2>
      {body}
      <SweepEntry />
    </section>
  )
}
