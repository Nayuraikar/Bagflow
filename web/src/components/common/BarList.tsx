// One series of horizontal bars on one scale, every bar with its value and source.

import { Link } from 'react-router'
import { EMPTY } from '../../utils/format'
import { StatusLabel } from './StatusLabel'
import type { Status } from './status'

export interface BarRow {
  key: string
  label: string
  value: number | null
  /** The value as text. */
  text: string
  /** Makes the label a link. */
  to?: string
}

export function BarList({ rows, status = 'Measured', color = '#3975ce' }: { rows: BarRow[]; status?: Status; color?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${r.text}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {r.to
            ? <Link to={r.to} className="w-36 shrink-0 truncate font-mono text-perf underline">{r.label}</Link>
            : <span className="w-36 shrink-0 truncate font-mono">{r.label}</span>}
          <span className="h-3 min-w-16 flex-1">
            {r.value !== null && max > 0 && (
              <span className="block h-3 rounded-r" style={{ width: `${(100 * r.value) / max}%`, minWidth: 1, background: color }} />
            )}
          </span>
          <span className="w-20 shrink-0 text-right font-mono">{r.text}</span>
          <span className="w-22 shrink-0">{r.text !== EMPTY && <StatusLabel status={status} />}</span>
        </li>
      ))}
    </ul>
  )
}
