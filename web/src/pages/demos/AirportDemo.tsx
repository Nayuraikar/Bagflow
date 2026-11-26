import DemoFrame from "./DemoFrame";
import AirportApp from "./AirportApp";

export default function AirportDemo() {
  return (
    <DemoFrame
      title="Airport"
      provenance="simplified"
      note={<>In-browser model with its own data generator. Every figure here, including delays and their causes, is made in your browser and is not output of the Rust engine. The re-planning panel inside the journey uses fixed rates typed in from saved benchmark results.</>}
    >
      <AirportApp />
    </DemoFrame>
  );
}
