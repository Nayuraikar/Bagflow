// UI models for one simulation run: node statistics, network, series and bags.
// Times are simulation milliseconds since midnight of the synthetic day (they can pass 24 h).

import type { SimulationSummary } from './models'

export type FacilityStatus = 'offline' | 'normal' | 'high' | 'congested'

export interface NodeStats {
  id: number
  name: string
  type: string
  x: number
  y: number
  /** Parallel servers. */
  capacity: number
  arrivals: number
  completions: number
  avgWaitS: number
  maxQueue: number
  /** Whole-run average (0-1). */
  utilisation: number
  /** Highest value of the display rule's window (0-1). */
  peakWindowUtilisation: number
  /** Worst status in the run, by the API's display rule. */
  status: FacilityStatus
  waitHistogram: number[]
}

export interface NetworkNode extends NodeStats {
  incoming: string[]
  outgoing: string[]
}

export interface TimeWindow {
  startMs: number
  endMs: number
}

export interface NetworkEdge {
  id: string
  source: number
  target: number
  travelTimeMs: number
  /** Bags over the whole run. */
  trafficTotal: number
  available: boolean
  outages: TimeWindow[]
}

export interface StatusRule {
  windowSamples: number
  highAt: number
  congestedAt: number
}

export interface NodeSeries {
  queue: number[]
  busy: number[]
  capacity: number[]
  /** Cumulative. */
  arrivals: number[]
  /** Cumulative. */
  completions: number[]
  status: FacilityStatus[]
}

export interface Network {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  nodeOutages: (TimeWindow & { node: number; capacityFactor: number })[]
  series: { intervalMs: number; timesMs: number[]; nodes: NodeSeries[] }
  statusRule: StatusRule
}

export interface RunMetrics {
  summary: SimulationSummary & { averageWaitingTimeS: number; maxQueue: number; maxUtilisation: number; endMs: number }
  nodes: NodeStats[]
  /** Upper bounds of the wait bins; one more bin holds everything above the last. */
  waitBoundsMs: number[]
  statusRule: StatusRule
  datasetChecksum: string
  engineChecksum: string
}

export type BagStatus =
  | 'CHECKED_IN' | 'IDENTIFIED' | 'SCREENING' | 'CLEARED' | 'IN_TRANSIT' | 'SORTED'
  | 'TRANSFER_PENDING' | 'LOADING' | 'LOADED' | 'DELAYED' | 'MISROUTED' | 'HELD_FOR_INSPECTION'

export interface Bag {
  id: number
  passengerId: number
  flightId: number
  /** SorterOverload sent the bag to another flight's loading area. `flightId` is the original. */
  redirected: boolean
  priority: string
  transfer: boolean
  specialHandling: boolean
  weightKg: number
  arrivalMs: number
  deadlineMs: number
  departureMs: number | null
  /** `null` before arrival. */
  status: BagStatus | null
  currentNode: number | null
  nextNode: number | null
  loadingNode: number | null
  overdue: boolean
  waitMs: number
}

export interface Hop {
  node: number
  arriveMs: number
  startMs: number
  endMs: number
}

export interface BagDetail extends Bag {
  atMs: number | null
  route: Hop[]
  /** Always the whole run. */
  timeline: { state: BagStatus; atMs: number | null; node: number; waitingMs: number | null; durationMs: number | null }[]
}

export interface BagCounts {
  total: number
  notArrived: number
  waiting: number
  inService: number
  travelling: number
  loadedOnTime: number
  delayed: number
}

export interface BagPage {
  page: number
  pageSize: number
  /** Bags matching the filters. */
  total: number
  /** Over the whole run, ignoring the filters. */
  counts: BagCounts
  items: Bag[]
}

export interface BagQuery {
  page: number
  pageSize: number
  status?: BagStatus
  flight?: string
  node?: string
  /** Exact bag id. */
  q?: string
  sort?: 'id' | 'arrival' | 'deadline'
  order?: 'asc' | 'desc'
  atMs?: number
}
