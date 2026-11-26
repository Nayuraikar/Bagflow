import type { Provenance } from "../../types/models";

const KINDS: Record<Provenance, { label: string; title: string; style: string }> = {
  real: { label: "Real", title: "Output of the Rust engine or API on this machine", style: "border-ops/40 bg-ops/10 text-ops" },
  static: { label: "Static", title: "Saved earlier results; not measured now", style: "border-warning/50 bg-warning/10 text-[#8a5d12]" },
  simplified: { label: "Simplified", title: "In-browser model; not engine output", style: "border-line bg-bg text-heading" },
};

/** Says where the numbers next to it come from. */
export default function ProvenanceBadge({ kind }: { kind: Provenance }) {
  const { label, title, style } = KINDS[kind];
  return (
    <span title={title} className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}
