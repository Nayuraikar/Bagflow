import type { Bag, BagDetail, BagPage, BagQuery, BagStatus, Network, NodeStats, RunMetrics, StatusRule } from '../types/ops'
import type { WireBag, WireBagDetail, WireBagPage, WireMetrics, WireNetwork, WireNode, WireStatusRule } from '../types/wireOps'
import { toSummary } from './adapters'
import { request } from './http'
import { simulationPath } from './simulationService'

const toNode = (n: WireNode): NodeStats => ({
  id: n.id, name: n.name, type: n.type, x: n.x, y: n.y, capacity: n.capacity, arrivals: n.arrivals,
  completions: n.completions, avgWaitS: n.avg_wait_s, maxQueue: n.max_queue, utilisation: n.utilisation,
  peakWindowUtilisation: n.peak_window_utilisation, status: n.status, waitHistogram: n.wait_histogram,
})

const toRule = (r: WireStatusRule): StatusRule => ({ windowSamples: r.window_samples, highAt: r.high_at, congestedAt: r.congested_at })

/** Kept by the API for every finished run, also after its detailed data is dropped. */
export const getRunMetrics = async (id: string): Promise<RunMetrics> => {
  const w = await request<WireMetrics>(`${simulationPath(id)}/metrics`)
  const s = w.summary
  return {
    summary: {
      ...toSummary(s), averageWaitingTimeS: s.average_waiting_time_s, maxQueue: s.max_queue,
      maxUtilisation: s.max_utilisation, endMs: s.end_ms,
    },
    nodes: w.nodes.map(toNode),
    waitBoundsMs: w.wait_histogram_bounds_ms,
    statusRule: toRule(w.status_rule),
    datasetChecksum: w.dataset.checksum,
    engineChecksum: w.engine_checksum,
  }
}

export const getNetwork = async (id: string): Promise<Network> => {
  const w = await request<WireNetwork>(`${simulationPath(id)}/network`)
  return {
    nodes: w.nodes.map((n) => ({ ...toNode(n), incoming: n.incoming, outgoing: n.outgoing })),
    edges: w.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, travelTimeMs: e.travel_time_ms, trafficTotal: e.traffic_total,
      available: e.available, outages: e.outages.map((o) => ({ startMs: o.start_ms, endMs: o.end_ms })),
    })),
    nodeOutages: w.node_outages.map((o) => ({ node: o.node, startMs: o.start_ms, endMs: o.end_ms, capacityFactor: o.capacity_factor })),
    series: {
      intervalMs: w.series.interval_ms,
      timesMs: w.series.times_ms,
      nodes: w.series.nodes.map(({ queue, busy, capacity, arrivals, completions, status }) => ({ queue, busy, capacity, arrivals, completions, status })),
    },
    statusRule: toRule(w.status_rule),
  }
}

const toBag = (b: WireBag): Bag => ({
  id: b.id, passengerId: b.passenger_id, flightId: b.flight_id, redirected: b.redirected, priority: b.priority,
  transfer: b.transfer, specialHandling: b.special_handling, weightKg: b.weight_kg, arrivalMs: b.arrival_ms,
  deadlineMs: b.deadline_ms, departureMs: b.departure_ms, status: b.status as BagStatus | null,
  currentNode: b.current_node, nextNode: b.next_node, loadingNode: b.loading_node, overdue: b.overdue, waitMs: b.wait_ms,
})

export const getBaggage = async (id: string, q: BagQuery): Promise<BagPage> => {
  const params = new URLSearchParams()
  const fields = {
    page: q.page, page_size: q.pageSize, status: q.status, flight: q.flight, node: q.node, q: q.q,
    sort: q.sort, order: q.order, at_ms: q.atMs === undefined ? undefined : Math.round(q.atMs),
  }
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '') params.set(k, String(v))
  const w = await request<WireBagPage>(`${simulationPath(id)}/baggage?${params}`)
  const c = w.counts
  return {
    page: w.page, pageSize: w.page_size, total: w.total, items: w.items.map(toBag),
    counts: {
      total: c.total, notArrived: c.not_arrived, waiting: c.waiting, inService: c.in_service,
      travelling: c.travelling, loadedOnTime: c.loaded_on_time, delayed: c.delayed,
    },
  }
}

export const getBag = async (id: string, bag: number, atMs?: number): Promise<BagDetail> => {
  const query = atMs === undefined ? '' : `?at_ms=${Math.round(atMs)}`
  const w = await request<WireBagDetail>(`${simulationPath(id)}/baggage/${bag}${query}`)
  return {
    ...toBag(w),
    atMs: w.at_ms,
    route: w.route.map((h) => ({ node: h.node, arriveMs: h.arrive_ms, startMs: h.start_ms, endMs: h.end_ms })),
    timeline: w.timeline.map((t) => ({
      state: t.state as BagStatus, atMs: t.at_ms, node: t.node, waitingMs: t.waiting_ms, durationMs: t.duration_ms ?? null,
    })),
  }
}
