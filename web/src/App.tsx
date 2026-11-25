import { lazy, Suspense, useState } from "react";
import ScalePage from "./ScalePage";
const ReplayPage = lazy(() => import("./ReplayPage"));
import ScenariosPage from "./ScenariosPage";
import BenchPage from "./BenchPage";
import JourneyPage from "./JourneyPage";
import "./Dash.css";
import "./light.css";

const TABS = ["Scale", "Journey", "Replay", "Scenarios", "Benchmark lab"] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Scale");
  return (
    <div className="shell">
      <nav>
        <b>BagFlow</b>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      {tab === "Scale" && <ScalePage />}
      {tab === "Journey" && <JourneyPage />}
      {tab === "Replay" && <Suspense fallback={<p className="muted">Loading replay...</p>}><ReplayPage /></Suspense>}
      {tab === "Scenarios" && <ScenariosPage />}
      {tab === "Benchmark lab" && <BenchPage />}
    </div>
  );
}
