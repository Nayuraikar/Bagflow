import { useStaticResults } from '../../hooks/useParallelExecution'
import { int } from '../../utils/format'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'
import { StaticResults } from '../parallel/StaticResults'

/** Every saved result, one table per machine and file. No chart mixes them with anything. */
export function SavedResults() {
  const machines = [...new Set(useStaticResults().data?.map((r) => r.machine) ?? [])]
  return (
    <Card>
      <CardTitle aside={<StatusLabel status="Static" />}>Saved results from earlier runs</CardTitle>
      <p className="mb-3 text-sm text-muted">
        Measured earlier, not by this server{machines.length ? `, on ${int(machines.length)} different machine descriptions` : ''}. Each table names its
        machine, size and file. Compare rows inside one table only: sizes and statistics differ from the live runs.
      </p>
      <StaticResults keep={() => true} />
    </Card>
  )
}
