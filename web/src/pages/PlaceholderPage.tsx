import BenchmarkSeparationNote from "../components/performance/BenchmarkSeparationNote";
import Card from "../components/common/Card";
import type { NavItem } from "../config/navigation";
import PageContainer from "../layouts/PageContainer";

/** A route that exists in the navigation but is not built yet. Shows no data. */
export default function PlaceholderPage({ item }: { item: NavItem }) {
  const performance = item.path.startsWith("/performance");
  return (
    <PageContainer title={item.path === "/performance" ? "Parallel Performance Laboratory" : item.label}>
      <div className="grid gap-4">
        {performance && <BenchmarkSeparationNote />}
        <Card>
          <h2>Not built yet</h2>
          <p className="mt-1 text-sm text-muted">{item.planned}</p>
        </Card>
      </div>
    </PageContainer>
  );
}
