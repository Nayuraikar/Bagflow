import { createContext, useContext } from "react";
import type { JobProgress, SimulationRun } from "../types/models";

export interface BaselineJob {
  /** True from the click until the job finishes or its progress stream is lost. */
  busy: boolean;
  progress: JobProgress | null;
  /** Set while the progress stream is reconnecting. */
  notice: string | null;
  error: string | null;
}

export interface SimulationContextValue {
  /** All simulation runs, newest first. */
  runs: SimulationRun[];
  /** The run the app is showing: the chosen one, otherwise the latest finished run. */
  current: SimulationRun | null;
  /** `null` follows the latest finished run. */
  selectedId: string | null;
  select: (id: string | null) => void;
  loading: boolean;
  error: Error | null;
  baseline: BaselineJob;
  runBaseline: () => void;
}

export const SimulationContext = createContext<SimulationContextValue | null>(null);

export function useSimulations(): SimulationContextValue {
  const value = useContext(SimulationContext);
  if (!value) throw new Error("useSimulations needs SimulationProvider");
  return value;
}
