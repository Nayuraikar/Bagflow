import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BASELINE_CONFIG } from "../config/constants";
import { SimulationContext, type BaselineJob } from "../hooks/simulationContext";
import { useHistory } from "../hooks/useHistory";
import { createSimulation, watchSimulation } from "../services/simulations";
import type { SimulationRun } from "../types/models";

const IDLE: BaselineJob = { busy: false, progress: null, notice: null, error: null };

/** Holds the global run selection, and the baseline job so its progress survives page changes. */
export default function SimulationProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const history = useHistory();
  const [selectedId, select] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<BaselineJob>(IDLE);
  const stopWatching = useRef<() => void>(() => {});
  const starting = useRef(false);

  useEffect(() => () => stopWatching.current(), []);

  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ["history"] });
    void client.invalidateQueries({ queryKey: ["health"] });
  }, [client]);

  const runBaseline = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    stopWatching.current();
    setBaseline({ ...IDLE, busy: true });
    const finish = (job: Partial<BaselineJob>) => {
      starting.current = false;
      setBaseline((b) => ({ ...b, busy: false, notice: null, ...job }));
      refresh();
    };
    try {
      const { id } = await createSimulation(BASELINE_CONFIG);
      refresh();
      stopWatching.current = watchSimulation(id, {
        progress: (progress) => {
          if (progress.status === "done") {
            select(null); // show the run that just finished
            finish({ progress });
          } else if (progress.status === "failed") {
            finish({ progress, error: progress.error ?? "The simulation failed." });
          } else {
            setBaseline({ busy: true, progress, notice: null, error: null });
          }
        },
        lost: (closed) => {
          if (closed) finish({ error: "Lost the progress stream. Check Recent runs for the outcome." });
          else setBaseline((b) => (b.busy ? { ...b, notice: "Connection lost, reconnecting..." } : b));
        },
      });
    } catch (e) {
      finish({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [refresh]);

  const runs = useMemo(
    () => (history.data ?? []).filter((r): r is SimulationRun => r.kind === "simulation"),
    [history.data],
  );
  const chosen = runs.find((r) => r.id === selectedId && r.status === "done");
  const current = chosen ?? runs.find((r) => r.status === "done") ?? null;

  return (
    <SimulationContext.Provider
      value={{
        runs, current, selectedId: chosen ? selectedId : null, select,
        loading: history.isPending, error: history.error, baseline, runBaseline,
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
}
