import { useApiState } from '../../hooks/useHealth'
import { useHistory } from '../../hooks/useHistory'
import type { Run } from '../../types/models'
import { dateTime } from '../../utils/format'

/** Choose among saved runs of one kind. */
export function RunPicker({ label, runs, value, describe, onChange }: {
  label: string
  runs: Run[]
  value: string | undefined
  describe: (run: Run) => string
  onChange: (id: string) => void
}) {
  // an empty list only means "none saved" once the history has been read
  const read = useHistory().data !== undefined
  const offline = useApiState() === 'offline'
  const empty = read ? '-- none saved' : offline ? '-- unknown, API unreachable' : '-- loading'
  return (
    <label className="flex max-w-full min-w-0 flex-wrap items-center gap-2 text-sm">
      {label}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="w-auto max-w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
        {!runs.some((r) => r.id === value) && <option value={value ?? ''}>{value ?? empty}</option>}
        {runs.map((r) => (
          <option key={r.id} value={r.id}>{dateTime(r.createdAt)} · {describe(r)}{r.status === 'done' ? '' : ` · ${r.status}`}</option>
        ))}
      </select>
    </label>
  )
}
