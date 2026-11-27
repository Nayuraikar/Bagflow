// "Parallel Processing & Computational Contribution" for one stage. Every number is from a saved run.

import { Link } from 'react-router'
import type { BaggageStage, ParallelWork } from '../../config/stages'
import { useApiState, useHealth } from '../../hooks/useHealth'
import { useSelectedRun } from '../../hooks/runSelection'
import { useLatestRunsByBackend } from '../../hooks/useParallelExecution'
import { useSimulation } from '../../hooks/useSimulation'
import { EMPTY, dateTime, int, msFine, times } from '../../utils/format'
import { checksumsMatch } from '../../utils/telemetry'
import { Card, CardTitle } from '../common/Card'
import { DataState } from '../common/DataState'
import { StatusLabel } from '../common/StatusLabel'
import { StaticResults } from '../parallel/StaticResults'
import { PhaseCard } from '../pipeline/PhaseCard'

function LatestPipeline({ work }: { work: ParallelWork }) {
  const { history, run } = useSelectedRun()
  const offline = useApiState() === 'offline'
  const latest = run?.status === 'done' ? run : undefined
  const { data, error } = useSimulation(latest?.id)
  const phase = data?.pipeline?.phases.find((p) => p.id === work.phase)
  let body
  if (phase) {
    body = (
      <>
        <p className="mb-2 text-xs text-muted">
          Run <span className="font-mono break-all">{data!.id}</span>, {data!.config.scenario}, finished {dateTime(data!.finishedAt)}.
        </p>
        {data!.pipeline!.debugBuild && <p className="mb-2 text-sm text-critical">Debug build: timings are not representative.</p>}
        <div className="max-w-md"><PhaseCard phase={phase} /></div>
      </>
    )
  } else if (!history.data || (offline && !latest)) body = <DataState error={history.error} />
  else if (!latest) body = <p className="text-sm text-muted">{EMPTY} No finished simulation yet. <Link to="/" className="text-perf underline">Run the baseline</Link>.</p>
  else if (!data) body = <DataState error={error} />
  else body = <p className="text-sm text-muted">{EMPTY} This simulation was saved without a pipeline measurement.</p>
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">In the selected simulation run’s pipeline</h3>
      {body}
    </div>
  )
}

function Telemetry({ work }: { work: ParallelWork }) {
  const health = useHealth().data
  const { byBackend, loaded, error } = useLatestRunsByBackend((r) => r.workload === work.workload)
  const classify = work.workload === 'classify'
  // classify compares every backend; the other two have one parallel implementation
  const ids = classify
    ? (health?.parallel.workloads.find((w) => w.id === 'classify')?.backends ?? [...byBackend.keys()])
    : ['rayon']
  const unavailable = classify ? (health?.backends.filter((b) => !b.available) ?? []) : []
  const head = ['Backend', 'Bags', 'Threads', 'Sequential', 'This backend', 'Speedup', 'Checksum', 'Source']
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">Newest telemetry run{classify ? ' of each backend on this machine' : ''}</h3>
      {!loaded && <DataState error={error} />}
      <div className="overflow-x-auto">
        <table className="w-full min-w-160 text-sm">
          <thead className="text-muted">
            <tr>{head.map((h, i) => <th key={h} className={`border-b border-line py-1.5 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="font-mono">
            {ids.map((id) => {
              const m = byBackend.get(id)
              return (
                <tr key={id}>
                  <td className="py-1 text-left">{id}</td>
                  <td className="text-right">{int(m?.bags)}</td>
                  <td className="text-right">{m && m.threads === null ? 'GPU' : int(m?.threads)}</td>
                  <td className="text-right">{msFine(m?.sequential.wallMs)}</td>
                  <td className="text-right">{msFine(m?.selected.wallMs)}</td>
                  <td className="text-right">{times(m?.speedup)}</td>
                  <td className={`text-right font-sans ${m && !checksumsMatch(m) ? 'text-critical' : ''}`}>
                    {!m ? EMPTY : checksumsMatch(m) ? 'match' : 'mismatch'}
                  </td>
                  <td className="text-right font-sans">
                    {m ? (
                      <span className="inline-flex items-center gap-2">
                        <Link to={`/operations/parallel-studio?run=${m.id}`} className="text-xs text-perf underline">open</Link>
                        <StatusLabel status="Measured" />
                      </span>
                    ) : EMPTY}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Each speedup compares the two sides of its own run. Rows with different bag or thread counts are not comparable with each other.{' '}
        <Link to="/operations/parallel-studio" className="text-perf underline">Measure in the Parallel Execution Studio</Link>.
      </p>
      {unavailable.length > 0 && (
        <div className="mt-3 text-sm">
          <p className="mb-1 flex items-center gap-2 font-semibold">Not available on this machine <StatusLabel status="Unavailable" /></p>
          <ul>
            {unavailable.map((b) => <li key={b.id}><span className="font-mono text-xs">{b.id}</span> <span className="text-muted">— {b.reason ?? 'no reason given'}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

export function StageContribution({ stage }: { stage: BaggageStage }) {
  const { work } = stage
  return (
    <Card className="space-y-4">
      <CardTitle>Parallel Processing &amp; Computational Contribution</CardTitle>
      <dl className="space-y-3 text-sm">
        <div><dt className="font-semibold">What operation happens?</dt><dd>{stage.operation}</dd></div>
        <div><dt className="font-semibold">Can it be parallelised?</dt><dd>{stage.canParallelise}</dd></div>
        <div>
          <dt className="font-semibold">What improvement was measured?</dt>
          <dd>
            {work ? work.scope : <><strong>Not implemented.</strong> No parallel work exists for this stage, so there is no measurement: <span className="font-mono">{EMPTY}</span></>}
          </dd>
        </div>
      </dl>
      {work && (
        <>
          <LatestPipeline work={work} />
          <Telemetry work={work} />
          {work.workload === 'classify' && (
            <div>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">Saved results from earlier runs <StatusLabel status="Static" /></h3>
              <p className="mb-2 text-xs text-muted">
                Includes AVX2, CUDA (naive, warp, PTX) and MPI. Each table names its machine and size. Do not compare them with the measured rows above.
              </p>
              <StaticResults keep={() => true} />
            </div>
          )}
        </>
      )}
    </Card>
  )
}
