// The five runs behind the Guided Demo, each with what the API returned for it.

import { useQueries } from '@tanstack/react-query'
import { BASELINE_CONFIG, demoRequests, PROBLEM_CONFIG } from '../config/demo'
import { getSimulation } from '../services/simulationService'
import type { ParallelRun, Run, SimulationConfig, SimulationRun, SweepRun } from '../types/models'
import type { ParallelRequest } from '../types/parallel'
import type { SweepRequest } from '../types/sweep'
import { takesThreads } from '../utils/telemetry'
import { useStepRun } from './demo'
import { useHealth } from './useHealth'
import { useParallelExecution } from './useParallelExecution'
import { useRunMetrics } from './useRunData'
import { useSimulation } from './useSimulation'
import { useSweep } from './useSweep'

const sameSimulation = (want: SimulationConfig) => (r: Run): r is SimulationRun =>
  r.kind === 'simulation' && r.config.scenario === want.scenario && r.config.routing === want.routing &&
  r.config.policy === want.policy && r.config.capacityPct === want.capacityPct &&
  r.config.serverMultiplier === want.serverMultiplier && r.config.bagCount === want.bagCount

const sameParallel = (want: ParallelRequest | null | undefined) => (r: Run): r is ParallelRun =>
  !!want && r.kind === 'parallel' && r.workload === want.workload && r.bagCount === want.bagCount &&
  r.request.backend === want.backend && r.request.repetitions === want.repetitions &&
  (want.chunkSize === undefined || r.request.chunkSize === want.chunkSize) &&
  (!takesThreads(want.backend) || r.request.threads === want.threads)

const sweepKey = (c: SweepRequest) =>
  JSON.stringify([c.scenarios, c.routings, c.policies, c.capacityPcts, c.serverMultiplier, c.bagCount, c.threads])

const sameSweep = (want: SweepRequest | undefined) => (r: Run): r is SweepRun =>
  !!want && r.kind === 'sweep' && sweepKey(r.config) === sweepKey(want)

function useSimulationStep(step: 'problem' | 'simulation', config: SimulationConfig) {
  const state = useStepRun(step, sameSimulation(config))
  const doneId = state.status === 'done' ? state.id : undefined
  const simulation = useSimulation(doneId)
  const metrics = useRunMetrics(doneId)
  return { ...state, simulation, metrics }
}

/** How many earlier baseline runs are read to show how far the Amdahl ceiling moves. */
const CEILING_RUNS = 5

export function useDemoRuns() {
  const health = useHealth().data
  const requests = health ? demoRequests(health) : undefined
  const problem = useSimulationStep('problem', PROBLEM_CONFIG)
  const simulation = useSimulationStep('simulation', BASELINE_CONFIG)
  const workloadRun = useStepRun('workload', sameParallel(requests?.generate))
  const kernelRun = useStepRun('kernel', sameParallel(requests?.kernel))
  const sweepRun = useStepRun('sweep', sameSweep(requests?.sweep))
  const workload = { ...workloadRun, ...useParallelExecution(workloadRun.id) }
  const kernel = { ...kernelRun, ...useParallelExecution(kernelRun.id) }
  const sweep = { ...sweepRun, ...useSweep(sweepRun.id) }
  const baselines = useQueries({
    queries: simulation.finished.slice(0, CEILING_RUNS).map((r) => ({
      queryKey: ['simulation', r.id], queryFn: () => getSimulation(r.id), staleTime: Infinity,
    })),
  })
  const pipelines = baselines.flatMap((q) => (q.data?.pipeline ? [q.data.pipeline] : []))
  return { requests, problem, workload, kernel, simulation, sweep, pipelines }
}

export type DemoRuns = ReturnType<typeof useDemoRuns>
