// JSON of /api/benchmarks, as crates/bagflow-api serves it. Nothing outside services/ should import this.

export interface WireSpread { mean: number; median: number; std: number | null; min: number; max: number }

/** `GET /api/benchmarks/:id/metrics`. */
export interface WireBenchMetrics {
  id: string
  workload_size: number
  repetitions: number
  warmup: number
  machine: { os: string; arch: string; logical_cores: number }
  debug_build: boolean
  data_footprint_bytes_computed: number
  definitions: Record<string, string>
  results: {
    backend: string
    threads: number | null
    requested: boolean
    output_identical_to_scalar: boolean
    time_ms: WireSpread
    throughput_bags_per_s: number
    speedup: number
    parallel_efficiency_pct: number | null
    efficiency_baseline: string | null
    gpu: {
      device: string | null
      copy_in_ms: WireSpread
      kernel_ms: WireSpread
      launch_overhead_ms: WireSpread
      copy_out_ms: WireSpread
      kernel_only_speedup: number
      note: string
    } | null
    memory_usage_bytes: number | null
  }[]
}
