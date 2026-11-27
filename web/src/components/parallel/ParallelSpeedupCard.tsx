import type { ParallelMetrics } from '../../types/parallel'
import { int, msFine, times } from '../../utils/format'
import { speedupRange } from '../../utils/spread'
import { busyMs, maxConcurrent } from '../../utils/telemetry'
import { Card, CardTitle } from '../common/Card'
import { NoiseWarning } from '../common/NoiseWarning'
import { StatusLabel } from '../common/StatusLabel'
import { Stat } from './Stat'

function Samples({ label, samples }: { label: string; samples: number[] }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">{label} timed repetitions:</span>
      <span className="font-mono">{samples.map(msFine).join(' · ')}</span>
      <StatusLabel status="Measured" />
    </p>
  )
}

/** Only says what this run's own numbers show. */
function Why({ m }: { m: ParallelMetrics }) {
  const lines: string[] = []
  const { selected: s, sequential, gpu } = m
  if (gpu) {
    const outside = gpu.copyInMs + gpu.launchOverheadMs + gpu.copyOutMs
    if (m.speedup < 1) {
      if (gpu.kernelMs < sequential.wallMs && outside > gpu.kernelMs) {
        lines.push(
          `Here ${m.backend} was slower than scalar. Its kernel alone (${msFine(gpu.kernelMs)}) took less than the scalar run (${msFine(sequential.wallMs)}), ` +
          `but copies, launch and wait added ${msFine(outside)}. At this size that overhead outweighs the faster kernel.`,
        )
      } else {
        lines.push(`Here ${m.backend} was slower than scalar. Compare the phase times below with the scalar wall time.`)
      }
    } else if (m.speedup > 1) {
      lines.push(`Here ${m.backend} was faster than scalar even counting copies, launch and wait (${msFine(outside)}).`)
    }
  } else if (s.workers.length > 1) {
    lines.push(
      `Up to ${maxConcurrent(s.tasks)} recorded tasks ran at the same instant on ${s.workers.length} threads: ` +
      `${msFine(busyMs(s))} of task time inside ${msFine(s.wallMs)} of wall time.`,
    )
    if (s.mergeMs !== null) lines.push(`Combining the partial results took ${msFine(s.mergeMs)} on one thread; that part does not shrink with more threads.`)
    if (s.stages.some((x) => x.parallel && x.name !== 'generate_bags')) {
      lines.push('Some parallel stages have no per-task records, so they are not counted in the task figures.')
    }
  } else if (m.simd) {
    lines.push(`One thread ran every chunk. Any difference from scalar is not from concurrency; this backend processes ${m.simd.lanes} values per instruction.`)
  } else {
    lines.push('One thread ran every chunk, so any difference from the sequential run is not from concurrency.')
  }
  if (!gpu && m.speedup < 1) lines.push('This run was slower than the sequential one.')
  if (lines.length === 0) return null
  return (
    <div className="rounded-lg bg-bg p-3 text-sm">
      <p className="mb-1 flex flex-wrap items-center gap-2 font-semibold">What this run shows <StatusLabel status="Measured" /></p>
      {lines.map((l) => <p key={l}>{l}</p>)}
    </div>
  )
}

function SpeedupSpread({ m }: { m: ParallelMetrics }) {
  const r = speedupRange(m.sequential.samplesMs, m.selected.samplesMs)
  if (!r) return null
  if (!r.repeated) return <NoiseWarning>One repetition per side, so there is no spread to show. Treat this speedup as a single sample.</NoiseWarning>
  const text = <>Pairing the shortest and longest repetitions gives a speedup from <span className="font-mono">{times(r.min)}</span> to <span className="font-mono">{times(r.max)}</span>.</>
  return r.noisy
    ? <NoiseWarning><strong>Noisy timings.</strong> {text} Do not read the median speedup as exact.</NoiseWarning>
    : <p className="text-sm text-muted">{text}</p>
}

export function ParallelSpeedupCard({ m }: { m: ParallelMetrics }) {
  return (
    <Card className="space-y-3">
      <CardTitle>Sequential vs selected</CardTitle>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label={`Sequential baseline: ${m.sequential.backend}, 1 thread`} value={msFine(m.sequential.wallMs)} />
        <Stat
          label={`${m.backend}${m.threads === null ? '' : `, ${m.threads} thread${m.threads === 1 ? '' : 's'}`}`}
          value={msFine(m.selected.wallMs)}
        />
        <Stat label="Speedup (sequential ÷ selected)" value={times(m.speedup)} />
      </dl>
      <SpeedupSpread m={m} />
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          Same input ({int(m.bags)} bags). {int(m.repetitions)} timed repetitions per side, alternating, after one warm-up each. Each wall time is
          the median repetition (the lower middle one for an even count).
        </span>
        <StatusLabel status="Measured" />
      </p>
      <Samples label="Sequential" samples={m.sequential.samplesMs} />
      <Samples label={m.backend} samples={m.selected.samplesMs} />
      <Why m={m} />
    </Card>
  )
}
