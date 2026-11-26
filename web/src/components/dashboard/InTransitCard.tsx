import { useState } from "react";
import KpiCard from "../common/KpiCard";
import { DEFAULT_PLAYBACK_MS } from "../../config/constants";
import { usePlaybackCounts } from "../../hooks/useRunData";
import type { SimulationRun } from "../../types/models";
import { formatInt, formatSimTime } from "../../utils/format";

/**
 * A finished run has nothing left in transit, so this counts bags at a playback time.
 * Mount with `key={run.id}` so the time resets with the run.
 */
export default function InTransitCard({ run }: { run: SimulationRun | null }) {
  const endMs = run?.summary?.endMs ?? 0;
  const initial = Math.min(DEFAULT_PLAYBACK_MS, endMs);
  const [slider, setSlider] = useState(initial);
  const [atMs, setAtMs] = useState(initial);
  const available = run?.retained ?? false;
  const query = usePlaybackCounts(available ? run?.id : undefined, atMs);
  const counts = available && !query.error ? query.data?.counts : undefined;
  const commit = () => setAtMs(slider);

  return (
    <KpiCard label="In transit" value={formatInt(counts?.travelling)} provenance="real">
      {run && available ? (
        <>
          <p>
            Travelling between facilities at {formatSimTime(atMs)} (simulation time). In the system, including waiting
            and in service: {formatInt(counts?.inSystem)}.
          </p>
          <label className="mt-2 block">
            <span className="sr-only">Playback time</span>
            <input
              type="range" className="w-full accent-ops" min={0} max={endMs} step={60_000} value={slider}
              aria-valuetext={formatSimTime(slider)}
              onChange={(e) => setSlider(Number(e.target.value))}
              onPointerUp={commit} onKeyUp={commit} onBlur={commit}
            />
          </label>
          <p>Playback time: {formatSimTime(slider)}</p>
          {query.error && <p className="text-critical">{query.error.message}</p>}
        </>
      ) : run ? (
        <p>Bag histories for this run are no longer in server memory. Run it again to play it back.</p>
      ) : (
        <p>No run to show.</p>
      )}
    </KpiCard>
  );
}
