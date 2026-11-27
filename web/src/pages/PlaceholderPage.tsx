import { Link } from 'react-router'
import { Card } from '../components/common/Card'
import { StatusLabel } from '../components/common/StatusLabel'
import type { PlannedPage } from '../config/navigation'

export function PlaceholderPage({ page }: { page: PlannedPage }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{page.label}</h1>
        <StatusLabel status="Planned" />
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">What this page will show</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {page.shows.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <h2 className="mt-5 mb-1 font-semibold">When it is built</h2>
        <p className="text-sm">
          Not in the current phase (R2, the app shell).{' '}
          {page.priority === null
            ? 'The design’s build priority list does not name this page.'
            : `Build priority ${page.priority} of 7 in parallel-studio.md §7${page.priorityNote ? ` (${page.priorityNote})` : ''}.`}{' '}
          The design docs do not assign it a phase number yet.
        </p>
        <p className="mt-3 text-xs text-muted">Design source: docs/design/{page.source}</p>
      </Card>
      <Link to="/" className="inline-block text-sm text-perf underline">Back to the Main Dashboard</Link>
    </div>
  )
}
