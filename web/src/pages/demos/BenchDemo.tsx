import DemoFrame from "./DemoFrame";
import BenchPage from "./BenchPage";

export default function BenchDemo() {
  return (
    <DemoFrame
      title="Benchmark lab"
      provenance="static"
      note={<>Saved best-of-10 results, copied by hand into this page. Not measured now. Benchmarks are separate from simulation runs.</>}
    >
      <BenchPage />
    </DemoFrame>
  );
}
