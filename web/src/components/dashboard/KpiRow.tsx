import KpiCard from "../common/KpiCard";
import InTransitCard from "./InTransitCard";
import { useSimulationMetrics } from "../../hooks/useRunData";
import type { SimulationRun } from "../../types/models";
import { formatInt, formatPct } from "../../utils/format";

export default function KpiRow({ run }: { run: SimulationRun | null }) {
  const summary = run?.summary;
  const rule = useSimulationMetrics(run?.id).data?.statusRule;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Total baggage" value={formatInt(summary?.totalBags)} provenance="real">
        {summary ? "Bags simulated in this run." : "No run to show."}
      </KpiCard>
      <KpiCard label="Successfully loaded" value={formatInt(summary?.loadedOnTime)} provenance="real">
        {summary
          ? `Loaded by their deadline (${formatPct(100 * summary.onTimeLoadingRate, 3)}). Delayed: ${formatInt(summary.delayedBags)} (${formatPct(summary.delayedPct, 3)}).`
          : "No run to show."}
      </KpiCard>
      <InTransitCard key={run?.id ?? "none"} run={run} />
      <KpiCard label="Active bottlenecks" value={formatInt(summary?.congestedFacilities)} provenance="real">
        <p>Facilities that were congested at some point in the whole run (not at the playback time).</p>
        <p className="mt-1">
          <strong>Display rule, not engine output:</strong>{" "}
          {rule
            ? `congested when utilisation over ${rule.windowSamples} one-minute samples reaches ${formatPct(100 * rule.congestedAt, 0)}.`
            : "applied by the API to engine samples."}
        </p>
      </KpiCard>
    </div>
  );
}
