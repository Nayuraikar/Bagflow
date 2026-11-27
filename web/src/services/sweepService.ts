import type { ExperimentRun, SweepJob, SweepMetrics, SweepRequest } from '../types/sweep'
import type { WireExperimentRun, WireSweepJob, WireSweepMetrics } from '../types/wireSweep'
import { toProgress, toSweepRequest } from './adapters'
import { postJson, request } from './http'

const path = (id: string) => `/api/sweeps/${encodeURIComponent(id)}`

const toRun = (r: WireExperimentRun): ExperimentRun => ({
  index: r.index, worker: r.worker, startMs: r.start_ms, endMs: r.end_ms, status: r.status,
})

export const createSweep = (r: SweepRequest) =>
  postJson<{ id: string; experiment_count: number }>('/api/sweeps', {
    scenarios: r.scenarios, routings: r.routings, policies: r.policies, capacity_pcts: r.capacityPcts,
    server_multiplier: r.serverMultiplier, bag_count: r.bagCount, threads: r.threads,
  })

export const getSweepJob = async (id: string): Promise<SweepJob> => {
  const w = await request<WireSweepJob>(path(id))
  const d = w.progress?.detail
  return {
    id: w.id,
    status: w.status,
    error: w.error,
    progress: w.progress && toProgress(w.progress),
    live: d ? {
      passIndex: d.pass_index, passes: d.passes, passThreads: d.pass_threads, experiments: d.experiments,
      completed: d.completed, running: d.running, failed: d.failed,
      active: d.active.map((a) => ({ index: a.index, worker: a.worker, startMs: a.start_ms })),
      finished: d.finished.map(toRun),
    } : null,
  }
}

export const getSweepMetrics = async (id: string): Promise<SweepMetrics> => {
  const w = await request<WireSweepMetrics>(`${path(id)}/metrics`)
  return {
    id: w.id,
    config: toSweepRequest(w.config),
    bagsGenerated: w.dataset.bags_generated,
    datasetChecksum: w.dataset.checksum,
    experiments: w.experiments.map((e) => ({
      index: e.index, scenario: e.scenario, routing: e.routing, policy: e.policy, capacityPct: e.capacity_pct, error: e.error,
      result: e.result && {
        bagsSimulated: e.result.bags_simulated, delayedBags: e.result.delayed_bags, delayedPct: e.result.delayed_pct,
        meanSojournS: e.result.mean_sojourn_s, p95SojournS: e.result.p95_sojourn_s, maxQueue: e.result.max_queue,
        engineChecksum: e.result.engine_checksum,
      },
    })),
    passes: w.passes.map((p) => ({
      threads: p.threads, isBaseline: p.is_baseline, requested: p.requested, wallMs: p.wall_ms, speedup: p.speedup,
      efficiencyPct: p.efficiency_pct, timeSavedMs: p.time_saved_ms, completed: p.completed, failed: p.failed,
      identical: p.identical_to_one_thread, mismatches: p.mismatches,
      workers: p.workers.map((x) => ({ worker: x.worker, experiments: x.experiments, busyMs: x.busy_ms })),
      runs: p.runs.map((r) => ({ ...toRun(r), error: r.error, engineChecksum: r.engine_checksum })),
    })),
    consistency: {
      checked: w.consistency.checked, comparedRuns: w.consistency.compared_runs, allIdentical: w.consistency.all_identical,
    },
    prepareMs: w.prepare_ms,
    machine: { os: w.machine.os, arch: w.machine.arch, logicalCores: w.machine.logical_cores },
    debugBuild: w.debug_build,
    definitions: w.definitions,
  }
}
