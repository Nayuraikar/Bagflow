import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Card, CardTitle } from '../components/common/Card'
import { DataState } from '../components/common/DataState'
import { ReplayControls } from '../components/common/ReplayControls'
import { StatusLabel } from '../components/common/StatusLabel'
import { SimulationProgress } from '../components/experiments/SimulationProgress'
import type { Selection } from '../components/operations/NetworkGraph'
import { RunExpired } from '../components/operations/RunExpired'
import { ExecutionTimeline, TimeAxis } from '../components/parallel/ExecutionTimeline'
import { Stat } from '../components/parallel/Stat'
import { FACILITY_STATUS } from '../config/ops'
import { useBaselineJob } from '../hooks/jobContext'
import { useReplay } from '../hooks/useReplay'
import { useApiState, useHealth } from '../hooks/useHealth'
import { useHistory } from '../hooks/useHistory'
import { isExpired, useNetwork } from '../hooks/useRunData'
import { getSimulation } from '../services/simulationService'
import type { Simulation, SimulationConfig, SimulationRun } from '../types/models'
import type { Execution } from '../types/parallel'
import { EMPTY, int, ms, pct, times } from '../utils/format'
import { submitMessage } from '../utils/submitMessage'

const NetworkGraph = lazy(() => import('../components/operations/NetworkGraph'))

/** Routings whose routes engine2 can fix per bag before the event loop (operational.rs, `route_precompute`). */
const STATIC_ROUTINGS = ['dijkstra', 'ecmp']
const KIND_NAME: Record<string, string> = { checkin: 'check-in registration', flight_grouping: 'flight grouping', route_service: 'route + service times' }
const SELECT = 'w-full rounded-lg border border-line bg-surface px-2 py-1.5'
const BUTTON = 'rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40'
const NO_EDGES = new Set<string>()
const NO_TYPES = new Set<string>()

type Slot = 'seq' | 'par'

/** A run as the API reports it, polled until it is done or failed. */
function useRun(id: string | null) {
  return useQuery({
    queryKey: ['simulation-ops', id],
    queryFn: () => getSimulation(id!),
    enabled: id !== null,
    refetchInterval: (q) => (q.state.data?.status === 'done' || q.state.data?.status === 'failed' ? false : 2000),
  })
}

function Mode({ parallel }: { parallel: boolean }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${parallel ? 'border-ops/60 bg-ops/15' : 'border-muted/50 bg-muted/10'}`}>
      {parallel ? 'Parallel' : 'Sequential'}
    </span>
  )
}

function RunState({ label, q }: { label: string; q: ReturnType<typeof useRun> }) {
  const r = q.data
  let text: React.ReactNode = 'not run yet'
  if (q.error) text = <DataState error={q.error} />
  else if (r?.status === 'failed') text = <span role="alert" className="text-critical">failed: {r.error ?? 'no reason given'}</span>
  else if (r) text = `${r.status}${r.status === 'done' && r.operational ? ` · ${ms(r.operational.totalMs)}` : ''}`
  return <p className="text-sm"><strong>{label}:</strong> {text}</p>
}

const sameConfig = (a: SimulationConfig, b: SimulationConfig) =>
  a.scenario === b.scenario && a.routing === b.routing && a.policy === b.policy && a.capacityPct === b.capacityPct
  && a.serverMultiplier === b.serverMultiplier && a.bagCount === b.bagCount

function Comparison({ seq, par }: { seq?: Simulation; par?: Simulation }) {
  const s = seq?.status === 'done' ? seq : undefined
  const p = par?.status === 'done' ? par : undefined
  const comparable = s && p && sameConfig(s.config, p.config)
  const seqMs = s?.operational?.totalMs
  const parMs = p?.operational?.totalMs
  const workers = p?.operational?.workers ?? null
  const speedup = comparable && seqMs !== undefined && parMs !== undefined ? seqMs / parMs : null
  const pre = p?.operational?.precompute ?? null
  return (
    <div className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Sequential run (event loop)" value={ms(seqMs)} />
        <Stat label="Parallel run (precompute + loop)" value={ms(parMs)} />
        <Stat label="Speedup, run vs run" value={times(speedup)} note={comparable || !s || !p ? 'two separate runs' : 'configs differ'} />
        <Stat label="Efficiency" value={speedup !== null && workers ? pct((100 * speedup) / workers, 0) : EMPTY} note={workers ? `${workers} workers` : undefined} />
        <Stat label="Precompute speedup" value={times(pre?.speedup)} note={pre ? `${ms(pre.sequentialMs)} → ${ms(pre.parallelMs)}, same run` : undefined} />
        <Stat
          label="Engine checksum"
          status={comparable ? 'Real' : 'Measured'}
          value={comparable ? (s.engineChecksum === p.engineChecksum ? 'match' : 'MISMATCH') : EMPTY}
          note={comparable ? <span className="font-mono">{p.engineChecksum}</span> : 'needs both runs, same config'}
        />
      </dl>
      {p?.operational && !p.operational.routesPrecomputed && (
        <p className="text-sm">Route + service precompute did not run: {p.operational.routesNote}. Only check-in registration and flight grouping ran in parallel.</p>
      )}
      <p className="text-xs text-muted">
        Run times are wall times on the API machine. The run-vs-run speedup compares two separate runs, so it includes run-to-run noise. The
        precompute speedup is from one run, sequential and parallel repetitions alternating on the same input (median).
      </p>
    </div>
  )
}

function WorkerTimeline({ run }: { run: Simulation }) {
  const tasks = run.operational!.tasks
  const span = Math.max(...tasks.map((t) => t.endMs))
  const execution: Execution = useMemo(() => {
    const ids = [...new Set(tasks.map((t) => t.worker))].sort((a, b) => a - b)
    const kinds = [...new Set(tasks.map((t) => t.kind))]
    return {
      backend: 'rayon', wallMs: span, samplesMs: [], mergeMs: null, checksum: run.engineChecksum ?? '',
      tasks: tasks.map((t) => ({ id: t.id, worker: t.worker, startMs: t.startMs, endMs: t.endMs, size: t.size })),
      workers: ids.map((w) => {
        const mine = tasks.filter((t) => t.worker === w)
        return { worker: w, tasks: mine.length, busyMs: mine.reduce((a, t) => a + t.endMs - t.startMs, 0), size: mine.reduce((a, t) => a + t.size, 0) }
      }),
      stages: kinds.map((k) => {
        const of = tasks.filter((t) => t.kind === k)
        return { name: KIND_NAME[k] ?? k, parallel: true, startMs: Math.min(...of.map((t) => t.startMs)), endMs: Math.max(...of.map((t) => t.endMs)) }
      }),
    }
  }, [tasks, span, run.engineChecksum])
  const replay = useReplay(span)
  return (
    <div className="space-y-3">
      <ReplayControls replay={replay} span={span} clock="Precompute time" />
      <ExecutionTimeline run={execution} span={span} position={replay.position} />
      <TimeAxis span={span} />
      <p className="text-xs text-muted">
        {int(tasks.length)} tasks ({int(execution.workers.length)} of {run.operational!.workers} workers ran at least one), recorded during
        the last parallel precompute repetition, the one whose output the event loop used. The stages row spans each task kind:{' '}
        {execution.stages.map((s) => s.name).join(', then ')}. The event loop that follows runs on one thread and is not drawn.
      </p>
    </div>
  )
}

function Facilities({ run, history }: { run: Simulation; history?: SimulationRun }) {
  const { data, error } = useNetwork(run.id)
  const [selection, setSelection] = useState<Selection>(null)
  const parallel = run.operational?.enabled ?? false
  const views = useMemo(
    () => data?.nodes.map((n) => ({ label: `${n.name}\nlongest queue ${int(n.maxQueue)} · ${FACILITY_STATUS[n.status].label.toLowerCase()}`, status: n.status })) ?? [],
    [data],
  )
  const down = useMemo(() => new Set(data?.edges.filter((e) => e.outages.length > 0 || !e.available).map((e) => e.id) ?? []), [data])
  if (!data) {
    if ((isExpired(error) || history?.retained === false) && history) return <RunExpired run={history} what="Facility counts and the network graph" />
    return <Card><DataState error={error} /></Card>
  }
  const of = (type: string) => data.nodes.filter((n) => n.type === type)
  const sum = (type: string) => of(type).reduce((a, n) => a + n.arrivals, 0)
  const maxQ = (type: string) => Math.max(0, ...of(type).map((n) => n.maxQueue))
  const loaders = of('Loading')
  const cards = [
    { name: 'Check-in', rows: [['Bags checked in', int(sum('CheckIn'))], ['Longest queue', int(maxQ('CheckIn'))]],
      modes: [['Registration of arrivals', parallel], ['Check-in queue', false]] as const },
    { name: 'Flight assignment', rows: [['Bags grouped to a loading area', int(run.summary?.totalBags)], ['Loading areas', int(loaders.length)], ['Bags arriving at loading', int(sum('Loading'))]],
      modes: [['Flight grouping', parallel]] as const },
    { name: 'Screening', rows: [['Bags screened', int(sum('Screening'))], ['Longest queue', int(maxQ('Screening'))]],
      modes: [['Screening queue', false]] as const },
    { name: 'Sorting', rows: [['Bags sorted', int(sum('Sorter'))], ['Longest queue', int(maxQ('Sorter'))]],
      modes: [['Sorter queues', false]] as const },
  ]
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.name} className="space-y-2 text-sm">
            <CardTitle aside={<StatusLabel status="Real" />}>{c.name}</CardTitle>
            <dl className="space-y-1">
              {c.rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-muted">{k}</dt><dd className="font-mono">{v}</dd></div>)}
            </dl>
            <ul className="space-y-1 border-t border-line pt-2">
              {c.modes.map(([k, p]) => <li key={k} className="flex items-center justify-between gap-2"><span>{k}</span><Mode parallel={p} /></li>)}
            </ul>
          </Card>
        ))}
      </div>
      <Card className="min-w-0">
        <CardTitle aside={<StatusLabel status="Real" />}>Network (whole run)</CardTitle>
        <p className="mb-2 text-xs text-muted">Facility status is the worst status in the run, by the API’s display rule. No worker is assigned to a facility: the queues run in the sequential event loop.</p>
        <Suspense fallback={<p className="h-120 text-sm text-muted">Loading the graph…</p>}>
          <NetworkGraph
            network={data} nodes={views} downEdges={down.size ? down : NO_EDGES} showLabels showFlow={false}
            hiddenTypes={NO_TYPES} selection={selection} onSelect={setSelection} markers={[]}
          />
        </Suspense>
      </Card>
    </>
  )
}

export function ParallelOperationsPage() {
  const health = useHealth()
  const api = useApiState()
  const offline = api === 'offline'
  const job = useBaselineJob()
  const history = useHistory()
  const [params, setParams] = useSearchParams()
  const ids: Record<Slot, string | null> = { seq: params.get('seq'), par: params.get('par') }
  const seq = useRun(ids.seq)
  const par = useRun(ids.par)
  const d = health.data?.simulationDefaults
  const [edits, setEdits] = useState<Record<string, string>>({})
  const form = d ? { scenario: d.scenario, routing: d.routing, policy: d.policy, bagCount: String(d.bagCount), workers: String(d.workers ?? d.threads ?? 1), ...edits } : null
  const isStatic = form ? STATIC_ROUTINGS.includes(form.routing) : false
  const busy = job.submitting || job.activeId !== null

  const submit = (slot: Slot) => {
    if (!form || !d) return
    const config: SimulationConfig = {
      ...d, scenario: form.scenario, routing: form.routing, policy: form.policy, bagCount: Number(form.bagCount),
      operationalParallel: slot === 'par', workers: Number(form.workers),
    }
    job.submit(config, (id) => setParams((p) => {
      p.set(slot, id)
      return p
    }, { replace: true }))
  }

  const shown = par.data?.status === 'done' ? par.data : seq.data?.status === 'done' ? seq.data : undefined
  const op = shown?.operational
  const sim = health.data?.sweep
  const field = (key: string, label: string, options: string[]) => (
    <label className="text-sm">
      {label}
      <select className={SELECT} value={form?.[key as keyof typeof form] ?? ''} disabled={!form} onChange={(e) => setEdits((x) => ({ ...x, [key]: e.target.value }))}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-heading">Parallel Airport Operations</h1>
        <p className="text-sm text-muted">The engine’s independent per-bag work on Rayon workers, and the event loop that stays sequential.</p>
      </header>

      {offline && <Card><p role="alert" className="text-critical">API unreachable. Runs cannot be started and saved results cannot be loaded.</p></Card>}

      <dl className="grid gap-3 sm:grid-cols-3">
        <Card><Stat label="Workers" value={op ? (op.enabled ? int(op.workers) : '1 (sequential run)') : EMPTY} status="Real" /></Card>
        <Card><Stat label="Bags processed" value={shown?.summary ? int(shown.summary.loadedOnTime + shown.summary.delayedBags) : EMPTY} status="Real" note={shown?.summary ? `of ${int(shown.summary.totalBags)} simulated` : undefined} /></Card>
        <Card><Stat label="Execution time" value={ms(op?.totalMs)} note={op ? (op.enabled ? 'parallel precompute + event loop' : 'event loop') : undefined} /></Card>
      </dl>

      <Card className="space-y-3">
        <CardTitle>Run controls</CardTitle>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {field('scenario', 'Scenario', sim?.scenarios ?? [])}
          {field('routing', 'Routing', sim?.routings ?? [])}
          {field('policy', 'Policy', sim?.policies ?? [])}
          <label className="text-sm">Bags
            <input type="number" className={SELECT} min={health.data?.simulation.bagCount[0]} max={health.data?.simulation.bagCount[1]} value={form?.bagCount ?? ''} disabled={!form}
              onChange={(e) => setEdits((x) => ({ ...x, bagCount: e.target.value }))} />
          </label>
          <label className="text-sm">Workers
            <input type="number" className={SELECT} min={1} max={health.data?.simulation.threads[1]} value={form?.workers ?? ''} disabled={!form}
              onChange={(e) => setEdits((x) => ({ ...x, workers: e.target.value }))} />
          </label>
        </div>
        <p className="text-xs text-muted">Capacity {d ? `${d.capacityPct}%` : EMPTY}, server multiplier {d ? d.serverMultiplier : EMPTY}: the API defaults, the same for both runs.</p>
        {form && !isStatic && (
          <p className="text-sm"><strong>Operational parallel mode is unavailable for {form.routing} routing:</strong> its routes read live queues
            {form.routing === 'deadline' ? ' and the current time' : ''} while events run, so they cannot be computed before the event loop.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${BUTTON} border border-line`} disabled={!form || busy || offline} onClick={() => submit('seq')}>Run sequential</button>
          <button type="button" className={`${BUTTON} bg-ops text-white`} disabled={!form || busy || offline || !isStatic} onClick={() => submit('par')}>Run parallel</button>
        </div>
        {job.submitError && <p role="alert" className="text-sm text-critical">{submitMessage(job.submitError)}</p>}
        {job.activeId !== null && (job.activeId === ids.seq || job.activeId === ids.par) && <SimulationProgress />}
        {job.activeId !== null && job.activeId !== ids.seq && job.activeId !== ids.par && <p className="text-sm">Another simulation is running; wait for it to finish.</p>}
        <div className="border-t border-line pt-3">
          <RunState label="Sequential run" q={seq} />
          <RunState label="Parallel run" q={par} />
        </div>
        <Comparison seq={seq.data} par={par.data} />
      </Card>

      <Card>
        <CardTitle aside={<StatusLabel status="Measured" />}>Worker timeline: operational precompute</CardTitle>
        {par.data?.status === 'done' && par.data.operational?.tasks.length
          ? <WorkerTimeline run={par.data} />
          : <p className="text-sm text-muted">{EMPTY} No parallel run yet. Run parallel to record the precompute tasks.</p>}
      </Card>

      {shown
        ? <Facilities run={shown} history={history.data?.find((r): r is SimulationRun => r.kind === 'simulation' && r.id === shown.id)} />
        : <Card><p className="text-sm text-muted">{EMPTY} Facility counts and the network appear after a finished run.</p></Card>}

      <Card className="space-y-2 text-sm">
        <CardTitle>What runs in parallel, and why</CardTitle>
        <p><strong>Parallel (Rayon, before the event loop):</strong> check-in registration (each bag’s arrival time), flight grouping (each bag’s
          loading area) and, for dijkstra and ecmp routing without an edge outage, each bag’s full route and its service time at every facility on it.
          Each task covers a contiguous range of bags and only reads shared data; there are at least four tasks per worker.</p>
        <p><strong>Sequential:</strong> the discrete-event loop, every queue, server allocation and the order of events. Each event can change
          the queues that later events see, so they must run one at a time in time order.</p>
        <p><strong>Why the result cannot change:</strong> the engine draws service times from a stateless hash of (seed, bag, stage), not from a
          shared random stream, so a value is the same whichever worker computes it. The engine checksum above checks this for your two runs.</p>
      </Card>
    </div>
  )
}
