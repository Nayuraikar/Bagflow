// Values computed only from what the API measured.

import type { SweepMetrics, SweepPass } from '../../types/sweep'
import type { SweepRun } from '../../types/models'
import { fixed, times } from '../../utils/format'
import { NOISE_PCT, repeatSpread } from '../../utils/sweep'
import { range } from '../../utils/spread'

export const bagsPerSecond = (bags: number, wallMs: number) => (1000 * bags) / wallMs

export const millions = (v: number | null | undefined) => (v === null || v === undefined ? '--' : `${fixed(v / 1e6, v >= 1e8 ? 0 : 2)} M`)

export const parallelPass = (m: SweepMetrics): SweepPass | undefined => m.passes.find((p) => !p.isBaseline)

/** Bags simulated by the whole grid, once. */
export const gridBags = (m: SweepMetrics) => m.experiments.reduce((sum, e) => sum + (e.result?.bagsSimulated ?? 0), 0)

/** How one thread count behaved over every saved sweep with the same settings. */
export function sweepSpread(repeats: SweepRun[], threads: number) {
  const passes = repeats.flatMap((r) => r.summary?.passes.filter((p) => p.threads === threads) ?? [])
  const speedup = range(passes.map((p) => p.speedup))
  const walls = repeatSpread(repeats)
  const wall = walls.find((w) => w.threads === threads)
  return {
    speedup: speedup && {
      min: speedup.min,
      max: speedup.max,
      repeated: speedup.count > 1,
      noisy: speedup.count > 1 && (100 * (speedup.max - speedup.min)) / speedup.min > NOISE_PCT,
    },
    wall,
    noisyWalls: walls.filter((w) => w.noisy),
    sweeps: repeats.length,
  }
}

export interface SpeedupSpread {
  min: number
  max: number
  repeated: boolean
  noisy: boolean
}

/** A speedup with its spread. When the timings are noisy the range is the headline, not one value. */
export function speedupText(value: number, spread: SpeedupSpread | null) {
  if (!spread?.repeated) return { headline: times(value), note: 'Timed once, so there is no spread. Treat it as one sample.' }
  const range = `${times(spread.min)} – ${times(spread.max)}`
  return spread.noisy
    ? { headline: range, note: `Noisy, so shown as a range. The headline run gave ${times(value)}.` }
    : { headline: times(value), note: `Range over the repetitions: ${range}.` }
}
