// The seven baggage stages. Engine facts follow the reality map in docs/AUDIT.md section 3; the
// "parallel" answers follow docs/design/parallel-studio.md section 3. No numbers from either.

import type { PhaseId } from '../types/models'
import type { Workload } from '../types/parallel'

export interface ParallelWork {
  /** What the measured work is, and how far it relates to this stage. */
  scope: string
  phase: PhaseId
  workload: Workload
}

export interface BaggageStage {
  id: string
  name: string
  model: 'Modelled' | 'Simplified' | 'Not modelled'
  operation: string
  missing: string
  canParallelise: string
  /** `null`: no parallel work is implemented for this stage. */
  work: ParallelWork | null
}

const SIMULATION = 'Inside the simulation this stage runs sequentially: events must be processed in time order.'

export const STAGES: BaggageStage[] = [
  {
    id: 'checkin', name: 'Check-in and generation', model: 'Simplified',
    operation: 'Bags are generated with their arrival times, then queue at one pooled check-in node (40 servers). Transfer bags also enter here.',
    missing: 'Per-airline or per-flight counters, bag drop and passengers.',
    canParallelise: `Dataset generation: yes. Each flight has its own random stream, so bags of different flights can be made at once. The check-in queue: no. ${SIMULATION}`,
    work: { scope: 'Parallel dataset generation (Rayon). This is work done before the check-in queue, not the queue itself.', phase: 'generate', workload: 'generate' },
  },
  {
    id: 'identification', name: 'Identification', model: 'Simplified',
    operation: 'A queued service stage (4 servers).',
    missing: 'Tag reads, read failures and manual coding.',
    canParallelise: `Validating many tags could be split across threads in principle, but there is no validation step to parallelise or measure. ${SIMULATION}`,
    work: null,
  },
  {
    id: 'screening', name: 'Screening', model: 'Modelled',
    operation: 'Two screening lines with a route choice; a share of bags is held for inspection on the same server.',
    missing: 'A separate inspection station, multi-level screening and rejection. The inspection hold is simplified.',
    canParallelise: `Queue coordination: no. ${SIMULATION} No screening batch kernel is implemented.`,
    work: null,
  },
  {
    id: 'transportation', name: 'Transportation', model: 'Simplified',
    operation: 'Fixed travel time along each link; an outage on a link changes routing.',
    missing: 'Link capacity, jams and random failures. With no other live route, a bag uses the failed link.',
    canParallelise: `Routing depends on the network state at the moment of each event, so it stays sequential. No separate parallel transport calculation is implemented.`,
    work: null,
  },
  {
    id: 'sorting', name: 'Sorting', model: 'Modelled',
    operation: 'Three sorter queues, with four routing strategies and four queue policies.',
    missing: 'Diverters, chutes, missorts and early-bag storage.',
    canParallelise: `Aggregating recorded node workloads: yes, as a parallel reduction after the run. The sorter queues: no. ${SIMULATION}`,
    work: {
      scope: 'Parallel aggregation of node workloads (Rayon). It is one pass over the bag histories of all nodes, sorters included; the sorters are not timed separately.',
      phase: 'aggregate', workload: 'aggregate',
    },
  },
  {
    id: 'transfer', name: 'Transfer', model: 'Not modelled',
    operation: 'There is no transfer stage in the engine. Transfer bags differ only in arrival window, deadline and priority.',
    missing: 'A transfer node, minimum connection time and inbound flights.',
    canParallelise: 'The batch deadline-risk kernel: yes. Each bag is classified on its own, so it suits threads, vector lanes and GPUs.',
    work: {
      scope: 'Batch deadline-risk classification over the whole bag table, not only transfer bags. A fixed-formula estimate that adds time for transfer bags; the simulation does not use its output.',
      phase: 'classify', workload: 'classify',
    },
  },
  {
    id: 'loading', name: 'Loading', model: 'Simplified',
    operation: 'Three loading areas; a bag is delayed if loading finishes after its deadline.',
    missing: 'Departures, per-flight loading, unit load devices and loader limits.',
    canParallelise: `Loading events and state changes: no. ${SIMULATION} Analysing the finished bag histories in a batch: yes.`,
    work: {
      scope: 'Parallel batch analysis after the run (Rayon): the aggregation counts bags loaded on time and delayed, along with the node figures. It is the same work as under Sorting, not a second speedup.',
      phase: 'aggregate', workload: 'aggregate',
    },
  },
]
