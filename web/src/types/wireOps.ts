// JSON of /api/simulations/:id/{metrics,network,baggage}, as crates/bagflow-api/src/sim.rs serves it.
// Nothing outside services/ should import this file.

import type { WireSimSummary } from './wire'

export interface WireNode {
  id: number
  name: string
  type: string
  x: number
  y: number
  capacity: number
  arrivals: number
  completions: number
  avg_wait_s: number
  max_queue: number
  utilisation: number
  peak_window_utilisation: number
  status: 'offline' | 'normal' | 'high' | 'congested'
  wait_histogram: number[]
}

export interface WireStatusRule { window_samples: number; high_at: number; congested_at: number }

export interface WireMetrics {
  dataset: { checksum: string }
  engine_checksum: string
  summary: WireSimSummary & { average_waiting_time_s: number; max_queue: number; max_utilisation: number; end_ms: number }
  nodes: WireNode[]
  wait_histogram_bounds_ms: number[]
  status_rule: WireStatusRule
}

export interface WireNetwork {
  nodes: (WireNode & { incoming: string[]; outgoing: string[] })[]
  edges: {
    id: string
    source: number
    target: number
    travel_time_ms: number
    traffic_total: number
    available: boolean
    outages: { start_ms: number; end_ms: number }[]
  }[]
  node_outages: { node: number; start_ms: number; end_ms: number; capacity_factor: number }[]
  series: {
    interval_ms: number
    times_ms: number[]
    nodes: {
      node: number
      queue: number[]
      busy: number[]
      capacity: number[]
      arrivals: number[]
      completions: number[]
      status: WireNode['status'][]
    }[]
  }
  status_rule: WireStatusRule
}

export interface WireBag {
  id: number
  passenger_id: number
  flight_id: number
  redirected: boolean
  priority: string
  transfer: boolean
  special_handling: boolean
  weight_kg: number
  arrival_ms: number
  deadline_ms: number
  departure_ms: number | null
  status: string | null
  current_node: number | null
  next_node: number | null
  loading_node: number | null
  overdue: boolean
  wait_ms: number
}

export interface WireBagPage {
  page: number
  page_size: number
  total: number
  counts: {
    total: number
    not_arrived: number
    waiting: number
    in_service: number
    travelling: number
    loaded_on_time: number
    delayed: number
  }
  items: WireBag[]
}

export interface WireBagDetail extends WireBag {
  at_ms: number | null
  route: { node: number; arrive_ms: number; start_ms: number; end_ms: number }[]
  timeline: { state: string; at_ms: number | null; node: number; waiting_ms: number | null; duration_ms?: number }[]
}
