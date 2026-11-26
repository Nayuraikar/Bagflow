import type { JobStatus } from "../../types/models";

const STYLE: Record<JobStatus, string> = {
  queued: "bg-bg text-muted",
  running: "bg-perf/10 text-perf",
  done: "bg-ops/10 text-ops",
  failed: "bg-critical/10 text-critical",
};

export default function JobStatusPill({ status }: { status: JobStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[status]}`}>{status}</span>;
}
