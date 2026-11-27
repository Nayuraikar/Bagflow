import { Link } from 'react-router'
import { Card, CardTitle } from '../components/common/Card'
import { DataState } from '../components/common/DataState'
import { JobState } from '../components/common/JobState'
import { RealBanner } from '../components/common/RealBanner'
import { StatusLabel } from '../components/common/StatusLabel'
import { RunningRepetitions } from '../components/parallel/RunningRepetitions'
import { Stat } from '../components/parallel/Stat'
import { BenchPicker } from '../components/performance/BenchPicker'
import { Collected, GpuPhaseTable } from '../components/performance/BenchResults'
import { SavedResults } from '../components/performance/SavedResults'
import { useSelectedBenchmark } from '../hooks/useBenchmarkPage'
import { useApiState, useHealth } from '../hooks/useHealth'
import type { BenchMetrics } from '../types/bench'
import type { Health } from '../types/models'
import { fastest, throughput } from '../utils/bench'
import { EMPTY, int, msFine, pct, times } from '../utils/format'

/** One card per backend of this machine, with its shortest row in the run. */
function LiveCards({ m, health }: { m: BenchMetrics; health: Health }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {health.backends.filter((b) => b.available).map((b) => {
        const rows = m.rows.filter((r) => r.backend === b.id)
        const r = rows.length ? fastest(rows) : undefined
        return (
          <Card key={b.id} className="space-y-3">
            <div>
              <h3 className="flex flex-wrap items-center gap-2 font-semibold"><span className="font-mono">{b.id}</span> <StatusLabel status="Implemented" /></h3>
              <p className="text-xs text-muted">
                {!r ? 'Not part of this run.' : r.threads === null ? 'GPU' : `${r.threads} thread${r.threads === 1 ? '' : 's'}`}
                {rows.length > 1 && `, the shortest of ${rows.length} thread counts`}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Median time" value={msFine(r?.timeMs.median)} />
              <Stat label="Speedup vs scalar" value={times(r?.speedup)} />
              <Stat label="Throughput" value={throughput(r?.throughputBagsPerS)} />
              <Stat label="Efficiency" value={pct(r?.efficiencyPct)} />
            </dl>
            {r && (
              <p className={`flex flex-wrap items-center gap-2 text-xs ${r.identical ? 'text-ops' : 'text-critical'}`}>
                {rows.every((x) => x.identical) ? 'Output identical to scalar' : 'Output differs from scalar'} <StatusLabel status="Measured" />
              </p>
            )}
          </Card>
        )
      })}
    </div>
  )
}

export function BackendComparisonPage() {
  const health = useHealth()
  const offline = useApiState() === 'offline'
  const { history, runs, runId, open, job, metrics } = useSelectedBenchmark()
  const m = metrics.data
  const unavailable = health.data?.backends.filter((b) => !b.available) ?? []

  let live
  if (!runId) {
    live = (
      <Card>
        {history.data && !offline
          ? <p className="text-sm text-muted">{EMPTY} No benchmark saved yet. <Link to="/performance" className="text-perf underline">Run one in the Performance Lab</Link>.</p>
          : <DataState error={history.error} />}
      </Card>
    )
  } else if (!m || m.id !== runId) {
    live = (
      <JobState
        id={runId} job={job.data} jobError={job.error} metricsError={metrics.error}
        running={<RunningRepetitions job={job.data} title="Running the kernels" unit="repetitions, warm-ups included" />}
      />
    )
  } else {
    live = (
      <div className="space-y-4">
        <RealBanner machine={m.machine} debugBuild={m.debugBuild}>
          one benchmark run, {int(m.workloadSize)} bags, {m.repetitions} timed repetitions after {m.warmup} warm-up ·{' '}
          <span className="font-mono text-xs break-all">{m.id}</span>
        </RealBanner>
        {offline && <p className="text-sm text-critical">API unreachable. These results were loaded earlier.</p>}
        {health.data && <LiveCards m={m} health={health.data} />}
        <GpuPhaseTable m={m} />
        <Collected m={m} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Backend Comparison</h1>
        <p className="text-sm text-muted">
          Backends of this machine on the same workload, from one run. <Link to="/performance" className="text-perf underline">Charts and new runs are in the Performance Lab.</Link>
        </p>
      </div>
      <BenchPicker runs={runs} value={runId} onChange={open} />
      {live}
      {unavailable.length > 0 && (
        <Card>
          <CardTitle aside={<StatusLabel status="Unavailable" />}>Not available on this machine</CardTitle>
          <ul className="space-y-1 text-sm">
            {unavailable.map((b) => <li key={b.id}><span className="font-mono">{b.id}</span> <span className="text-muted">— {b.reason ?? 'no reason given'}</span></li>)}
          </ul>
        </Card>
      )}
      <SavedResults />
    </div>
  )
}
