import { Link } from "react-router";
import Card from "../common/Card";
import JobStatusPill from "../common/JobStatusPill";
import ProvenanceBadge from "../common/ProvenanceBadge";
import { useSimulations } from "../../hooks/simulationContext";
import { useHistory } from "../../hooks/useHistory";
import type { RunRecord } from "../../types/models";
import { formatDateTime, formatInt, NA } from "../../utils/format";
import { describeConfig } from "../../utils/runs";

const SHOWN = 8;

function cells(run: RunRecord) {
  return run.kind === "simulation"
    ? {
        workload: `${formatInt(run.summary?.totalBags ?? run.config.bagCount)} bags`,
        scenario: describeConfig(run.config),
        backend: "Sequential engine (engine2)",
      }
    : {
        workload: `${formatInt(run.config.bagCount)} bags`,
        scenario: "Kernel benchmark (not a simulation)",
        backend: run.config.backends.join(", "),
      };
}

export default function RecentRuns() {
  const { data, error, isPending } = useHistory();
  const { current, select } = useSimulations();

  const link = (run: RunRecord) => {
    if (run.status !== "done") return <span className="text-muted">{NA}</span>;
    if (run.kind === "benchmark") return <Link to="/performance" className="text-perf underline">Performance Lab</Link>;
    if (run.id === current?.id) return <span className="text-muted">Shown above</span>;
    return (
      <button type="button" className="text-ops underline" onClick={() => { select(run.id); window.scrollTo({ top: 0 }); }}>
        Show above
      </button>
    );
  };

  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <h2>Recent runs</h2>
        <ProvenanceBadge kind="real" />
      </div>
      {error && <p role="alert" className="mb-2 text-sm text-critical">{error.message}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr className="border-b border-line">
              {["Created", "Workload", "Scenario", "Backend", "Status", "Link"].map((h) => (
                <th key={h} className="py-2 pr-4 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.slice(0, SHOWN).map((run) => {
              const c = cells(run);
              return (
                <tr key={run.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(run.createdAt)}</td>
                  <td className="py-2 pr-4 font-mono whitespace-nowrap">{c.workload}</td>
                  <td className="py-2 pr-4">{c.scenario}</td>
                  <td className="py-2 pr-4">{c.backend}</td>
                  <td className="py-2 pr-4" title={run.error ?? undefined}><JobStatusPill status={run.status} /></td>
                  <td className="py-2 whitespace-nowrap">{link(run)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!data?.length && !error && <p className="pt-3 text-sm text-muted">{isPending ? "Loading..." : "No runs yet."}</p>}
    </Card>
  );
}
