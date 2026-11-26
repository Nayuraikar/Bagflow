import { lazy, Suspense, useState } from "react";
import ScalePage from "./ScalePage";
import AirportApp from "./AirportApp";
const ReplayPage = lazy(() => import("./ReplayPage"));
import ScenariosPage from "./ScenariosPage";
import BenchPage from "./BenchPage";
import JourneyPage from "./JourneyPage";
import "./Dash.css";
import "./light.css";
import "./skin.css";

const TABS = ["Airport", "Scale", "Journey", "Replay", "Scenarios", "Benchmark lab"] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Airport");
  return (
    <div className="shell">
      <nav>
        <b>BagFlow</b>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      {tab === "Airport" && <AirportApp />}
      {tab === "Scale" && <ScalePage />}
      {tab === "Journey" && <JourneyPage />}
      {tab === "Replay" && <Suspense fallback={<p className="muted">Loading replay...</p>}><ReplayPage /></Suspense>}
      {tab === "Scenarios" && <ScenariosPage />}
      {tab === "Benchmark lab" && <BenchPage />}
    </div>
  );
}
