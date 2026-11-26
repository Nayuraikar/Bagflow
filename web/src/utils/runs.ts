import type { SimulationConfig } from "../types/models";
import { formatInt } from "./format";

export const describeConfig = (c: SimulationConfig) =>
  `${c.scenario} · ${c.routing} · ${c.policy} · ${c.capacityPct}% capacity · servers x${c.serverMultiplier}`;

export const shortRunLabel = (c: SimulationConfig, createdAt: number) =>
  `${new Date(createdAt).toLocaleTimeString()} · ${formatInt(c.bagCount)} bags · ${c.scenario}/${c.routing}/${c.policy} ${c.capacityPct}% x${c.serverMultiplier}`;
