import { Info } from "lucide-react";

/** Required on every Performance page. */
export default function BenchmarkSeparationNote() {
  return (
    <div role="note" className="flex gap-3 rounded-xl border border-perf/30 bg-perf/5 p-4 text-sm">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-perf" />
      <p>
        <strong>Benchmarks are separate from simulation runs.</strong> A benchmark times the batch deadline-risk
        kernel on its own dataset (seed 42, no scenario changes). It has no link to a simulation id, the global
        simulation selector does not apply to it, and the kernel does not feed the simulation, which is sequential.
      </p>
    </div>
  );
}
