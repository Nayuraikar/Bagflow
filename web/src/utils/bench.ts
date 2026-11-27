import type { BenchRequest, BenchRow } from '../types/bench'
import type { Health } from '../types/models'
import { EMPTY, int } from './format'

export const rowKey = (r: BenchRow) => `${r.backend}-${r.threads ?? 'gpu'}`
export const rowLabel = (r: BenchRow) => (r.threads === null ? r.backend : `${r.backend} × ${r.threads}`)

/** The row with the shortest median time. */
export const fastest = (rows: BenchRow[]) => rows.reduce((a, b) => (b.timeMs.median < a.timeMs.median ? b : a))

/** How far apart the repetitions were, as a share of the median. */
export const spreadPct = (r: BenchRow) => (100 * (r.timeMs.max - r.timeMs.min)) / r.timeMs.median

export interface BenchFormState {
  backends: string[]
  threads: string
  bagCount: string
  repetitions: string
  warmup: string
}

export const toBenchRequest = (f: BenchFormState): BenchRequest => ({
  backends: f.backends,
  threads: [...new Set(f.threads.split(/[\s,]+/).filter(Boolean).map(Number))],
  bagCount: Number(f.bagCount),
  repetitions: Number(f.repetitions),
  warmup: f.warmup.trim() === '' ? NaN : Number(f.warmup),
})

export function benchProblems(r: BenchRequest, limits: Health['benchmark']): string[] {
  const out: string[] = []
  const check = (name: string, v: number, [lo, hi]: [number, number]) => {
    if (!(Number.isInteger(v) && v >= lo && v <= hi)) out.push(`${name}: whole numbers from ${int(lo)} to ${int(hi)}.`)
  }
  if (!r.backends.length) out.push('Choose at least one backend.')
  check('Bags', r.bagCount, limits.bagCount)
  check('Repetitions', r.repetitions, limits.repetitions)
  check('Warm-up', r.warmup, limits.warmup)
  if (!r.threads.length) out.push('List at least one thread count.')
  for (const t of r.threads) check('Thread counts', t, limits.threads)
  return [...new Set(out)]
}

export const throughput = (bagsPerS: number | undefined) => (bagsPerS === undefined ? EMPTY : `${int(Math.round(bagsPerS / 1e6))} M/s`)
