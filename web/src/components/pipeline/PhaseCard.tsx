import type { PipelinePhase } from '../../types/models'
import { int, ms, times } from '../../utils/format'
import { Card } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'
import { PHASE_COLOR, phaseMethod } from './phaseStyle'

/** Bar lengths compare the two times of this phase only, not different phases. */
function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono">{ms(value)}</span>
      </div>
      <div className="h-2 rounded bg-line">
        <div className="h-2 rounded" style={{ width: `${(100 * value) / max}%`, background: color }} />
      </div>
    </div>
  )
}

export function PhaseCard({ phase, step }: { phase: PipelinePhase; step: number }) {
  const c = phase.comparison
  const color = PHASE_COLOR[phase.id]
  const max = Math.max(phase.timeMs, c?.sequentialMs ?? 0)
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
          {step}. {phase.name}
        </h3>
        <p className="text-xs text-muted">{phaseMethod(phase)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xl font-semibold">{ms(phase.timeMs)}</span>
        <StatusLabel status="Measured" />
      </div>
      {c ? (
        <>
          <Bar label={`Baseline: ${c.sequentialBackend}, 1 thread`} value={c.sequentialMs} max={max} color="#9aa5b5" />
          <Bar
            label={`${phase.backend}${phase.threads === null ? '' : `, ${phase.threads} thread${phase.threads === 1 ? '' : 's'}`}`}
            value={phase.timeMs} max={max} color={color}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span><strong className="font-mono">{times(c.speedup)}</strong> speedup in this phase</span>
            <StatusLabel status="Measured" />
          </div>
          <p className="text-xs text-muted">
            Median of {phase.repetitions} repetitions each, {int(phase.bags)} bags.{' '}
            {c.identical ? 'Output identical to the sequential one.' : 'Output differs from the sequential one.'}
            {phase.verifiedAgainstEngine && ' Also matches the engine’s own totals.'}
            {phase.id === 'classify' && ' This is a batch analysis; the simulation does not use its output.'}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted">
          No parallel implementation, so no speedup. One run, {int(phase.bags)} bags.
          {phase.whySequential && ` Why: ${phase.whySequential}.`}
        </p>
      )}
    </Card>
  )
}
