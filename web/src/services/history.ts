import type { RunRecord } from "../types/models";
import type { WireHistoryItem } from "../types/wire";
import { toRun } from "./adapters";
import { request } from "./http";

/** Newest first. */
export const getHistory = async (): Promise<RunRecord[]> =>
  (await request<{ items: WireHistoryItem[] }>("/api/history")).items.map(toRun);
