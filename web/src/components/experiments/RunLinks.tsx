import { Link } from 'react-router'

/** The pages that show one finished simulation. */
export function RunLinks({ id, retained }: { id: string; retained: boolean }) {
  const pages = [
    ['/operations/network', 'Airport Network'],
    ['/operations/baggage', 'Baggage Tracker'],
    ['/operations/congestion', 'Congestion Analysis'],
    ['/operations/stages', 'Stage Explorer'],
  ]
  return (
    <ul className="flex flex-wrap gap-2">
      {pages.map(([to, name]) => (
        <li key={to}>
          <Link to={`${to}?sim=${id}`} className="inline-block rounded-lg border border-line bg-surface px-3 py-1 text-sm text-perf underline">{name}</Link>
        </li>
      ))}
      {!retained && <li className="self-center text-xs text-muted">Detailed data expired: network, bags and time charts need a new run.</li>}
    </ul>
  )
}
