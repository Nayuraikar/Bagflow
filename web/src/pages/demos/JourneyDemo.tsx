import DemoFrame from "./DemoFrame";
import JourneyPage from "./JourneyPage";

export default function JourneyDemo() {
  return (
    <DemoFrame
      title="Journey"
      provenance="simplified"
      note={<>Narrated in-browser model, not the engine. Where its text links a stage to Rayon or OpenMP, that is an illustration: the BagFlow simulation is sequential, and parallel backends run only the separate batch deadline-risk kernel.</>}
    >
      <JourneyPage />
    </DemoFrame>
  );
}
