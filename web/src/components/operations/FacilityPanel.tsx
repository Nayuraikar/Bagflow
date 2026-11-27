import type { ReactNode } from 'react'
import type { Network, NetworkEdge, NetworkNode } from '../../types/ops'
import { EMPTY, int, pct } from '../../utils/format'
import { edgeAvailableAt, type FacilityState } from '../../utils/network'
import { duration, simClock } from '../../utils/simTime'
import { Card } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'
import type { Status } from '../common/status'
import { StatusPill } from './FacilityStatus'
import type { Selection } from './NetworkGraph'

/** `source` is `null` for text that is not a value. */
type Row = [label: string, value: ReactNode, source: Status | null]

function Facts({ rows }: { rows: Row[] }) {
  return (
    <dl className="mt-3 space-y-2 text-sm">
      {rows.map(([label, value, source]) => (
        <div key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span>{value}</span>
            {source && value !== EMPTY && <StatusLabel status={source} />}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const timeRange = (o: { startMs: number; endMs: number }) => `${simClock(o.startMs)}–${simClock(o.endMs)}`
const share = (v: number | null | undefined) => pct(v === null || v === undefined ? null : 100 * v)
const LINK = 'text-perf underline'

interface Props {
  network: Network
  selection: Selection
  onSelect: (selection: Selection) => void
  /** `null` in the whole-run view. */
  atMs: number | null
  /** Indexed like `network.nodes`; all `null` in the whole-run view. */
  states: (FacilityState | null)[]
}

export function FacilityPanel({ network, selection, onSelect, atMs, states }: Props) {
  const name = (id: number) => network.nodes.find((n) => n.id === id)?.name ?? EMPTY
  const node = selection?.kind === 'node' ? network.nodes.find((n) => n.id === selection.id) : undefined
  const edge = selection?.kind === 'edge' ? network.edges.find((e) => e.id === selection.id) : undefined

  const links = (ids: string[], end: 'source' | 'target') =>
    ids.length === 0 ? 'None' : (
      <ul>
        {ids.map((id) => {
          const e = network.edges.find((x) => x.id === id)!
          return (
            <li key={id}>
              <button type="button" className={LINK} onClick={() => onSelect({ kind: 'edge', id })}>{name(e[end])}</button>
              <span className="text-muted"> · {int(e.trafficTotal)} bags in run</span>
            </li>
          )
        })}
      </ul>
    )

  const nodeRows = (n: NetworkNode): Row[] => {
    const state = states[network.nodes.indexOf(n)]
    const timed = atMs !== null
    const outages = network.nodeOutages.filter((o) => o.node === n.id)
    return [
      ['Id / type', `${n.id} / ${n.type}`, null],
      ['Capacity (servers)', `${int(n.capacity)}${state && state.capacity !== n.capacity ? ` (${int(state.capacity)} at this time)` : ''}`, 'Measured'],
      ['Busy servers', state ? int(state.busy) : EMPTY, 'Measured'],
      ['Incoming', links(n.incoming, 'source'), n.incoming.length ? 'Measured' : null],
      ['Outgoing', links(n.outgoing, 'target'), n.outgoing.length ? 'Measured' : null],
      ['Queue length', state ? int(state.queue) : EMPTY, 'Measured'],
      ['Longest queue (run)', int(n.maxQueue), 'Measured'],
      ['Average wait (run)', duration(1000 * n.avgWaitS), 'Measured'],
      ...(timed ? [['Utilisation (window)', share(state?.utilisation), 'Simplified'] as Row] : []),
      ['Utilisation (run)', share(n.utilisation), 'Measured'],
      ['Peak window utilisation (run)', share(n.peakWindowUtilisation), 'Simplified'],
      [timed ? 'Status at this time' : 'Worst status (run)', <StatusPill key="s" status={timed ? state?.status : n.status} />, !timed || state ? 'Simplified' : null],
      [timed ? 'Arrived so far' : 'Arrived (run)', int(timed ? state?.arrivals : n.arrivals), 'Measured'],
      [timed ? 'Completed so far' : 'Completed (run)', int(timed ? state?.completions : n.completions), 'Measured'],
      ...(outages.length
        ? [['Capacity cut', outages.map((o) => `${timeRange(o)} to ${pct(100 * o.capacityFactor, 0)}`).join(', '), 'Real'] as Row]
        : []),
    ]
  }

  const edgeRows = (e: NetworkEdge): Row[] => [
    ['Source', <button key="s" type="button" className={LINK} onClick={() => onSelect({ kind: 'node', id: e.source })}>{name(e.source)}</button>, null],
    ['Destination', <button key="d" type="button" className={LINK} onClick={() => onSelect({ kind: 'node', id: e.target })}>{name(e.target)}</button>, null],
    ['Travel time (fixed)', duration(e.travelTimeMs), 'Real'],
    ['Maximum throughput', `${EMPTY} not enforced by the engine`, null],
    ['Bags over the whole run', int(e.trafficTotal), 'Measured'],
    ['Availability', atMs === null
      ? (e.outages.length ? 'Has an outage in this run' : e.available ? 'Available for the whole run' : 'Unavailable')
      : `${edgeAvailableAt(e, atMs) ? 'Available' : 'Down'} at ${simClock(atMs)}`, 'Real'],
    ['Outages', e.outages.length ? e.outages.map(timeRange).join(', ') : 'None', e.outages.length ? 'Real' : null],
  ]

  return (
    <Card className="min-w-0 self-start">
      <label className="block text-xs text-muted">
        Selected facility or link
        <select
          className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-heading"
          value={selection ? `${selection.kind}:${selection.id}` : ''}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(':')
            onSelect(id === undefined ? null : kind === 'node' ? { kind, id: Number(id) } : { kind: 'edge', id })
          }}
        >
          <option value="">None</option>
          <optgroup label="Facilities">
            {network.nodes.map((n) => <option key={n.id} value={`node:${n.id}`}>{n.name}</option>)}
          </optgroup>
          <optgroup label="Links">
            {network.edges.map((e) => <option key={e.id} value={`edge:${e.id}`}>{name(e.source)} → {name(e.target)}</option>)}
          </optgroup>
        </select>
      </label>
      {node ? (
        <>
          <h2 className="mt-4 font-semibold">{node.name}</h2>
          <p className="text-xs text-muted">{atMs === null ? 'Whole run' : `At ${simClock(atMs)}; rows marked (run) cover the whole run`}</p>
          <Facts rows={nodeRows(node)} />
        </>
      ) : edge ? (
        <>
          <h2 className="mt-4 font-semibold">{name(edge.source)} → {name(edge.target)}</h2>
          <p className="text-xs text-muted">Link {edge.id}</p>
          <Facts rows={edgeRows(edge)} />
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">Click a facility or link in the graph, or choose one above.</p>
      )}
    </Card>
  )
}
