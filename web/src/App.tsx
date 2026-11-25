import { useState } from "react";
import ReplayPage from "./ReplayPage";
import ScenariosPage from "./ScenariosPage";
import BenchPage from "./BenchPage";
import "./Dash.css";

const TABS = ["Replay", "Scenarios", "Benchmark lab"] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Replay");
  return (
    <div className="shell">
      <nav>
        <b>BagFlow</b>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      {tab === "Replay" && <ReplayPage />}
      {tab === "Scenarios" && <ScenariosPage />}
      {tab === "Benchmark lab" && <BenchPage />}
    </div>
  );
}
