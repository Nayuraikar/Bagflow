import { FACILITY_STATUS, RULE_NAME } from '../../config/ops'
import type { FacilityStatus, StatusRule } from '../../types/ops'
import { EMPTY, pct } from '../../utils/format'
import { StatusLabel } from '../common/StatusLabel'

export function StatusPill({ status }: { status: FacilityStatus | null | undefined }) {
  if (!status) return <span className="font-mono">{EMPTY}</span>
  const { label, color } = FACILITY_STATUS[status]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}

export function StatusRuleNote({ rule }: { rule: StatusRule }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <StatusLabel status="Simplified" />
      <span>
        <strong>Facility colours: {RULE_NAME}.</strong> The API takes utilisation over the last {rule.windowSamples} samples (
        {rule.windowSamples} simulation minutes): High from {pct(100 * rule.highAt, 0)}, Congested from {pct(100 * rule.congestedAt, 0)},
        Offline when capacity is zero. The engine itself has no facility status.
      </span>
    </p>
  )
}
