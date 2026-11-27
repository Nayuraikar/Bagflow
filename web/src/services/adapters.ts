// Pure mapping from the Rust JSON to the UI models.

import type { Health, JobProgress, Operational, Pipeline, PipelinePhase, Run, Simulation, SimulationConfig, SimulationSummary } from '../types/models'
import type { SweepRequest } from '../types/sweep'
import type { WireSweepConfig } from '../types/wireSweep'
import type { WireHealth, WireHistoryItem, WireOperational, WirePhase, WirePipeline, WireProgress, WireSimConfig, WireSimSummary, WireSimulation } from '../types/wire'

export const toSweepRequest = (w: WireSweepConfig): SweepRequest => ({
  scenarios: w.scenarios, routings: w.routings, policies: w.policies, capacityPcts: w.capacity_pcts,
  serverMultiplier: w.server_multiplier, bagCount: w.bag_count, threads: w.threads,
})

const toMachine = (m: WireHealth['machine']) => ({ os: m.os, arch: m.arch, logicalCores: m.logical_cores })

export const toHealth = (w: WireHealth): Health => ({
  version: w.version,
  engine: w.engine,
  debugBuild: w.debug_build,
  machine: toMachine(w.machine),
  backends: w.backends.map(({ id, available, detail, reason, gpu }) => ({ id, available, detail, reason, gpu })),
  queue: { runningJobId: w.queue.running, queued: w.queue.queued, maxQueued: w.queue.max_queued },
  lastSimulation: w.last_simulation && { id: w.last_simulation.id, finishedAt: w.last_simulation.finished_at_ms },
  simulation: {
    bagCount: w.options.simulation_limits.bag_count,
    capacityPct: w.options.simulation_limits.capacity_pct,
    serverMultiplier: w.options.simulation_limits.server_multiplier,
    threads: w.options.simulation_limits.threads,
  },
  simulationDefaults: toSimConfig(w.options.simulation_defaults),
  sweep: {
    scenarios: w.options.scenarios,
    routings: w.options.routings,
    policies: w.options.policies,
    defaults: toSweepRequest(w.options.sweep_defaults),
    bagCount: w.options.sweep_limits.bag_count,
    capacityPct: w.options.sweep_limits.capacity_pct,
    serverMultiplier: w.options.sweep_limits.server_multiplier,
    threads: w.options.sweep_limits.threads,
    maxThreadCounts: w.options.sweep_limits.max_thread_counts,
    maxExperiments: w.options.sweep_limits.max_experiments,
    maxSimulatedBags: w.options.sweep_limits.max_simulated_bags,
  },
  benchmark: {
    bagCount: w.options.benchmark_limits.bag_count,
    repetitions: w.options.benchmark_limits.repetitions,
    warmup: w.options.benchmark_limits.warmup,
    threads: w.options.benchmark_limits.threads,
  },
  parallel: {
    workloads: w.options.parallel_workloads.map((x) => ({ id: x.id, backends: x.backends, chunkUnit: x.chunk_unit })),
    bagCount: w.options.parallel_limits.bag_count,
    aggregateBagCount: w.options.parallel_limits.aggregate_bag_count,
    repetitions: w.options.parallel_limits.repetitions,
    threads: w.options.parallel_limits.threads,
  },
})

export const toProgress = (w: WireProgress): JobProgress => ({
  status: w.status, phase: w.phase, done: w.done, total: w.total, error: w.error,
})

const toSimConfig = (w: WireSimConfig): SimulationConfig => ({
  threads: w.threads, classifyBackend: w.classify_backend,
  operationalParallel: w.operational_parallel, workers: w.workers,
  scenario: w.scenario, routing: w.routing, policy: w.policy,
  capacityPct: w.capacity_pct, serverMultiplier: w.server_multiplier, bagCount: w.bag_count,
})

export const fromSimConfig = (c: SimulationConfig): WireSimConfig => ({
  scenario: c.scenario, routing: c.routing, policy: c.policy,
  capacity_pct: c.capacityPct, server_multiplier: c.serverMultiplier, bag_count: c.bagCount,
  // JSON leaves out undefined values
  threads: c.threads, classify_backend: c.classifyBackend,
  operational_parallel: c.operationalParallel, workers: c.workers,
})

export const toSummary = (w: WireSimSummary): SimulationSummary => ({
  totalBags: w.total_bags,
  loadedOnTime: w.loaded_on_time,
  delayedBags: w.delayed_bags,
  delayedPct: w.delayed_pct,
  onTimeLoadingRate: w.on_time_loading_rate,
  congestedFacilities: w.congested_facilities,
})

export function toRun(w: WireHistoryItem): Run {
  const base = {
    id: w.id, status: w.status, createdAt: w.created_at_ms, finishedAt: w.finished_at_ms, error: w.error, retained: w.retained,
  }
  switch (w.kind) {
    case 'simulation':
      return { ...base, kind: w.kind, config: toSimConfig(w.config), summary: w.summary && toSummary(w.summary) }
    case 'sweep':
      return {
        ...base, kind: w.kind, configHash: w.config_hash, bagCount: w.config.bag_count, config: toSweepRequest(w.config),
        summary: w.summary && {
          experimentCount: w.summary.experiment_count,
          passes: w.summary.passes.map((p) => ({ threads: p.threads, wallMs: p.wall_ms, speedup: p.speedup })),
          consistency: {
            checked: w.summary.consistency.checked,
            comparedRuns: w.summary.consistency.compared_runs,
            allIdentical: w.summary.consistency.all_identical,
          },
        },
      }
    case 'parallel':
      return {
        ...base, kind: w.kind, workload: w.config.workload, bagCount: w.config.bag_count,
        request: { backend: w.config.backend, threads: w.config.threads, repetitions: w.config.repetitions, chunkSize: w.config.chunk_size },
        summary: w.summary && {
          workload: w.summary.workload, backend: w.summary.backend, threads: w.summary.threads, bags: w.summary.bags,
          wallMs: w.summary.wall_ms, speedup: w.summary.speedup, matchesSequential: w.summary.matches_sequential,
        },
      }
    case 'benchmark':
      return {
        ...base, kind: w.kind, backends: w.config.backends, bagCount: w.config.bag_count,
        summary: w.summary && {
          workloadSize: w.summary.workload_size,
          results: w.summary.results.map((r) => ({
            backend: r.backend, threads: r.threads, medianMs: r.median_ms, speedup: r.speedup,
            identical: r.output_identical_to_scalar,
          })),
        },
      }
  }
}

const toPhase = (w: WirePhase): PipelinePhase => ({
  id: w.id,
  name: w.name,
  backend: w.backend,
  threads: w.threads,
  bags: w.bags,
  timeMs: w.time_ms,
  repetitions: w.samples_ms.length,
  samplesMs: w.samples_ms,
  comparison:
    w.baseline && w.speedup !== null && w.identical_to_baseline !== null
      ? { sequentialBackend: w.baseline.backend, sequentialMs: w.baseline.time_ms, sequentialSamplesMs: w.baseline.samples_ms, speedup: w.speedup, identical: w.identical_to_baseline }
      : null,
  whySequential: w.why_sequential ?? null,
  verifiedAgainstEngine: w.verified_against_engine ?? null,
})

const toPipeline = (w: WirePipeline): Pipeline => ({
  threads: w.threads,
  machine: toMachine(w.machine),
  debugBuild: w.debug_build,
  bagsGenerated: w.workload.bags_generated,
  bagsSimulated: w.workload.bags_simulated,
  phases: w.phases.map(toPhase),
  otherSequentialMs: w.other_sequential.time_ms,
  full: { baselineMs: w.full.baseline_ms, parallelMs: w.full.parallel_ms, speedup: w.full.speedup },
  amdahl: {
    parallelFraction: w.amdahl.parallelisable_fraction,
    sequentialFraction: w.amdahl.sequential_fraction,
    maxSpeedup: w.amdahl.max_speedup,
    eligibleSpeedup: w.amdahl.eligible_phases_speedup,
  },
})

const toOperational = (w: WireOperational): Operational => ({
  enabled: w.enabled,
  desMs: w.des_ms,
  totalMs: w.total_ms,
  routesPrecomputable: w.routes_precomputable,
  routesNote: w.routes_note,
  workers: w.workers ?? null,
  routesPrecomputed: w.routes_precomputed ?? false,
  parallelParts: w.parallel_parts ?? [],
  precompute: w.precompute ? {
    sequentialMs: w.precompute.sequential_ms, parallelMs: w.precompute.parallel_ms, speedup: w.precompute.speedup,
    efficiency: w.precompute.efficiency, identical: w.precompute.identical_to_sequential,
  } : null,
  tasks: (w.tasks ?? []).map((t) => ({ id: t.id, kind: t.kind, worker: t.worker, startMs: t.start_ms, endMs: t.end_ms, size: t.size })),
})

export const toSimulation = (w: WireSimulation): Simulation => ({
  id: w.id,
  status: w.status,
  finishedAt: w.finished_at_ms,
  config: toSimConfig(w.config),
  classifyBackend: w.config.classify_backend ?? null,
  engineChecksum: w.engine_checksum,
  summary: w.summary && toSummary(w.summary),
  pipeline: w.pipeline && toPipeline(w.pipeline),
  operational: w.operational ? toOperational(w.operational) : null,
  progress: w.progress && toProgress(w.progress),
  error: w.error,
})
