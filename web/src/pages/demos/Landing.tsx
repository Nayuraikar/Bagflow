import { useState } from "react";
import { CITIES } from "./airportData";
import { PaperPlane, Plane } from "./PlaneArt";

const STEPS = [
  ["📍", "Choose destination", "Direct, or through a hub such as Dubai."],
  ["🎫", "Pick flight and bags", "Real departures from the synthetic board."],
  ["🎬", "Follow your bag", "Scenes from check-in to the carousel."],
  ["⚡", "Compare the speed", "Staffing today against yours, and every software backend."],
];

interface Props { days: number; setDays: (d: number) => void; bags: string; flights: string; onSearch: (dest: string, route: "direct" | "via") => void }

export default function Landing({ days, setDays, bags, flights, onSearch }: Props) {
  const [tab, setTab] = useState(0);
  const [dest, setDest] = useState("LHR");
  const [route, setRoute] = useState<"direct" | "via">("direct");
  const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return (
    <>
      <section className="lp">
        <div className="lp-sky">
          <i className="cloud" style={{ width: 260, height: 90, right: "6%", top: "46%" }} />
          <i className="cloud" style={{ width: 340, height: 110, right: "30%", bottom: "6%" }} />
          <i className="cloud" style={{ width: 200, height: 70, right: "2%", top: "16%" }} />
          <PaperPlane />
          <Plane bags={9} hue="#1f6feb" />
          <div className="rate">★★★★★<br /><b>{bags}</b> synthetic bags · <b>{flights}</b> departures</div>
        </div>
        <svg className="lp-wave" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 0 H 82 C 66 16, 98 34, 74 56 S 84 86, 66 100 H 0 Z" />
        </svg>
        <div className="lp-left">
          <div className="lp-nav"><b>✈ BagFlow</b><span>Bengaluru (BLR) · baggage operations</span></div>
          <p className="script">Check in. Fly. Arrive.</p>
          <h1 className="cond">Follow your<br /><em>suitcase</em></h1>
          <p className="lp-sub">Plan a trip, then watch your bag travel through check-in, screening, sorting, loading, the flight and the carousel, with serial and parallel processing side by side.</p>
          <div className="sbox">
            <div className="stabs">{["Book", "Dataset"].map((t, k) => <button key={t} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t}</button>)}</div>
            {tab === 0 ? (
              <div className="sform">
                <div className="frow">
                  <label><small>FROM</small><b>Bengaluru · BLR</b></label>
                  <label><small>TO</small><select value={dest} onChange={(e) => setDest(e.target.value)}>{CITIES.map((c) => <option key={c[0]} value={c[0]}>{c[1]} · {c[0]}</option>)}</select></label>
                </div>
                <div className="frow">
                  <label><small>ROUTE</small><select value={route} onChange={(e) => setRoute(e.target.value as "direct" | "via")}><option value="direct">Direct</option><option value="via">Via a hub (connection)</option></select></label>
                  <label><small>DEPARTURE</small><b>{date}</b></label>
                </div>
                <button className="cta" onClick={() => onSearch(dest, route)}>Show flights</button>
              </div>
            ) : (
              <div className="sform">
                <small>HOW MUCH DATA TO ANALYSE</small>
                <div className="row">{[1, 30, 365].map((d) => <button key={d} className={days === d ? "pill on" : "pill"} onClick={() => setDays(d)}>{d === 1 ? "1 day" : d === 30 ? "30 days" : "1 year"}</button>)}</div>
                <p className="lp-note">{bags} bags and {flights} departures generated in your browser. This is an in-browser imitation: it does not use the Rust generator or its distributions.</p>
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="hw">
        <h3>How it works</h3>
        <div className="hw-row">{STEPS.map((s, k) => <div key={k}><span className="gl">{s[0]}</span><b>{k + 1}. {s[1]}</b><p>{s[2]}</p></div>)}</div>
      </section>
    </>
  );
}
