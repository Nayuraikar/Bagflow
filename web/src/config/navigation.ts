// Destinations from docs/design/parallel-studio.md, "Destinations and sidebar". The design docs
// give build priorities (section 7) but no phase numbers after R2, so none are invented here.

import {
  Activity, Boxes, Cpu, FlaskConical, Gauge, GitCompare, Grid3x3, History, Layers, LayoutDashboard,
  Luggage, Network, PlayCircle, TrafficCone, Workflow, type LucideIcon,
} from 'lucide-react'

export interface Destination {
  path: string
  label: string
  icon: LucideIcon
}

export interface PlannedPage extends Destination {
  /** What the page will show, from the design docs. */
  shows: string[]
  /** Position in the build priority list, or `null` if the list does not name the page. */
  priority: number | null
  priorityNote?: string
  source: string
}

export const DASHBOARD: Destination = { path: '/', label: 'Main Dashboard', icon: LayoutDashboard }

const operations: PlannedPage[] = [
  {
    path: '/operations/stages', label: 'Stage Explorer', icon: Layers, priority: 5, priorityNote: 'stage-specific parallel contribution',
    source: 'parallel-studio.md §3',
    shows: [
      'The 7 baggage stages, from check-in to loading',
      'For each stage: the operation, whether it can be parallelised, and the measured improvement',
      'Plain "Not implemented" or "Sequential" where that is the truth',
    ],
  },
  {
    path: '/operations/network', label: 'Airport Network', icon: Network, priority: 7,
    source: 'blueprint.md page 3',
    shows: [
      'Interactive 2D graph of facilities and links from a retained run',
      'Facility status, queue and utilisation, with outages',
      'Facility and link detail panels',
    ],
  },
  {
    path: '/operations/parallel-studio', label: 'Parallel Execution Studio', icon: Cpu, priority: 1,
    priorityNote: 'sequential vs parallel visualisation; the workload distribution animation is priority 3',
    source: 'parallel-studio.md §1–2',
    shows: [
      'Workload distribution: chunks, worker assignment, concurrent execution, merge and checksum check',
      'Backend comparison with a separate visual for each kind of parallelism',
      'Execution timeline from the real start and end of each task',
    ],
  },
  {
    path: '/operations/baggage', label: 'Baggage Tracker', icon: Luggage, priority: 7,
    source: 'blueprint.md page 4',
    shows: ['Searchable, filterable table of the bags in a retained run', 'One bag’s route and state timeline'],
  },
  {
    path: '/operations/congestion', label: 'Congestion Analysis', icon: TrafficCone, priority: 7,
    source: 'blueprint.md page 5',
    shows: ['Utilisation, queue length and waiting-time charts', 'Bottleneck ranking linked to the Airport Network'],
  },
  {
    path: '/operations/parallel-operations', label: 'Parallel Airport Operations', icon: Workflow, priority: null,
    source: 'operational parallel mode (engine2 precompute)',
    shows: [
      'Sequential and operational-parallel runs of the same configuration, with measured times and a checksum check',
      'Replay of the real precompute tasks per worker',
      'Which facilities run in parallel and which stay sequential',
    ],
  },
]

const performance: PlannedPage[] = [
  {
    path: '/performance', label: 'Performance Lab', icon: Gauge, priority: 6, priorityNote: 'performance analytics',
    source: 'blueprint.md page 6',
    shows: ['Configure and run real kernel benchmarks', 'Time, throughput, speedup and efficiency from measured repetitions'],
  },
  {
    path: '/performance/backends', label: 'Backend Comparison', icon: GitCompare, priority: 6, priorityNote: 'performance analytics',
    source: 'parallel-studio.md §2 and blueprint.md page 7',
    shows: [
      'Backends available on this machine, compared on the same workload',
      'Saved results from other machines, labelled Static with the machine named',
    ],
  },
  {
    path: '/performance/profiler', label: 'Resource Profiler', icon: Activity, priority: 6, priorityNote: 'performance analytics',
    source: 'blueprint.md page 8',
    shows: ['Thread counts, execution time and GPU transfer times', 'Memory and GPU utilisation only where they are actually collected'],
  },
]

const experiments: PlannedPage[] = [
  {
    path: '/experiments/scenarios', label: 'Scenario Studio', icon: FlaskConical, priority: null, source: 'blueprint.md page 9',
    shows: ['Configure a scenario, infrastructure and strategy, then run it', 'Compare two runs side by side'],
  },
  {
    path: '/experiments/sweeps', label: 'Parallel Sweeps', icon: Grid3x3, priority: 4, priorityNote: 'sweeps',
    source: 'parallel-studio.md §4',
    shows: [
      'Many independent simulations running at once on a thread pool, each one sequential inside',
      'Grid of experiments filling across worker lanes, with per-thread distribution',
      'Consistency against the 1-thread sweep, and wall time, speedup and efficiency by thread count',
    ],
  },
  {
    path: '/experiments/history', label: 'Simulation History', icon: History, priority: null, source: 'blueprint.md page 10',
    shows: ['All saved runs with configuration and results', 'Reopen and compare runs'],
  },
]

export const GUIDED_DEMO: PlannedPage = {
  path: '/guided-demo', label: 'Guided Demo', icon: PlayCircle, priority: null, source: 'parallel-studio.md §6',
  shows: ['A walkthrough: problem, workload, parallel kernel, simulation, experiment sweep, results'],
}

export const SECTIONS: { title: string; items: Destination[] }[] = [
  { title: 'Overview', items: [DASHBOARD] },
  { title: 'Operations & Parallelism', items: operations },
  { title: 'Performance', items: performance },
  { title: 'Experiments', items: experiments },
]

export const PAGES: PlannedPage[] = [...operations, ...performance, ...experiments, GUIDED_DEMO]

export const BRAND_ICON = Boxes
