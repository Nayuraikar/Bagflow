import DemoFrame from "./DemoFrame";
import ReplayPage from "./ReplayPage";

export default function ReplayDemo() {
  return (
    <DemoFrame
      title="Replay"
      provenance="static"
      note={<>Saved run of the legacy 6-node engine (6,000 bags). It is not engine2 and not one of your simulation runs.</>}
    >
      <ReplayPage />
    </DemoFrame>
  );
}
