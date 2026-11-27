// Saved results from other runs. Always Static, always with the machine, never on a measured axis.

import { useStaticResults } from '../../hooks/useParallelExecution'
import type { StaticRow } from '../../types/parallel'
import { int, msFine, times } from '../../utils/format'
import { DataState } from '../common/DataState'
import { StatusLabel } from '../common/StatusLabel'

function group(rows: StaticRow[]) {
  const groups = new Map<string, StaticRow[]>()
  for (const r of rows) {
    const key = `${r.machine}\n${r.sourceFile}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.values()]
}

function Table({ rows }: { rows: StaticRow[] }) {
  const mpi = rows[0].kind === 'mpi'
  const head = mpi
    ? ['Mode', 'Ranks', 'Load', 'Compute', 'Reduce', 'Compute speedup', 'End-to-end speedup', 'Source']
    : ['Row in file', 'Time', 'Speedup vs scalar in file', 'Copy in', 'Copy out', 'Source']
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-sm">
        <strong>{rows[0].machine}</strong>{' '}
        <span className="text-xs text-muted">{int(rows[0].bags)} bags · {rows[0].statistic} · {rows[0].sourceFile}</span> <StatusLabel status="Static" />
      </p>
      <table className="w-full min-w-130 text-xs">
        <thead className="text-muted">
          <tr>{head.map((h, i) => <th key={h} className={`border-b border-line py-1 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((r, i) => {
            const cells = mpi
              ? [int(r.ranks), msFine(r.loadMs), msFine(r.computeMs), msFine(r.reduceMs), times(r.computeSpeedup), times(r.endToEndSpeedup)]
              : [msFine(r.timeMs), times(r.speedup), msFine(r.copyInMs), msFine(r.copyOutMs)]
            return (
              <tr key={i}>
                <td className="py-0.5 text-left">{r.label}</td>
                {cells.map((c, j) => <td key={j} className="py-0.5 text-right">{c}</td>)}
                <td className="py-0.5 text-right font-sans"><StatusLabel status="Static" /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function StaticResults({ keep }: { keep: (row: StaticRow) => boolean }) {
  const { data, error } = useStaticResults()
  if (!data) return <DataState error={error} />
  const rows = data.filter(keep)
  if (rows.length === 0) return <p className="text-sm text-muted">-- No saved rows.</p>
  return <div className="space-y-4">{group(rows).map((g) => <Table key={g[0].machine + g[0].sourceFile} rows={g} />)}</div>
}
