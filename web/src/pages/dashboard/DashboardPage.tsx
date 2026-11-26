import BaselineRunner from "../../components/dashboard/BaselineRunner";
import DestinationCards from "../../components/dashboard/DestinationCards";
import EngineStatus from "../../components/dashboard/EngineStatus";
import KpiRow from "../../components/dashboard/KpiRow";
import RecentRuns from "../../components/dashboard/RecentRuns";
import { useSimulations } from "../../hooks/simulationContext";
import PageContainer from "../../layouts/PageContainer";
import { formatDateTime } from "../../utils/format";
import { describeConfig } from "../../utils/runs";

export default function DashboardPage() {
  const { current, selectedId, loading, error } = useSimulations();
  const showing = current
    ? `${selectedId ? "Selected run" : "Latest finished run"}: ${describeConfig(current.config)}. Finished ${formatDateTime(current.finishedAt)}.`
    : loading
      ? "Loading runs..."
      : error
        ? "Runs are unavailable."
        : "No finished run yet. Run the baseline simulation to fill these cards.";
  return (
    <PageContainer title="Welcome to BagFlow" subtitle="Airport baggage simulation and parallel computing, on one synthetic day.">
      <div className="grid gap-4">
        <EngineStatus />
        <BaselineRunner />
        <p className="text-sm text-muted">{showing}</p>
        <KpiRow run={current} />
        <DestinationCards />
        <RecentRuns />
      </div>
    </PageContainer>
  );
}
