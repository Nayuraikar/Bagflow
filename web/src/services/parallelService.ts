import type { Execution, ParallelJob, ParallelMetrics, ParallelRequest, StaticRow } from '../types/parallel'
import type { WireExecution, WireParallelJob, WireParallelMetrics, WireStaticRow } from '../types/wireParallel'
import { toProgress } from './adapters'
import { postJson, request } from './http'

const path = (id: string) => `/api/parallel-runs/${encodeURIComponent(id)}`

const toExecution = (w: WireExecution): Execution => ({
  backend: w.backend,
  wallMs: w.wall_ms,
  samplesMs: w.samples_ms,
  tasks: w.tasks.map((t) => ({ id: t.id, worker: t.worker, startMs: t.start_ms, endMs: t.end_ms, size: t.size })),
  stages: w.stages.map((s) => ({ name: s.name, parallel: s.parallel, startMs: s.start_ms, endMs: s.end_ms })),
  mergeMs: w.merge_ms,
  workers: w.workers.map((x) => ({ worker: x.worker, tasks: x.tasks, busyMs: x.busy_ms, size: x.size })),
  checksum: w.checksum,
})

const toMetrics = (w: WireParallelMetrics): ParallelMetrics => ({
  id: w.id,
  workload: w.workload,
  backend: w.backend,
  threads: w.threads,
  bags: w.bags,
  requestedBags: w.config.bag_count,
  chunk: w.chunk,
  repetitions: w.repetitions,
  selected: toExecution(w.selected),
  sequential: toExecution(w.sequential),
  speedup: w.speedup,
  resultChecksum: w.result_checksum,
  sequentialChecksum: w.sequential_checksum,
  matchesSequential: w.matches_sequential,
  simd: w.simd && {
    registerBits: w.simd.register_bits, lanes: w.simd.lanes, laneType: w.simd.lane_type,
    bagsPerIteration: w.simd.bags_per_iteration, note: w.simd.note,
  },
  gpu: w.gpu && {
    device: w.gpu.device, copyInMs: w.gpu.copy_in_ms, kernelMs: w.gpu.kernel_ms,
    launchOverheadMs: w.gpu.launch_overhead_ms, copyOutMs: w.gpu.copy_out_ms,
    medianKernelMs: w.gpu.median_kernel_ms, note: w.gpu.note,
  },
  // a sentence for the screen, without the JSON field name one note mentions
  taskNote: w.task_note.charAt(0).toUpperCase() + w.task_note.slice(1).replace(" in 'gpu'", ' shown here'),
  output: w.output,
  machine: { os: w.machine.os, arch: w.machine.arch, logicalCores: w.machine.logical_cores },
  debugBuild: w.debug_build,
})

export const createParallelRun = (r: ParallelRequest) =>
  postJson<{ id: string }>('/api/parallel-runs', {
    workload: r.workload, backend: r.backend, threads: r.threads, bag_count: r.bagCount, repetitions: r.repetitions,
    // JSON leaves out undefined values
    chunk_size: r.chunkSize,
  })

export const getParallelJob = async (id: string): Promise<ParallelJob> => {
  const w = await request<WireParallelJob>(path(id))
  return { id: w.id, status: w.status, error: w.error, progress: w.progress && toProgress(w.progress) }
}

export const getParallelMetrics = async (id: string): Promise<ParallelMetrics> =>
  toMetrics(await request<WireParallelMetrics>(`${path(id)}/metrics`))

export const getStaticResults = async (): Promise<StaticRow[]> =>
  (await request<{ rows: WireStaticRow[] }>('/api/static-results')).rows.map((r) => ({
    machine: r.machine, sourceFile: r.source_file, kind: r.kind, label: r.label, bags: r.bags, statistic: r.statistic,
    timeMs: r.time_ms, speedup: r.speedup, speedupBaseline: r.speedup_baseline,
    copyInMs: r.copy_in_ms, copyOutMs: r.copy_out_ms, ranks: r.ranks, loadMs: r.load_ms, computeMs: r.compute_ms,
    reduceMs: r.reduce_ms, computeSpeedup: r.compute_speedup, endToEndSpeedup: r.end_to_end_speedup,
    outputIdentical: r.output_identical,
  }))
