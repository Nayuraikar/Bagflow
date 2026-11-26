import DemoFrame from "./DemoFrame";
import ScenariosPage from "./ScenariosPage";

export default function ScenariosDemo() {
  return (
    <DemoFrame
      title="Scenarios"
      provenance="real"
      note={<>Live engine2 runs from the old /api/run endpoint, on its own fixed dataset. These runs are not saved to history and do not follow the simulation selector.</>}
    >
      <ScenariosPage />
    </DemoFrame>
  );
}
