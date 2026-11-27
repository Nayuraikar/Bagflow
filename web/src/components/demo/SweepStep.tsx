import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useDemo } from '../../hooks/demo'
import type { DemoRuns } from '../../hooks/useDemoRuns'
import { createSweep } from '../../services/sweepService'
import type { SweepMetrics } from '../../types/sweep'
import type { SweepRun } from '../../types/models'
import { EMPTY, int, msFine, pct, times } from '../../utils/format'
import { NOISE_PCT } from '../../utils/sweep'
import { submitMessage } from '../../utils/submitMessage'
import { Card, CardTitle } from '../common/Card'
import { JobState } from '../common/JobState'
import { NoiseWarning } from '../common/NoiseWarning'
import { RealBanner } from '../common/RealBanner'
import { StatusLabel } from '../common/StatusLabel'
import { Table } from '../common/Table'
import { Stat } from '../parallel/Stat'
import { ExperimentGrid, type Cell } from '../sweeps/ExperimentGrid'
import { SweepProgress } from '../sweeps/SweepProgress'
import { SpeedupFigure } from './SpeedupFigure'
import { StepRunPanel } from './StepRunPanel'
import { parallelPass, sweepSpread } from './figures'

function SweepResult({ m, repeats }: { m: SweepMetrics; repeats: SweepRun[] }) {
  const base = m.passes.find((p) => p.isBaseline)!
  const par = parallelPass(m)
  const spread = par && sweepSpread(repeats, par.threads)
  const c = m.consistency
  const cells: Cell[] = m.experiments.map(() => ({ state: 'waiting', worker: null }))
  for (const r of (par ?? base).runs) cells[r.index] = { state: r.status, worker: r.worker }
  return (
    <Card className="space-y-4">
      <CardTitle>{int(m.experiments.length)} experiments, one thread against {int(par?.threads)}</CardTitle>
      <RealBanner machine={m.machine} debugBuild={m.debugBuild}>{int(m.config.bagCount)} bags requested per experiment</RealBanner>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="1 thread, wall time (this sweep)" value={msFine(base.wallMs)} />
        <Stat label={`${int(par?.threads)} threads, wall time (this sweep)`} value={msFine(par?.wallMs)} />
        {par && spread ? <SpeedupFigure label="Wall-time speedup" value={par.speedup} spread={spread.speedup} /> : <Stat label="Wall-time speedup" value={EMPTY} />}
        <Stat label="Parallel efficiency (this sweep)" value={pct(par?.efficiencyPct)} note="speedup ÷ threads" />
      </dl>
      <Table
        head={['Threads', 'Sweeps', 'Shortest wall', 'Longest wall']}
        rows={(spread ? [base.threads, par!.threads] : [base.threads]).map((threads) => {
          const w = sweepSpread(repeats, threads).wall
          return { key: threads, cells: [threads, int(w?.walls.length), msFine(w?.min), msFine(w?.max)] }
        })}
        minWidth="18rem"
      />
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">Wall times over saved sweeps with these settings <StatusLabel status="Measured" /></p>
      {spread && spread.sweeps < 2 && (
        <NoiseWarning>
          <strong>One sweep only.</strong> Each pass was timed once, and timings move with heat and background load. Press “Run it again now”
          to measure the spread before quoting this speedup.
        </NoiseWarning>
      )}
      {spread && spread.noisyWalls.length > 0 && (
        <NoiseWarning>
          <strong>Noisy timings.</strong> Wall times of {int(spread.sweeps)} saved sweeps with these settings differ by more than {NOISE_PCT}% at{' '}
          {spread.noisyWalls.map((w) => `${w.threads} thread${w.threads === 1 ? '' : 's'}`).join(', ')}.
        </NoiseWarning>
      )}
      {par && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Which worker ran each experiment at {par.threads} threads</h3>
          <ExperimentGrid cells={cells} experiments={m.experiments} />
        </div>
      )}
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {c.checked ? (
          <>
            <strong className={c.allIdentical ? 'text-ops' : 'text-critical'}>
              {c.allIdentical ? `All ${int(c.comparedRuns)} compared runs gave the 1-thread results.` : 'Some runs did not match the 1-thread results.'}
            </strong>
            <StatusLabel status="Measured" />
          </>
        ) : 'Only the 1-thread pass ran, so nothing was compared.'}
      </p>
      {par && (
        <p className="text-sm text-muted">
          Time saved in this sweep: <span className="font-mono">{par.timeSavedMs < 0 ? '-' : ''}{msFine(Math.abs(par.timeSavedMs))}</span> (
          {times(par.speedup)}). Each simulation was sequential; only the grid was split across threads.
        </p>
      )}
      <Link to={`/experiments/sweeps?run=${m.id}`} className="inline-block text-sm text-perf underline">Replay this sweep</Link>
    </Card>
  )
}

export function SweepStep({ runs }: { runs: DemoRuns }) {
  const demo = useDemo()
  const client = useQueryClient()
  const state = runs.sweep
  const request = runs.requests?.sweep
  const create = useMutation({
    mutationFn: createSweep,
    onSuccess: ({ id }) => {
      demo.setSubmitted('sweep', id)
      void client.invalidateQueries({ queryKey: ['health'] })
      void client.invalidateQueries({ queryKey: ['history'] })
    },
  })
  const m = state.metrics.data
  return (
    <>
      <p className="text-sm">
        An operator does not need one simulation but many: every scenario against every routing and queue rule. These experiments do not
        depend on each other, so several can run at the same time even though each one is sequential inside.
      </p>
      <StepRunPanel
        state={state} hasResult={m !== undefined} submitting={create.isPending}
        wait="The longest step: the whole grid runs on 1 thread, then again on all threads."
        call={
          <>
            <span className="font-mono text-xs break-words">POST /api/sweeps</span>
            {request
              ? `: ${request.scenarios.length} scenarios × ${request.routings.length} routings × ${request.policies.length} queue policies × ${request.capacityPcts.length} capacity, ${int(request.bagCount)} bags each, on 1 and ${request.threads.join(', ')} threads.`
              : ': the settings come from the API’s health report.'}
          </>
        }
        onRun={() => request && create.mutate(request)}
        error={create.error ? submitMessage(create.error) : null}
      />
      {state.id && !m && (
        <JobState id={state.id} job={state.job.data} jobError={state.job.error} metricsError={state.metrics.error} running={<SweepProgress job={state.job.data} />} />
      )}
      {m && <SweepResult m={m} repeats={state.finished} />}
    </>
  )
}
