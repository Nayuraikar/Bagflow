import { Play } from "lucide-react";
import Card from "../common/Card";
import ProvenanceBadge from "../common/ProvenanceBadge";
import { BASELINE_CONFIG } from "../../config/constants";
import { useSimulations } from "../../hooks/simulationContext";
import { formatInt } from "../../utils/format";
import { describeConfig } from "../../utils/runs";

export default function BaselineRunner() {
  const { baseline, runBaseline } = useSimulations();
  const { busy, progress, notice, error } = baseline;
  // only the simulating phase reports a meaningful count
  const counted = progress?.phase === "simulating" && progress.total > 0;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <h2 className="text-base">New simulation</h2>
          <p className="text-muted">Baseline: {formatInt(BASELINE_CONFIG.bagCount)} bags · {describeConfig(BASELINE_CONFIG)}</p>
        </div>
        <button
          type="button" onClick={runBaseline} disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-heading px-4 py-2 text-sm font-semibold text-surface disabled:cursor-wait disabled:opacity-60"
        >
          <Play aria-hidden className="size-4" />
          {busy ? "Running..." : "Run baseline simulation"}
        </button>
      </div>
      <div aria-live="polite">
        {(busy || progress) && !error && (
          <div className="mt-4">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
              <span>
                {progress ? progress.phase : "submitting"}
                {counted && `: ${formatInt(progress.done)} of ${formatInt(progress.total)} bags`}
              </span>
              <ProvenanceBadge kind="real" />
            </div>
            {progress?.status === "done" ? (
              <progress className="job-progress" value={1} max={1} />
            ) : counted ? (
              <progress className="job-progress" value={progress.done} max={progress.total} />
            ) : (
              <progress className="job-progress" />
            )}
          </div>
        )}
        {notice && <p className="mt-2 text-sm text-warning">{notice}</p>}
        {error && <p role="alert" className="mt-2 text-sm text-critical">{error}</p>}
      </div>
    </Card>
  );
}
