import type { BenchmarkConfig, BenchmarkMetrics, JobProgress } from "../types/models";
import type { WireBenchMetrics, WireProgress } from "../types/wire";
import { fromBenchConfig, toBenchMetrics } from "./adapters";
import { postJson, request } from "./http";
import { watchJob } from "./jobEvents";

const base = (id: string) => `/api/benchmarks/${encodeURIComponent(id)}`;

export const createBenchmark = (config: BenchmarkConfig) =>
  postJson<{ id: string }>("/api/benchmarks", fromBenchConfig(config));

export const getBenchmarkMetrics = async (id: string): Promise<BenchmarkMetrics> =>
  toBenchMetrics(await request<WireBenchMetrics>(`${base(id)}/metrics`));

export const watchBenchmark = (id: string, on: { progress: (p: JobProgress) => void; lost: (closed: boolean) => void }) =>
  watchJob<WireProgress>(`${base(id)}/events`, on);
