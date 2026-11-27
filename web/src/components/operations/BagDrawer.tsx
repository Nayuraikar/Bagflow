import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { BAG_STATUS_LABEL, NOT_PRODUCED, PRIORITY_LABEL } from '../../config/ops'
import { isExpired, useBag } from '../../hooks/useRunData'
import type { BagDetail, NodeStats } from '../../types/ops'
import { EMPTY } from '../../utils/format'
import { duration, simClock } from '../../utils/simTime'
import { DataState } from '../common/DataState'
import { StatusLabel } from '../common/StatusLabel'
import { RedirectedBadge } from './RedirectedBadge'

function Detail({ bag, nodes }: { bag: BagDetail; nodes: NodeStats[] }) {
  const name = (id: number | null) => nodes.find((n) => n.id === id)?.name ?? EMPTY
  const status = bag.status ? BAG_STATUS_LABEL[bag.status] : 'Not arrived yet'
  const location = bag.currentNode !== null ? name(bag.currentNode) : bag.nextNode !== null ? `Travelling to ${name(bag.nextNode)}` : EMPTY
  const facts: [string, ReactNode][] = [
    [bag.atMs === null ? 'Final status' : `Status at ${simClock(bag.atMs)}`, status + (bag.overdue ? ' (past its deadline)' : '')],
    ['Location', location],
    [bag.redirected ? 'Flight (original)' : 'Flight', bag.flightId],
    ['Departure', simClock(bag.departureMs)],
    ['Loading area', name(bag.loadingNode)],
    ['Priority', PRIORITY_LABEL[bag.priority] ?? bag.priority],
    ['Passenger id (synthetic)', bag.passengerId],
    ['Weight', `${bag.weightKg.toFixed(1)} kg`],
    ['Attributes', [bag.transfer && 'transfer', bag.specialHandling && 'special handling'].filter(Boolean).join(', ') || 'none'],
    ['Arrived', simClock(bag.arrivalMs)],
    ['Deadline', simClock(bag.deadlineMs)],
    [bag.atMs === null ? 'Total queue wait' : 'Queue wait so far', duration(bag.waitMs)],
  ]
  return (
    <>
      {bag.redirected && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <RedirectedBadge />
          SorterOverload sent this bag to {name(bag.loadingNode)} instead of its flight’s own loading area.
        </p>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">Every value here is from this run’s engine history of one synthetic bag. <StatusLabel status="Real" /></p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {facts.map(([label, value]) => (
          <div key={label}><dt className="text-xs text-muted">{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <h3 className="mt-5 flex items-center gap-2 font-semibold">State timeline (whole run) <StatusLabel status="Real" /></h3>
      {bag.atMs !== null && <p className="text-xs text-muted">Faded entries happen after the playback time.</p>}
      <ol className="mt-3 ml-1.5 border-l-2 border-line" aria-label="State timeline">
        {bag.timeline.map((t, i) => {
          // the inspection hold has no time of its own: it sits with the screening entry before it
          const at = t.atMs ?? bag.timeline[i - 1]?.atMs ?? null
          const later = bag.atMs !== null && at !== null && at > bag.atMs
          return (
            <li key={`${t.state}-${i}`} className={`relative pb-4 pl-4 text-sm ${later ? 'opacity-45' : ''}`}>
              <span
                aria-hidden
                className={`absolute top-1 -left-[7px] size-3 rounded-full ${t.state === 'DELAYED' ? 'bg-critical' : t.state === 'HELD_FOR_INSPECTION' ? 'bg-warning' : 'bg-ops'}`}
              />
              <p className="font-semibold">{BAG_STATUS_LABEL[t.state]}{later && <span className="font-normal"> (later)</span>}</p>
              <p className="text-muted">
                {t.atMs === null ? 'During screening (no time of its own)' : <span className="font-mono">{simClock(t.atMs)}</span>}
                {' · '}{name(t.node)}
                {t.waitingMs !== null && ` · waited ${duration(t.waitingMs)}`}
                {t.durationMs !== null && ` · extra inspection ${duration(t.durationMs)}`}
              </p>
            </li>
          )
        })}
      </ol>
      <p className="text-xs text-muted">
        Screening and Loading entries are timed when service starts, so a bag still in that queue already has the status. Waiting is time in
        that facility’s queue. “Cleared” means screening ended: the engine rejects no bags. {NOT_PRODUCED}
      </p>
    </>
  )
}

interface Props {
  runId: string
  bag: number | null
  atMs: number | undefined
  nodes: NodeStats[]
  onClose: () => void
}

export function BagDrawer({ runId, bag, atMs, nodes, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { data, error } = useBag(runId, bag, atMs)
  const open = bag !== null
  useEffect(() => {
    const el = dialog.current!
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog
      ref={dialog} aria-label={open ? `Bag ${bag}` : 'Bag'} onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-md overflow-y-auto border-l border-line bg-surface text-heading backdrop:bg-heading/30"
    >
      {open && (
        <div className="p-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">Bag {bag}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-lg border border-line p-1.5"><X size={16} aria-hidden /></button>
          </div>
          {data ? <Detail bag={data} nodes={nodes} /> : (
            <div className="mt-4">
              {isExpired(error) ? <p className="text-sm text-critical">This run’s bag histories have expired.</p> : <DataState error={error} />}
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}
