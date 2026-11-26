import DemoFrame from "./DemoFrame";
import ScalePage from "./ScalePage";

export default function ScaleDemo() {
  return (
    <DemoFrame
      title="Scale"
      provenance="simplified"
      note={<>Illustrative flow model that runs in your browser, not the engine. The parallel arena further down is an estimate: saved benchmark timings scaled linearly to the chosen bag count.</>}
    >
      <ScalePage />
    </DemoFrame>
  );
}
