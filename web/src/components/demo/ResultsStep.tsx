// Gathers the other five steps. A step without a result shows `--` and says so.

import { STEPS, type RunStepId } from '../../config/demo'
import { useDemo } from '../../hooks/demo'
import type { DemoRuns } from '../../hooks/useDemoRuns'
import type { RunMetrics } from '../../types/ops'
import type { ParallelMetrics } from '../../types/parallel'
import { EMPTY, int, msFine, pct, times } from '../../utils/format'
import { range, speedupRange } from '../../utils/spread'
import { NOISE_PCT } from '../../utils/sweep'
import { Card, CardTitle } from '../common/Card'
import { NoiseWarning } from '../common/NoiseWarning'
import { StatusLabel } from '../common/StatusLabel'
import { Table } from '../common/Table'
import { bagsPerSecond, gridBags, millions, parallelPass, speedupText, sweepSpread, type SpeedupSpread } from './figures'

interface Figure {
  key: string
  label: string
  /** `EMPTY` when the step has no result. */
  value: string
  detail: string
}

/** One figure per row, stacked, so the number stays on screen at phone width. */
function Figures({ rows }: { rows: Figure[] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.key} className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[16rem_1fr]">
          <dt className="text-sm font-semibold">{r.label}</dt>
          <dd className="space-y-0.5">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-semibold">{r.value}</span>
              {r.value !== EMPTY && <StatusLabel status="Measured" />}
            </p>
            {r.value !== EMPTY && <p className="text-xs text-muted">{r.detail}</p>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function speedupValue(value: number | undefined, spread: SpeedupSpread | null) {
  if (value === undefined) return EMPTY
  return spread?.repeated && spread.noisy ? speedupText(value, spread).headline : times(value)
}

/** A range whose two ends print the same is shown as one value. */
const timesRange = (min: number, max: number) => (times(min) === times(max) ? times(min) : `${times(min)} – ${times(max)}`)

function speedupDetail(spread: SpeedupSpread | null) {
  if (!spread?.repeated) return 'timed once, no spread'
  return spread.noisy ? 'noisy, so shown as a range' : `range ${times(spread.min)} – ${times(spread.max)}`
}

function parallelSpeedup(key: string, label: string, m: ParallelMetrics | undefined, efficiency: string | null): Figure {
  const spread = m ? speedupRange(m.sequential.samplesMs, m.selected.samplesMs) : null
  return {
    key, label, value: speedupValue(m?.speedup, spread),
    detail: `${int(m?.threads)} threads · ${speedupDetail(spread)}${efficiency ? ` · ${efficiency}` : ''}` +
      (m?.workload === 'generate' && m.threads !== null && spread && spread.max > m.threads
        ? ` · the upper end is above ${m.threads}x because of an unusually slow sequential repetition, not extra scaling`
        : ''),
  }
}

/** Median throughput, with the slowest and fastest repetition. */
function parallelThroughput(key: string, label: string, m: ParallelMetrics | undefined): Figure {
  const r = m && range(m.selected.samplesMs)
  return {
    key, label, value: m ? `${millions(bagsPerSecond(m.bags, m.selected.wallMs))} bags/s` : EMPTY,
    detail: m && r ? `slowest to fastest repetition: ${millions(bagsPerSecond(m.bags, r.max))} – ${millions(bagsPerSecond(m.bags, r.min))}` : '',
  }
}

const OUTCOME_ROWS: [string, (m: RunMetrics | undefined) => string][] = [
  ['Bags', (m) => int(m?.summary.totalBags)],
  ['Delayed', (m) => pct(m?.summary.delayedPct, 3)],
  ['Longest queue', (m) => int(m?.summary.maxQueue)],
  ['Congested (display rule)', (m) => int(m?.summary.congestedFacilities)],
]

export function ResultsStep({ runs, goTo }: { runs: DemoRuns; goTo: (step: number) => void }) {
  const { skipped } = useDemo()
  const gen = runs.workload.metrics.data
  const kernel = runs.kernel.metrics.data
  const sweep = runs.sweep.metrics.data
  const par = sweep && parallelPass(sweep)
  const spread = par ? sweepSpread(runs.sweep.finished, par.threads) : null
  // the ceiling comes from the baseline pipeline, else from the congested run's
  const fromBaseline = runs.simulation.simulation.data?.pipeline
  const pipeline = fromBaseline ?? runs.problem.simulation.data?.pipeline ?? undefined
  const ceilings = fromBaseline ? range(runs.pipelines.map((p) => p.amdahl.maxSpeedup)) : null
  const full = fromBaseline ? range(runs.pipelines.map((p) => p.full.speedup)) : null

  const has: Record<RunStepId, unknown> = {
    problem: runs.problem.metrics.data, workload: gen, kernel, simulation: runs.simulation.metrics.data, sweep,
  }
  const missing = STEPS.flatMap((s, index) => (s.id !== 'results' && !has[s.id] ? [{ id: s.id, title: s.title, index }] : []))

  const sweepValue = speedupValue(par?.speedup, spread?.speedup ?? null)
  const wall = spread?.wall
  const efficiency = (m: ParallelMetrics) => `efficiency ${pct((100 * m.speedup) / m.threads!)}`
  const speedups: Figure[] = [
    parallelSpeedup('gen', 'Dataset generation', gen, gen && gen.threads !== null ? efficiency(gen) : null),
    parallelSpeedup('kernel', `Risk kernel${kernel ? `: ${kernel.backend} vs scalar` : ''}`, kernel, null),
    {
      key: 'pipeline', label: 'One full pipeline',
      value: full && full.count > 1 ? timesRange(full.min, full.max) : times(pipeline?.full.speedup),
      detail: `${int(pipeline?.threads)} threads · ratio of sums of phase times${full && full.count > 1 ? `, over ${full.count} saved runs` : ', one run'}`,
    },
    {
      key: 'sweep', label: 'Experiment sweep (grid)', value: sweepValue,
      detail: `${int(par?.threads)} threads · ${speedupDetail(spread?.speedup ?? null)} · efficiency ${pct(par?.efficiencyPct)} in the sweep shown in step 5`,
    },
  ]
  const throughputs: Figure[] = [
    parallelThroughput('gen', 'Generating bags', gen),
    parallelThroughput('kernel', 'Classifying bags', kernel),
    {
      key: 'sweep', label: 'Simulating bags (sweep)',
      value: par && sweep ? `${millions(bagsPerSecond(gridBags(sweep), par.wallMs))} bags/s` : EMPTY,
      detail: !wall || !sweep
        ? ''
        : wall.walls.length < 2
          ? `one saved sweep, so no spread; wall ${msFine(wall.min)}`
          : `over ${int(wall.walls.length)} saved sweeps: ${millions(bagsPerSecond(gridBags(sweep), wall.max))} – ${millions(bagsPerSecond(gridBags(sweep), wall.min))}; wall ${msFine(wall.min)} to ${msFine(wall.max)}`,
    },
  ]

  const outcomes = [
    { key: 'problem', label: '70% capacity', m: runs.problem.metrics.data },
    { key: 'simulation', label: '100% capacity', m: runs.simulation.metrics.data },
  ]
  const delayed = sweep?.experiments.flatMap((e) => (e.result ? [e] : [])).sort((a, b) => a.result!.delayedPct - b.result!.delayedPct)
  const best = delayed?.[0]
  const worst = delayed?.[delayed.length - 1]

  /** The slowest speedup the saved sweeps support, to compare with the pipeline ceiling. */
  const sweepLow = spread?.speedup?.min ?? par?.speedup
  const ceilingHigh = ceilings?.max ?? pipeline?.amdahl.maxSpeedup

  return (
    <>
      {missing.length > 0 && (
        <NoiseWarning>
          <strong>Some steps have no result, so their cells show {EMPTY}.</strong>{' '}
          {missing.map((p) => (
            <button key={p.id} type="button" onClick={() => goTo(p.index)} className="mr-2 text-perf underline">
              {p.title}{skipped.includes(p.id) ? ' (skipped)' : ''}
            </button>
          ))}
        </NoiseWarning>
      )}

      <Card className="space-y-3">
        <CardTitle>Amdahl’s ceiling, and where parallelism pays off</CardTitle>
        {pipeline ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                In {fromBaseline ? 'the baseline run' : 'the 70% capacity run'}, <strong className="font-mono">{pct(100 * pipeline.amdahl.parallelFraction)}</strong>{' '}
                of the all-sequential time is in phases with a parallel implementation. The <strong>Amdahl ceiling</strong> for one pipeline run is
                therefore <strong className="font-mono">1 / (1 − p) = {times(pipeline.amdahl.maxSpeedup)}</strong>, however many cores are added.
                The measured full-pipeline speedup, a ratio of sums of phase times, was <strong className="font-mono">{times(pipeline.full.speedup)}</strong>.
              </span>
              <StatusLabel status="Measured" />
            </p>
            {ceilings && ceilings.count > 1 && full && times(ceilings.min) === times(ceilings.max) && times(full.min) === times(full.max) && (
              <p className="text-xs text-muted">
                The {ceilings.count} newest saved baseline runs agree to two decimals: ceiling <span className="font-mono">{times(ceilings.max)}</span>,
                full-pipeline speedup <span className="font-mono">{times(full.max)}</span>.
              </p>
            )}
            {ceilings && ceilings.count > 1 && full && !(times(ceilings.min) === times(ceilings.max) && times(full.min) === times(full.max)) && (
              <p className="text-xs text-muted">
                Over the {ceilings.count} newest saved baseline runs the ceiling ranges from <span className="font-mono">{times(ceilings.min)}</span> to{' '}
                <span className="font-mono">{times(ceilings.max)}</span>, and the full-pipeline speedup from <span className="font-mono">{times(full.min)}</span> to{' '}
                <span className="font-mono">{times(full.max)}</span>. Both depend on phase times, so they move between runs.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm">{EMPTY} No simulation result, so the Amdahl ceiling is not measured. Run the Simulation step.</p>
        )}
        <p className="rounded-lg border border-ops/50 bg-ops/10 p-3 text-sm">
          <strong>The sweep is where parallelism pays off.</strong> One pipeline is held back by its sequential simulation. A sweep’s experiments
          are independent, so whole simulations run side by side and the pipeline ceiling does not apply to the grid.{' '}
          {par && sweep ? (
            <>
              Measured here: <strong className="font-mono">{sweepValue}</strong> ({speedupDetail(spread?.speedup ?? null)}) on {par.threads} threads for{' '}
              {int(sweep.experiments.length)} experiments.{' '}
              {sweepLow !== undefined && ceilingHigh !== undefined && (sweepLow > ceilingHigh
                ? 'Even the lowest saved sweep speedup is above the pipeline ceiling.'
                : 'In these saved runs the sweep speedup does not clearly exceed the pipeline ceiling, so measure again before relying on it.')}
            </>
          ) : (
            <>{EMPTY} No sweep result, so there is no measured gain to show. Run the Experiment sweep step.</>
          )}
        </p>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Speedup and efficiency</CardTitle>
        <Figures rows={speedups} />
        <p className="text-xs text-muted">
          The rows have different baselines and workloads, so do not add or multiply them. Ranges wider than {NOISE_PCT}% are marked noisy. The
          kernel has no efficiency figure because its speedup can include vector instructions.
        </p>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Throughput</CardTitle>
        <Figures rows={throughputs} />
      </Card>

      <Card className="space-y-3">
        <CardTitle aside={<StatusLabel status="Real" />}>Operational outcomes</CardTitle>
        <Table
          minWidth="18rem"
          head={['Measure', ...outcomes.map((o) => o.label)]}
          rows={OUTCOME_ROWS.map(([label, show]) => ({ key: label, cells: [label, ...outcomes.map((o) => show(o.m))] }))}
        />
        <p className="text-xs text-muted">
          The two runs also use different routing (congestion at 70%, dijkstra at 100%), so the difference is not the effect of capacity alone.
        </p>
        {best && worst ? (
          <p className="text-sm">
            Across the sweep’s experiments, delayed bags range from <strong className="font-mono">{pct(best.result!.delayedPct, 3)}</strong> (
            {best.scenario} · {best.routing} · {best.policy}) to <strong className="font-mono">{pct(worst.result!.delayedPct, 3)}</strong> (
            {worst.scenario} · {worst.routing} · {worst.policy}). Several experiments may tie, and these use {int(sweep!.config.bagCount)} bags, so do not
            compare them with the table above.
            {worst.result!.delayedPct < 1 && ' Here even the worst experiment delays under 1% of bags: at this bag count and full server counts the network is lightly loaded, so these experiments show the wall-time gain more than operational differences.'}
          </p>
        ) : (
          <p className="text-sm text-muted">{EMPTY} Best and worst experiments need the sweep.</p>
        )}
      </Card>
    </>
  )
}
