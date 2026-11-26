import Card from "../common/Card";
import ProvenanceBadge from "../common/ProvenanceBadge";
import { useHealth } from "../../hooks/useHealth";
import { formatDateTime, NA } from "../../utils/format";

export default function EngineStatus() {
  const { data, error } = useHealth();
  // after a failed refetch the old data is still there, so the error decides
  const health = error ? undefined : data;
  const online = health?.status === "ok";
  const facts: [string, string][] = [
    ["Engine", health ? health.engine : NA],
    ["Machine", health ? `${health.os} ${health.arch}, ${health.logicalCores} logical cores` : NA],
    ["Jobs", health ? `${health.runningJob ? "1 running" : "idle"}, ${health.queuedJobs} queued` : NA],
    ["Kernel backends for benchmarks", health ? `${health.backends.filter((b) => b.available).length} of ${health.backends.length} available` : NA],
    ["Last simulation finished", formatDateTime(health?.lastSimulation?.finishedAt)],
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className={`size-2.5 rounded-full ${online ? "bg-ops" : error ? "bg-critical" : "bg-line"}`} />
        <h2>{online ? `Engine online (API ${health.version})` : error ? "Engine offline" : "Checking engine..."}</h2>
        <ProvenanceBadge kind="real" />
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-critical">{error.message}</p>}
      {health?.debugBuild && <p className="mt-2 text-sm text-critical">The API is a debug build: its timings are not meaningful.</p>}
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
