import type { BenchMetrics, BenchRequest } from '../types/bench'
import type { ParallelJob } from '../types/parallel'
import type { WireBenchMetrics } from '../types/wireBench'
import type { WireParallelJob } from '../types/wireParallel'
import { toProgress } from './adapters'
import { postJson, request } from './http'

const path = (id: string) => `/api/benchmarks/${encodeURIComponent(id)}`

export const createBenchmark = (r: BenchRequest) =>
  postJson<{ id: string }>('/api/benchmarks', {
    bag_count: r.bagCount, backends: r.backends, threads: r.threads, repetitions: r.repetitions, warmup: r.warmup,
  })

// every job record has the same shape
export const getBenchJob = async (id: string): Promise<ParallelJob> => {
  const w = await request<WireParallelJob>(path(id))
  return { id: w.id, status: w.status, error: w.error, progress: w.progress && toProgress(w.progress) }
}

export const getBenchMetrics = async (id: string): Promise<BenchMetrics> => {
  const w = await request<WireBenchMetrics>(`${path(id)}/metrics`)
  return {
    id: w.id,
    workloadSize: w.workload_size,
    repetitions: w.repetitions,
    warmup: w.warmup,
    machine: { os: w.machine.os, arch: w.machine.arch, logicalCores: w.machine.logical_cores },
    debugBuild: w.debug_build,
    dataFootprintBytes: w.data_footprint_bytes_computed,
    definitions: w.definitions,
    rows: w.results.map((r) => ({
      backend: r.backend, threads: r.threads, requested: r.requested, identical: r.output_identical_to_scalar,
      timeMs: r.time_ms, throughputBagsPerS: r.throughput_bags_per_s, speedup: r.speedup,
      efficiencyPct: r.parallel_efficiency_pct, efficiencyBaseline: r.efficiency_baseline,
      gpu: r.gpu && {
        device: r.gpu.device, copyInMs: r.gpu.copy_in_ms.median, kernelMs: r.gpu.kernel_ms.median,
        launchOverheadMs: r.gpu.launch_overhead_ms.median, copyOutMs: r.gpu.copy_out_ms.median,
        kernelOnlySpeedup: r.gpu.kernel_only_speedup, note: r.gpu.note,
      },
      memoryBytes: r.memory_usage_bytes,
    })),
  }
}
