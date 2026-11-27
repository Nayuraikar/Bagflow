// View B: one card per backend of the workload, each drawn for its own kind of parallelism.

import { useLatestRunsByBackend } from '../../hooks/useParallelExecution'
import type { Health } from '../../types/models'
import type { ParallelMetrics, ParallelRequest, Simd } from '../../types/parallel'
import { EMPTY, int, msFine, times } from '../../utils/format'
import { WORKLOADS } from '../../utils/parallelRequest'
import { backendFamily, checksumsMatch, takesThreads, type BackendFamily } from '../../utils/telemetry'
import { Card, CardTitle } from '../common/Card'
import { DataState } from '../common/DataState'
import { StatusLabel } from '../common/StatusLabel'
import { GpuPhaseBars } from './GpuPhaseBars'
import { Stat } from './Stat'
import { StaticResults } from './StaticResults'
import { workerColor } from './style'

const FAMILY: Record<BackendFamily, string> = {
  single: 'One thread',
  threads: 'Threads on chunks',
  simd: 'Vector lanes, one thread',
  'threads-simd': 'Threads on chunks, vector lanes inside each',
  gpu: 'GPU: copy in, kernel, copy out',
}

function description(id: string) {
  if (id === 'openmp') return 'OpenMP threads; schedule(static) gives each thread a contiguous block of chunks.'
  if (id.startsWith('rayon')) return 'Rayon tasks, one per chunk; idle threads steal work.'
  if (id === 'ilp') return 'One thread running the instruction-level-parallel kernel.'
  if (id === 'neon' || id === 'avx2') return 'One instruction works on several values. Lanes are not workers.'
  if (id === 'metal') return 'The GPU runs the kernel; it reports phase times only.'
  return 'One thread, chunk after chunk.'
}

function Lanes({ simd }: { simd: Simd }) {
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${simd.lanes}, minmax(0, 1fr))` }}>
        {Array.from({ length: simd.lanes }, (_, i) => (
          <div key={i} className="rounded border border-perf/50 bg-perf/10 py-2 text-center font-mono text-[11px]">lane {i}</div>
        ))}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          {int(simd.lanes)} lanes × {simd.laneType} = {int(simd.registerBits)}-bit register; {int(simd.bagsPerIteration)} bags per loop iteration.
          {' '}{simd.note.charAt(0).toUpperCase() + simd.note.slice(1)}.
        </span>
        <StatusLabel status="Measured" />
      </p>
    </div>
  )
}

/** Which chunks each thread ran: order and ownership only, no time axis. */
function ThreadBlocks({ m }: { m: ParallelMetrics }) {
  return (
    <div className="space-y-1">
      {m.selected.workers.map((w) => (
        <div key={w.worker} className="flex items-start gap-2">
          <span className="w-16 shrink-0 text-xs text-muted">thread {w.worker}</span>
          <div className="flex flex-wrap gap-0.5">
            {m.selected.tasks.filter((t) => t.worker === w.worker).map((t) => (
              <span key={t.id} className="min-w-5 rounded-sm px-0.5 text-center font-mono text-[10px] text-white" style={{ background: workerColor(w.worker) }}>{t.id}</span>
            ))}
          </div>
        </div>
      ))}
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">Numbers are chunk ids, from this run’s task records. <StatusLabel status="Measured" /></p>
    </div>
  )
}

function Visual({ family, m }: { family: BackendFamily; m: ParallelMetrics }) {
  if (family === 'gpu') return m.gpu ? <GpuPhaseBars gpu={m.gpu} /> : null
  if (family === 'simd') return m.simd ? <Lanes simd={m.simd} /> : null
  if (family === 'single') {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span><span className="font-mono">{int(m.selected.tasks.length)}</span> chunks processed in order by one thread.</span>
        <StatusLabel status="Measured" />
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <ThreadBlocks m={m} />
      {family === 'threads-simd' && m.simd && <Lanes simd={m.simd} />}
    </div>
  )
}

interface Props {
  health: Health
  request: ParallelRequest
  onMeasure: (backend: string) => void
  onOpen: (runId: string) => void
  busy: boolean
}

export function BackendComparison({ health, request, onMeasure, onOpen, busy }: Props) {
  const { byBackend, loaded, error } = useLatestRunsByBackend(
    (r) => r.workload === request.workload && r.bagCount === request.bagCount,
  )
  const available = health.parallel.workloads.find((w) => w.id === request.workload)?.backends ?? []
  const unavailable = request.workload === 'classify' ? health.backends.filter((b) => !b.available) : []
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {WORKLOADS[request.workload]}, {Number.isNaN(request.bagCount) ? EMPTY : int(request.bagCount)} bags requested (change these in the
        form). Each card is the newest finished run of that backend at this size. Its speedup is against the sequential side of that same
        run. Check thread and repetition counts before comparing cards.
      </p>
      {!loaded && <DataState error={error} />}
      <div className="grid gap-3 lg:grid-cols-2">
        {available.map((id) => {
          const m = byBackend.get(id)
          const family = backendFamily(id)
          return (
            <Card key={id} className="flex flex-col gap-3" >
              <div>
                <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="font-mono">{id}</span> <StatusLabel status="Implemented" />
                </h3>
                <p className="text-xs text-muted">{FAMILY[family]}. {description(id)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <Stat label="Wall time" value={msFine(m?.selected.wallMs)} />
                <Stat label={`Speedup vs ${m?.sequential.backend ?? 'sequential'}`} value={times(m?.speedup)} />
                <Stat label="Threads" value={m ? (m.threads === null ? 'GPU' : int(m.threads)) : EMPTY} />
                <Stat label="Timed repetitions" value={int(m?.repetitions)} />
              </dl>
              {m ? (
                <>
                  <Visual family={family} m={m} />
                  <p className={`flex flex-wrap items-center gap-2 text-xs ${checksumsMatch(m) ? 'text-ops' : 'text-critical'}`}>
                    {checksumsMatch(m) ? 'Checksum match with sequential' : 'Checksum mismatch with sequential'} <StatusLabel status="Measured" />
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">{EMPTY} No finished run at this size yet.</p>
              )}
              <div className="mt-auto flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => onMeasure(id)} className="rounded-lg border border-ops px-3 py-1 text-sm text-ops disabled:opacity-50">
                  Measure{takesThreads(id) ? ` with ${Number.isNaN(request.threads) ? EMPTY : request.threads} threads` : ''}
                </button>
                {m && <button type="button" onClick={() => onOpen(m.id)} className="px-2 py-1 text-sm text-perf underline">Replay this run</button>}
              </div>
            </Card>
          )
        })}
      </div>
      {unavailable.length > 0 && (
        <Card>
          <CardTitle aside={<StatusLabel status="Unavailable" />}>Not available on this machine</CardTitle>
          <ul className="space-y-1 text-sm">
            {unavailable.map((b) => <li key={b.id}><span className="font-mono">{b.id}</span> <span className="text-muted">— {b.reason ?? 'no reason given'}</span></li>)}
          </ul>
        </Card>
      )}
      {request.workload === 'classify' && (
        <Card>
          <CardTitle aside={<StatusLabel status="Static" />}>Saved Kaggle results: CUDA and AVX2</CardTitle>
          <p className="mb-3 text-sm text-muted">Measured earlier on another machine at another size. Not comparable with the cards above.</p>
          <StaticResults keep={(r) => r.kind === 'kernel' && r.machine.startsWith('Kaggle') && /cuda|avx2/.test(r.label)} />
        </Card>
      )}
    </div>
  )
}
