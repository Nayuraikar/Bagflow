import { RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useBaselineJob } from '../../hooks/jobContext'
import { useApiState } from '../../hooks/useHealth'
import type { SimulationRun } from '../../types/models'
import { submitMessage } from '../../utils/submitMessage'

/** Submits a saved run's settings again and follows it in the Scenario Studio. */
export function RerunButton({ run }: { run: SimulationRun }) {
  const job = useBaselineJob()
  const navigate = useNavigate()
  const offline = useApiState() !== 'online'
  const busy = job.submitting || job.activeId !== null
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button" disabled={busy || offline}
        onClick={() => job.submit(run.config, (id) => void navigate(`/experiments/scenarios?job=${id}`))}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ops px-3 py-1 text-sm text-ops disabled:opacity-50"
      >
        <RotateCcw size={13} aria-hidden /> Run these settings again
      </button>
      {job.activeId !== null && <span className="text-xs text-muted">Another simulation is in progress.</span>}
      {job.submitError && <span role="alert" className="text-xs text-critical">{submitMessage(job.submitError)}</span>}
    </span>
  )
}
