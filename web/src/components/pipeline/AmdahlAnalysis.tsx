import type { Pipeline } from '../../types/models'
import { pct, times } from '../../utils/format'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'

function Figure({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <h3 className="text-sm text-muted">{title}</h3>
      <p className="my-1 font-mono text-3xl font-semibold">{value}</p>
      <StatusLabel status="Measured" />
      <p className="mt-2 text-xs text-muted">{note}</p>
    </div>
  )
}

export function AmdahlAnalysis({ pipeline }: { pipeline: Pipeline }) {
  const a = pipeline.amdahl
  return (
    <Card>
      <CardTitle>Amdahl’s law: why the whole pipeline gains so little</CardTitle>
      <div className="grid gap-3 md:grid-cols-3">
        <Figure
          title="Parallelisable fraction p"
          value={pct(100 * a.parallelFraction)}
          note="Share of this run’s all-sequential sum spent in phases that have a parallel implementation. An upper bound, because generation keeps some serial steps."
        />
        <Figure
          title="Amdahl ceiling, 1 / (1 − p)"
          value={times(a.maxSpeedup)}
          note="Computed from p of this run: the limit even if those phases took no time at all."
        />
        <Figure
          title="Measured full-pipeline speedup"
          value={times(pipeline.full.speedup)}
          note="Ratio of the two sums of phase times. A sum of phase times, not an end-to-end timing."
        />
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span>
          The eligible phases together run <strong className="font-mono">{times(a.eligibleSpeedup)}</strong> faster, but the other{' '}
          <strong className="font-mono">{pct(100 * a.sequentialFraction)}</strong> of the time stays sequential.
        </span>
        <StatusLabel status="Measured" />
      </p>
    </Card>
  )
}
