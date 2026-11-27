import type { BagDetail, FacilityStatus, Network, NetworkEdge } from '../types/ops'

/** Index of the last sample at or before `atMs`, or -1 before the first one. */
export function sampleIndex(timesMs: number[], atMs: number) {
  let lo = 0
  let hi = timesMs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (timesMs[mid] <= atMs) lo = mid + 1
    else hi = mid
  }
  return lo - 1
}

export interface FacilityState {
  queue: number
  busy: number
  capacity: number
  arrivals: number
  completions: number
  utilisation: number | null
  status: FacilityStatus
}

/**
 * One facility at sample `i`. Queue, busy, capacity and status are the API's series. The series has
 * no windowed utilisation, so it is summed here the way the API does it for `?at_ms=`: busy over
 * capacity across the trailing window, none while the facility has no capacity.
 */
export function facilityAt(network: Network, node: number, i: number): FacilityState | null {
  if (i < 0) return null
  const s = network.series.nodes[node]
  let busy = 0
  let capacity = 0
  for (let k = Math.max(0, i - network.statusRule.windowSamples + 1); k <= i; k++) {
    busy += s.busy[k]
    capacity += s.capacity[k]
  }
  return {
    queue: s.queue[i], busy: s.busy[i], capacity: s.capacity[i], arrivals: s.arrivals[i], completions: s.completions[i],
    status: s.status[i], utilisation: s.capacity[i] === 0 ? null : busy / capacity,
  }
}

export const edgeAvailableAt = (e: NetworkEdge, atMs: number) =>
  e.available && !e.outages.some((o) => atMs >= o.startMs && atMs < o.endMs)

export interface Marker {
  id: number
  /** `from === to` while the bag is at a facility. */
  from: number
  to: number
  /** 0 at `from`, 1 at `to`. */
  progress: number
  /** Keeps bags at one facility from hiding each other. */
  slot: number
  redirected: boolean
}

/** Where each sampled bag is at `atMs`. Bags not yet arrived or already loaded are left out. */
export function markersAt(bags: BagDetail[], atMs: number): Marker[] {
  const out: Marker[] = []
  bags.forEach((bag, slot) => {
    for (let i = 0; i < bag.route.length; i++) {
      const hop = bag.route[i]
      if (atMs < hop.arriveMs) break
      const base = { id: bag.id, slot, redirected: bag.redirected }
      if (atMs < hop.endMs) {
        out.push({ ...base, from: hop.node, to: hop.node, progress: 0 })
        break
      }
      const next = bag.route[i + 1]
      if (next && atMs < next.arriveMs) {
        // the engine records only departure and arrival; the even, straight movement is drawing
        out.push({ ...base, from: hop.node, to: next.node, progress: (atMs - hop.endMs) / (next.arriveMs - hop.endMs) })
        break
      }
    }
  })
  return out
}
