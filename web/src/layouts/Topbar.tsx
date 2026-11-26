import { Menu } from "lucide-react";
import { useLocation } from "react-router";
import ProvenanceBadge from "../components/common/ProvenanceBadge";
import { useSimulations } from "../hooks/simulationContext";
import { shortRunLabel } from "../utils/runs";

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { runs, selectedId, select, current, error } = useSimulations();
  const { pathname } = useLocation();
  const done = runs.filter((r) => r.status === "done");
  // benchmarks have no simulation, and the demos have their own data
  const unused = pathname.startsWith("/performance")
    ? "Not used by benchmarks"
    : pathname.startsWith("/demos")
      ? "Not used by concept demos"
      : null;
  return (
    <div className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-4 py-2 sm:px-8">
      <button type="button" className="rounded-md p-1 lg:hidden" onClick={onMenu} aria-label="Toggle navigation">
        <Menu aria-hidden className="size-5" />
      </button>
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-3">
        {unused && <span className="text-xs text-muted">{unused}</span>}
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <span className="text-muted">Simulation run</span>
          <select
            className="max-w-[28rem] min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 disabled:opacity-50"
            value={selectedId ?? ""}
            onChange={(e) => select(e.target.value || null)}
            disabled={unused !== null || done.length === 0}
          >
            <option value="">{current ? "Latest finished run" : error ? "API not reachable" : "No finished run yet"}</option>
            {done.map((r) => (
              <option key={r.id} value={r.id}>
                {shortRunLabel(r.config, r.createdAt)}
                {r.retained ? "" : " (summary only)"}
              </option>
            ))}
          </select>
        </label>
        <ProvenanceBadge kind="real" />
      </div>
    </div>
  );
}
