import type { ReactNode } from 'react'

/** A table that scrolls sideways on narrow screens. The first column is left aligned. */
export function Table({ head, rows, minWidth = '36rem' }: { head: string[]; rows: { key: string | number; cells: ReactNode[] }[]; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="text-muted">
          <tr>{head.map((h, i) => <th key={h} className={`border-b border-line px-1 py-1.5 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>{r.cells.map((c, i) => <td key={i} className={`px-1 py-1 font-mono ${i ? 'text-right' : 'text-left'}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
