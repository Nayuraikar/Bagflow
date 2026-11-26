import type { AirportNetwork, BaggagePage, JobProgress, SimulationConfig, SimulationMetrics, StatusRule } from "../types/models";
import type { WireBaggagePage, WireNetwork, WireProgress, WireSimulationMetrics } from "../types/wire";
import { fromSimConfig, toBaggagePage, toMetrics, toNetwork, toStatusRule } from "./adapters";
import { postJson, request } from "./http";
import { watchJob } from "./jobEvents";

const base = (id: string) => `/api/simulations/${encodeURIComponent(id)}`;

export const createSimulation = (config: SimulationConfig) =>
  postJson<{ id: string }>("/api/simulations", fromSimConfig(config));

export async function getSimulationMetrics(id: string): Promise<{ summary: SimulationMetrics; statusRule: StatusRule }> {
  const wire = await request<WireSimulationMetrics>(`${base(id)}/metrics`);
  return { summary: toMetrics(wire.summary), statusRule: toStatusRule(wire.status_rule) };
}

export async function getNetwork(id: string, atMs?: number): Promise<AirportNetwork> {
  const query = atMs === undefined ? "" : `?at_ms=${atMs}`;
  return toNetwork(await request<WireNetwork>(`${base(id)}/network${query}`));
}

export async function getBaggage(id: string, query: { atMs?: number; page?: number; pageSize?: number }): Promise<BaggagePage> {
  const params = new URLSearchParams();
  if (query.atMs !== undefined) params.set("at_ms", String(query.atMs));
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("page_size", String(query.pageSize));
  return toBaggagePage(await request<WireBaggagePage>(`${base(id)}/baggage?${params}`));
}

export const watchSimulation = (id: string, on: { progress: (p: JobProgress) => void; lost: (closed: boolean) => void }) =>
  watchJob<WireProgress>(`${base(id)}/events`, on);
