import type { ReactNode } from 'react'
import { StatusLabel } from '../common/StatusLabel'
import type { Status } from '../common/status'
import { EMPTY } from '../../utils/format'

/** One number with where it comes from. An empty value carries no label. */
export function Stat({ label, value, status = 'Measured', note }: { label: string; value: ReactNode; status?: Status; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg font-semibold break-all">{value}</span>
        {value !== EMPTY && <StatusLabel status={status} />}
      </dd>
      {note && <dd className="text-xs text-muted">{note}</dd>}
    </div>
  )
}
