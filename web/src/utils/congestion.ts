import type { NodeSeries } from '../types/ops'

/**
 * At most `points` points from a series, each the highest sample of its stretch, so that peaks are
 * not lost when a long run is drawn.
 */
export function peakBuckets(times: number[], values: number[], points = 240) {
  const size = Math.max(1, Math.ceil(times.length / points))
  const out: { t: number; v: number }[] = []
  for (let i = 0; i < times.length; i += size) {
    out.push({ t: times[i], v: Math.max(...values.slice(i, i + size)) })
  }
  return out
}

export const FLOW_BIN_MS = 15 * 60 * 1000

/** Bags arriving at and leaving a facility per bin, from the cumulative series. */
export function flowBins(times: number[], s: NodeSeries) {
  const out: { t: number; incoming: number; outgoing: number }[] = []
  let arrived = 0
  let done = 0
  let bin = Math.floor(times[0] / FLOW_BIN_MS)
  for (let i = 0; i < times.length; i++) {
    const next = i + 1 < times.length ? Math.floor(times[i + 1] / FLOW_BIN_MS) : Infinity
    if (next !== bin) {
      out.push({ t: bin * FLOW_BIN_MS, incoming: s.arrivals[i] - arrived, outgoing: s.completions[i] - done })
      arrived = s.arrivals[i]
      done = s.completions[i]
      bin = next
    }
  }
  return out
}

const bound = (ms: number) => (ms < 60_000 ? `${ms / 1000} s` : `${ms / 60_000} min`)

/** Labels for the wait histogram: one bin per bound, and one above the last bound. */
export function waitLabels(boundsMs: number[]) {
  return [
    ...boundsMs.map((b, i) => (i === 0 ? (b === 0 ? 'no wait' : `up to ${bound(b)}`) : `${bound(boundsMs[i - 1])} – ${bound(b)}`)),
    `over ${bound(boundsMs[boundsMs.length - 1])}`,
  ]
}
