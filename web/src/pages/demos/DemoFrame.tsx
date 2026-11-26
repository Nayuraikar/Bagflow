import type { ReactNode } from "react";
import PageContainer from "../../layouts/PageContainer";
import ProvenanceBadge from "../../components/common/ProvenanceBadge";
import type { Provenance } from "../../types/models";
import "./styles/demos.css";

interface Props {
  title: string;
  provenance: Provenance;
  note: ReactNode;
  children: ReactNode;
}

/** Wraps an old tab: says where its numbers come from and keeps its CSS inside `.legacy-demo`. */
export default function DemoFrame({ title, provenance, note, children }: Props) {
  return (
    <PageContainer title={title} subtitle="Concept demo">
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
        <ProvenanceBadge kind={provenance} />
        <div className="text-muted">{note}</div>
      </div>
      <div className="legacy-demo">
        <div className="shell">{children}</div>
      </div>
    </PageContainer>
  );
}
