import type { StaticResult } from "../types/models";
import type { WireStaticRow } from "../types/wire";
import { toStaticResult } from "./adapters";
import { request } from "./http";

/** Saved measurements from results/*.txt. Show them with the Static badge. */
export const getStaticResults = async (): Promise<StaticResult[]> =>
  (await request<{ rows: WireStaticRow[] }>("/api/static-results")).rows.map(toStaticResult);
