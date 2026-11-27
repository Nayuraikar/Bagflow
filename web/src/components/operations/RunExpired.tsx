import { RerunButton } from '../experiments/RerunButton'
import { Card } from '../common/Card'
import type { SimulationRun } from '../../types/models'
import { EMPTY } from '../../utils/format'

/** The run's summary is saved, but its bag histories and time-series are gone. */
export function RunExpired({ run, what }: { run: SimulationRun; what: string }) {
  return (
    <Card className="space-y-2 text-sm">
      <p><strong>{EMPTY} This run’s detailed data has expired.</strong></p>
      <p>
        {what} need bag histories and time-series, which the API keeps for the 3 most recent simulations only, in memory. The saved summary
        and facility totals remain. Running the same settings again recomputes the data under a new run id.
      </p>
      <RerunButton run={run} />
    </Card>
  )
}
