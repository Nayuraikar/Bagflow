import { Maximize, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Card } from '../components/common/Card'
import { DataState } from '../components/common/DataState'
import { StatusLabel } from '../components/common/StatusLabel'
import { FacilityPanel } from '../components/operations/FacilityPanel'
import { StatusRuleNote } from '../components/operations/FacilityStatus'
import type { GraphHandle, Selection } from '../components/operations/NetworkGraph'
import { RunExpired } from '../components/operations/RunExpired'
import { OperationsFrame } from '../components/operations/SelectedRun'
import { DEFAULT_PLAYBACK_MS, FACILITY_STATUS, RULE_NAME } from '../config/ops'
import { useBagSample } from '../hooks/useBagSample'
import { usePlayback } from '../hooks/usePlayback'
import { isExpired, useNetwork } from '../hooks/useRunData'
import type { SimulationRun } from '../types/models'
import type { Network } from '../types/ops'
import { int } from '../utils/format'
import { edgeAvailableAt, facilityAt, markersAt, sampleIndex, type Marker } from '../utils/network'
import { simClock } from '../utils/simTime'

// Cytoscape is large, so it loads with this page only
const NetworkGraph = lazy(() => import('../components/operations/NetworkGraph'))

/** Simulation seconds per real second. */
const SPEEDS = [1, 5, 15, 60, 600]
const BUTTON = 'flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-40'
const SELECT = 'rounded-lg border border-line bg-surface px-2 py-1.5'
const NO_MARKERS: Marker[] = []

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <input type="checkbox" className="accent-ops" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Legend({ congestion, flow }: { congestion: boolean; flow: boolean }) {
  const line = 'inline-block w-6 border-t-2'
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {congestion ? Object.values(FACILITY_STATUS).map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className="size-3 rounded-full" style={{ background: s.color }} aria-hidden />{s.label}
        </li>
      )) : <li>Congestion colours are off.</li>}
      <li className="flex items-center gap-1.5"><span className={`${line} border-[#c3ccd7]`} aria-hidden />Link{flow ? ' (width: bags over the whole run; arrow: direction)' : ''}</li>
      <li className="flex items-center gap-1.5"><span className={`${line} border-dashed border-critical`} aria-hidden />Link down at this time (whole run: had an outage)</li>
      <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#2a78d6]" aria-hidden />Sampled bag</li>
      <li className="flex items-center gap-1.5"><span className="size-2 rotate-45 bg-[#4a3aa7]" aria-hidden />Sampled bag redirected by SorterOverload</li>
    </ul>
  )
}

function NetworkView({ run, network }: { run: SimulationRun; network: Network }) {
  const graph = useRef<GraphHandle>(null)
  const [params, setParams] = useSearchParams()
  const [wholeRun, setWholeRun] = useState(false)
  const [labels, setLabels] = useState(true)
  const [congestion, setCongestion] = useState(true)
  const [flow, setFlow] = useState(true)
  const [bags, setBags] = useState(true)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())

  const times = network.series.timesMs
  const start = times[0]
  const end = times[times.length - 1]
  const playback = usePlayback(start, end, DEFAULT_PLAYBACK_MS)
  const atMs = wholeRun ? null : playback.atMs
  const index = atMs === null ? -1 : sampleIndex(times, atMs)

  const nodeParam = params.get('node')
  const edgeParam = params.get('edge')
  const selection: Selection = useMemo(
    () => (nodeParam !== null ? { kind: 'node', id: Number(nodeParam) } : edgeParam !== null ? { kind: 'edge', id: edgeParam } : null),
    [nodeParam, edgeParam],
  )
  const select = (s: Selection) =>
    setParams((p) => {
      p.delete('node')
      p.delete('edge')
      if (s) p.set(s.kind, String(s.id))
      return p
    }, { replace: true })

  const states = useMemo(() => network.nodes.map((_, i) => facilityAt(network, i, index)), [network, index])
  const views = useMemo(
    () => network.nodes.map((n, i) => {
      const status = wholeRun ? n.status : (states[i]?.status ?? null)
      const queue = wholeRun ? `longest queue ${int(n.maxQueue)}` : `queue ${int(states[i]?.queue)}`
      // the status word as well, so colour is not the only sign
      return {
        label: `${n.name}\n${queue}${congestion && status ? ` · ${FACILITY_STATUS[status].label.toLowerCase()}` : ''}`,
        status: congestion ? status : null,
      }
    }),
    [network, states, wholeRun, congestion],
  )
  const downKey = network.edges
    .filter((e) => (atMs === null ? e.outages.length > 0 || !e.available : !edgeAvailableAt(e, atMs)))
    .map((e) => e.id)
    .join()
  const downEdges = useMemo(() => new Set(downKey.split(',')), [downKey])

  const showBags = bags && !wholeRun
  const sample = useBagSample(run.id, playback.atMs, Math.max(60_000, playback.speed * 5_000), showBags)
  const markers = useMemo(
    () => (showBags && sample.data ? markersAt(sample.data, playback.atMs) : NO_MARKERS),
    [showBags, sample.data, playback.atMs],
  )
  const types = [...new Set(network.nodes.map((n) => n.type))]

  return (
    <>
      <Card className="space-y-3">
        <div role="toolbar" aria-label="Network view" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-1">
            <button type="button" className={BUTTON} onClick={() => graph.current?.zoom(1.25)}><ZoomIn size={15} aria-hidden />Zoom in</button>
            <button type="button" className={BUTTON} onClick={() => graph.current?.zoom(0.8)}><ZoomOut size={15} aria-hidden />Zoom out</button>
            <button type="button" className={BUTTON} onClick={() => graph.current?.fit()}><Maximize size={15} aria-hidden />Fit</button>
          </div>
          <Toggle label="Labels" checked={labels} onChange={setLabels} />
          <Toggle label="Congestion" checked={congestion} onChange={setCongestion} />
          <Toggle label="Flow" checked={flow} onChange={setFlow} />
          <Toggle label="Sampled bags" checked={bags} onChange={setBags} />
        </div>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <legend className="sr-only">Facility types shown</legend>
          <span className="text-sm text-muted">Types shown:</span>
          {types.map((t) => (
            <Toggle
              key={t} label={t} checked={!hidden.has(t)}
              onChange={(on) => setHidden((h) => {
                const next = new Set(h)
                if (on) next.delete(t)
                else next.add(t)
                return next
              })}
            />
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-sm">
            View
            <select
              className={SELECT} value={wholeRun ? 'run' : 'time'}
              onChange={(e) => {
                playback.pause()
                setWholeRun(e.target.value === 'run')
              }}
            >
              <option value="time">Playback time</option>
              <option value="run">Whole run</option>
            </select>
          </label>
          <button type="button" className={BUTTON} disabled={wholeRun} onClick={playback.toggle}>
            {playback.running ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
            {playback.running ? 'Pause' : 'Play'}
          </button>
          <label className="flex items-center gap-2 text-sm">
            Speed
            <select className={SELECT} disabled={wholeRun} value={playback.speed} onChange={(e) => playback.setSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => <option key={s} value={s}>{s} sim s per s</option>)}
            </select>
          </label>
          <input
            type="range" aria-label="Playback time" className="min-w-40 flex-1 accent-ops disabled:opacity-40" disabled={wholeRun}
            min={start} max={end} step={1000} value={Math.round(playback.atMs)} aria-valuetext={simClock(playback.atMs)}
            onChange={(e) => playback.seek(Number(e.target.value))}
          />
          <output className="flex items-center gap-2 font-mono text-sm">
            {wholeRun ? 'whole run' : <>{simClock(playback.atMs)} <StatusLabel status="Real" /></>}
          </output>
        </div>
        <p className="text-xs text-muted">
          Playback shows saved simulation results, not a live airport. Times are simulation time.{' '}
          {wholeRun
            ? 'Colours show each facility’s worst status in the run. Bag markers need a playback time.'
            : index < 0
              ? 'Before the first sample.'
              : `Facility values come from the engine sample at ${simClock(times[index])}; there is one every ${network.series.intervalMs / 1000} simulation seconds.`}
        </p>
        {showBags && (
          <p className="flex flex-wrap items-center gap-2 text-xs" data-testid="marker-note">
            <StatusLabel status="Simplified" />
            {sample.error ? (
              <span className="text-critical">
                {isExpired(sample.error) ? 'The run’s bag histories have expired, so no markers can be drawn.' : `Bag markers unavailable: ${sample.error.message}`}
              </span>
            ) : !sample.data ? (
              <span>Loading sampled bags…</span>
            ) : (
              <span>
                {int(markers.length)} markers shown, from {int(sample.data.length)} sampled bags with their real histories: a small sample, not
                every bag, so marker density shows nothing about load. <strong>Bags are drawn in straight lines</strong> along each link at even
                speed between the real departure and arrival; at a facility they are drawn in a ring beside it.
              </span>
            )}
          </p>
        )}
      </Card>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-w-0 self-start">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span>Queue figures on the graph are engine samples</span> <StatusLabel status="Measured" />
            <span>colours are the {RULE_NAME}</span> <StatusLabel status="Simplified" />
          </p>
          <Suspense fallback={<p className="h-120 text-sm text-muted">Loading the graph…</p>}>
            <NetworkGraph
              ref={graph} network={network} nodes={views} downEdges={downEdges} showLabels={labels} showFlow={flow}
              hiddenTypes={hidden} selection={selection} onSelect={select} markers={markers}
            />
          </Suspense>
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <Legend congestion={congestion} flow={flow} />
            <StatusRuleNote rule={network.statusRule} />
            <p className="text-xs text-muted">Drag the background to pan; scroll to zoom. Node positions and names are BagFlow’s layout. Conveyors are the links, not facilities.</p>
          </div>
        </Card>
        <FacilityPanel network={network} selection={selection} onSelect={select} atMs={atMs} states={states} />
      </div>
    </>
  )
}

function NetworkLoader({ run }: { run: SimulationRun }) {
  const { data, error } = useNetwork(run.id)
  // data already fetched stays usable after the server drops the run
  if (data) return <NetworkView run={run} network={data} />
  if (isExpired(error) || !run.retained) return <RunExpired run={run} what="The network graph and playback" />
  return <Card><DataState error={error} /></Card>
}

export function AirportNetworkPage() {
  return (
    <OperationsFrame title="Airport Network" subtitle="The engine’s airport graph, with queues over simulation time.">
      {(run) => <NetworkLoader run={run} />}
    </OperationsFrame>
  )
}
