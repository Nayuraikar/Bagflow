import type { ReactNode } from "react";
import Card from "./Card";
import ProvenanceBadge from "./ProvenanceBadge";
import type { Provenance } from "../../types/models";

interface Props {
  label: string;
  /** Already formatted; "--" when unavailable. */
  value: string;
  provenance: Provenance;
  children?: ReactNode;
}

export default function KpiCard({ label, value, provenance, children }: Props) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm text-muted">{label}</h3>
        <ProvenanceBadge kind={provenance} />
      </div>
      <p className="font-mono text-3xl font-semibold tracking-tight">{value}</p>
      <div className="text-xs text-muted">{children}</div>
    </Card>
  );
}
