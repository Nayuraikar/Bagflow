import { CircleCheck, CircleDashed, CircleSlash, FlaskConical, Archive, Timer, type LucideIcon } from 'lucide-react'
import { STATUS_MEANING, type Status } from './status'

const STYLE: Record<Status, { icon: LucideIcon; className: string }> = {
  Implemented: { icon: CircleCheck, className: 'border-ops/40 bg-ops/10' },
  Measured: { icon: Timer, className: 'border-perf/40 bg-perf/10' },
  Static: { icon: Archive, className: 'border-muted/50 bg-muted/10' },
  Simplified: { icon: FlaskConical, className: 'border-warning/60 bg-warning/15' },
  Planned: { icon: CircleDashed, className: 'border-dashed border-muted/60' },
  Unavailable: { icon: CircleSlash, className: 'border-critical/40 bg-critical/10' },
}

/** Says where a value comes from. `Unavailable` means unavailable on this machine. */
export function StatusLabel({ status }: { status: Status }) {
  const { icon: Icon, className } = STYLE[status]
  return (
    <span
      title={STATUS_MEANING[status]}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-heading ${className}`}
    >
      <Icon size={11} aria-hidden />
      {status}
    </span>
  )
}
