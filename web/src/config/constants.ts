import type { SimulationConfig } from "../types/models";

/** The first of the three fixed configs: Normal / dijkstra / fcfs / 100% on 250k bags. */
export const BASELINE_CONFIG: SimulationConfig = {
  scenario: "Normal",
  routing: "dijkstra",
  policy: "fcfs",
  capacityPct: 100,
  serverMultiplier: 1,
  bagCount: 250_000,
};

/** Default playback time: 18:00, in the middle of the scenario window (17:00-19:00). */
export const DEFAULT_PLAYBACK_MS = 18 * 3600 * 1000;
