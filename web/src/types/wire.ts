// The Rust API's JSON (snake_case), limited to the fields the adapters read.
// Only services/ should import this file.

import type { BaggageStatus, FacilityStatus, JobStatus } from "./models";

export interface WireProgress { status: JobStatus; phase: string; done: number; total: number; error: string | null }

export interface WireHealth {
  status: string;
  version: string;
  engine: string;
  debug_build: boolean;
  machine: { os: string; arch: string; logical_cores: number };
  backends: { id: string; available: boolean; detail: string | null; reason: string | null }[];
  queue: { running: string | null; queued: number };
  last_simulation: { id: string; finished_at_ms: number | null } | null;
}

export interface WireSimConfig {
  scenario: string; routing: string; policy: string;
  capacity_pct: number; server_multiplier: number; bag_count: number;
}

export interface WireBenchConfig {
  bag_count: number; backends: string[]; threads: number[]; repetitions: number; warmup: number;
}

export interface WireSummary {
  total_bags: number; processed_bags: number; in_transit: number; delayed_bags: number; loaded_on_time: number;
  average_waiting_time_s: number; on_time_loading_rate: number; delayed_pct: number;
  congested_facilities: number; max_queue: number; end_ms: number | null;
}

export interface WireStatusRule { source: string; window_samples: number; high_at: number; congested_at: number }

interface WireRecordBase {
  id: string; status: JobStatus; created_at_ms: number; finished_at_ms: number | null;
  config_hash: string; error: string | null; progress: WireProgress | null; retained: boolean;
}

export type WireHistoryItem =
  | (WireRecordBase & { kind: "simulation"; config: WireSimConfig; summary: WireSummary | null })
  | (WireRecordBase & { kind: "benchmark"; config: WireBenchConfig });

export interface WireSimulationMetrics { id: string; summary: WireSummary; status_rule: WireStatusRule }

export interface WireBag {
  id: number; passenger_id: number; flight_id: number; redirected: boolean; priority: string;
  arrival_ms: number; deadline_ms: number; departure_ms: number | null; status: BaggageStatus | null;
  current_node: number | null; loading_node: number | null; overdue: boolean; wait_ms: number;
}

export interface WireBaggagePage {
  page: number; page_size: number; total: number; at_ms: number | null;
  counts: {
    total: number; not_arrived: number; waiting: number; in_service: number; travelling: number;
    in_system: number; loaded_on_time: number; delayed: number;
  };
  items: WireBag[];
}

export interface WireNode {
  id: number; name: string; type: string; x: number; y: number; capacity: number; queue_length: number | null;
  processing_rate_per_s: number; utilisation: number | null; status: FacilityStatus | null;
  max_queue: number; avg_wait_s: number;
}

export interface WireEdge {
  id: string; source: number; target: number; travel_time_ms: number; capacity: number | null;
  traffic_total: number; available: boolean;
}

export interface WireNetwork { at_ms: number | null; nodes: WireNode[]; edges: WireEdge[]; status_rule: WireStatusRule }

export interface WireTimeStats { mean: number; median: number; std: number | null; min: number; max: number }

export interface WireBenchRow {
  backend: string; threads: number | null; output_identical_to_scalar: boolean;
  time_ms: WireTimeStats; throughput_bags_per_s: number; speedup: number;
  parallel_efficiency_pct: number | null; efficiency_baseline: string | null;
  gpu: null | {
    device: string | null; copy_in_ms: WireTimeStats; kernel_ms: WireTimeStats;
    launch_overhead_ms: WireTimeStats; copy_out_ms: WireTimeStats; note: string;
  };
  memory_usage_bytes: number | null;
}

export interface WireBenchMetrics {
  id: string; workload_size: number; repetitions: number; warmup: number; results: WireBenchRow[];
}

export interface WireStaticRow {
  machine: string; source_file: string; kind: "kernel" | "mpi"; label: string; bags: number; statistic: string;
  time_ms: number | null; speedup: number | null; speedup_baseline: string; ranks: number | null;
  compute_ms: number | null; output_identical: boolean | null;
}
