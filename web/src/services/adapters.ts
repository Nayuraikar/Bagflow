// Pure mapping from the Rust JSON to the UI models.

import type { Health, JobProgress, Pipeline, PipelinePhase, Run, Simulation, SimulationConfig, SimulationSummary } from '../types/models'
import type { WireHealth, WireHistoryItem, WirePhase, WirePipeline, WireProgress, WireSimConfig, WireSimSummary, WireSimulation } from '../types/wire'

const toMachine = (m: WireHealth['machine']) => ({ os: m.os, arch: m.arch, logicalCores: m.logical_cores })

export const toHealth = (w: WireHealth): Health => ({
  version: w.version,
  engine: w.engine,
  debugBuild: w.debug_build,
  machine: toMachine(w.machine),
  backends: w.backends.map(({ id, available, detail, reason, gpu }) => ({ id, available, detail, reason, gpu })),
  queue: { runningJobId: w.queue.running, queued: w.queue.queued, maxQueued: w.queue.max_queued },
  lastSimulation: w.last_simulation && { id: w.last_simulation.id, finishedAt: w.last_simulation.finished_at_ms },
})

export const toProgress = (w: WireProgress): JobProgress => ({
  status: w.status, phase: w.phase, done: w.done, total: w.total, error: w.error,
})

const toSimConfig = (w: WireSimConfig): SimulationConfig => ({
  scenario: w.scenario, routing: w.routing, policy: w.policy,
  capacityPct: w.capacity_pct, serverMultiplier: w.server_multiplier, bagCount: w.bag_count,
})

export const fromSimConfig = (c: SimulationConfig): WireSimConfig => ({
  scenario: c.scenario, routing: c.routing, policy: c.policy,
  capacity_pct: c.capacityPct, server_multiplier: c.serverMultiplier, bag_count: c.bagCount,
})

const toSummary = (w: WireSimSummary): SimulationSummary => ({
  totalBags: w.total_bags,
  loadedOnTime: w.loaded_on_time,
  delayedBags: w.delayed_bags,
  delayedPct: w.delayed_pct,
  onTimeLoadingRate: w.on_time_loading_rate,
  congestedFacilities: w.congested_facilities,
})

export function toRun(w: WireHistoryItem): Run {
  const base = { id: w.id, status: w.status, createdAt: w.created_at_ms, finishedAt: w.finished_at_ms, error: w.error }
  switch (w.kind) {
    case 'simulation':
      return { ...base, kind: w.kind, config: toSimConfig(w.config), summary: w.summary && toSummary(w.summary) }
    case 'sweep':
      return {
        ...base, kind: w.kind, bagCount: w.config.bag_count,
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
  comparison:
    w.baseline && w.speedup !== null && w.identical_to_baseline !== null
      ? { sequentialBackend: w.baseline.backend, sequentialMs: w.baseline.time_ms, speedup: w.speedup, identical: w.identical_to_baseline }
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

export const toSimulation = (w: WireSimulation): Simulation => ({
  id: w.id,
  status: w.status,
  finishedAt: w.finished_at_ms,
  config: toSimConfig(w.config),
  classifyBackend: w.config.classify_backend ?? null,
  engineChecksum: w.engine_checksum,
  summary: w.summary && toSummary(w.summary),
  pipeline: w.pipeline && toPipeline(w.pipeline),
  progress: w.progress && toProgress(w.progress),
  error: w.error,
})
