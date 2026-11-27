// How far apart the measured repetitions were. Nothing here is estimated: every bound comes from
// repetitions that were actually timed.

import { NOISE_PCT } from './sweep'

export interface Range {
  min: number
  max: number
  count: number
}

/** `null` when there is nothing to take a range of. */
export function range(values: number[]): Range | null {
  return values.length ? { min: Math.min(...values), max: Math.max(...values), count: values.length } : null
}

/** (longest − shortest) ÷ shortest, in percent. `null` with fewer than two values. */
export const spreadOf = (r: Range | null) => (r && r.count > 1 && r.min > 0 ? (100 * (r.max - r.min)) / r.min : null)

export const isNoisy = (r: Range | null) => (spreadOf(r) ?? 0) > NOISE_PCT

/**
 * The widest speedup range the repetitions allow: shortest sequential over longest selected, up to
 * longest sequential over shortest selected.
 */
export function speedupRange(sequentialMs: number[], selectedMs: number[]) {
  const seq = range(sequentialMs)
  const sel = range(selectedMs)
  if (!seq || !sel || sel.min <= 0) return null
  return {
    min: seq.min / sel.max,
    max: seq.max / sel.min,
    /** A single repetition per side gives no spread at all. */
    repeated: seq.count > 1 && sel.count > 1,
    noisy: isNoisy(seq) || isNoisy(sel),
  }
}
