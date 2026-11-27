// Values computed only from recorded task times, and the rules for what each backend can show.

import type { Execution, ParallelMetrics, Task } from '../types/parallel'

export const isGpuBackend = (id: string) => id === 'metal' || id.startsWith('cuda')
export const takesThreads = (id: string) => id === 'openmp' || id === 'rayon' || id.startsWith('rayon-')

export type BackendFamily = 'single' | 'threads' | 'simd' | 'threads-simd' | 'gpu'

export function backendFamily(id: string): BackendFamily {
  if (isGpuBackend(id)) return 'gpu'
  if (id === 'neon' || id === 'avx2') return 'simd'
  if (id === 'rayon-neon' || id === 'rayon-avx2') return 'threads-simd'
  return takesThreads(id) ? 'threads' : 'single'
}

/** Most tasks running at the same instant. */
export function maxConcurrent(tasks: Task[]) {
  const edges = tasks.flatMap((t) => [[t.startMs, 1], [t.endMs, -1]])
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let now = 0
  let max = 0
  for (const [, d] of edges) max = Math.max(max, (now += d))
  return max
}

export const busyMs = (e: Execution) => e.workers.reduce((sum, w) => sum + w.busyMs, 0)

export const isMergeStage = (name: string) => name === 'merge' || name === 'append'

export const checksumsMatch = (m: ParallelMetrics) => m.matchesSequential && m.resultChecksum === m.sequentialChecksum
