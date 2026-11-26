import { Link } from "react-router";
import PageContainer from "../layouts/PageContainer";

export default function NotFoundPage() {
  return (
    <PageContainer title="Page not found">
      <Link to="/dashboard" className="text-sm text-perf underline">Go to the overview</Link>
    </PageContainer>
  );
}
