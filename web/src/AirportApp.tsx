import { useMemo, useState } from "react";
import { CITIES, CAUSES, HUBS, cityName, color, dataset, hm, leg2, type Flight, type Trip } from "./airportData";
import Movie from "./Movie";
import Landing from "./Landing";
import "./airport.css";

const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k" : String(Math.round(n));
const Chip = ({ f }: { f: Flight }) => <span className={"chip " + (f.delay > 60 ? "r" : f.delay > 15 ? "a" : "g")}>{f.delay > 15 ? `+${f.delay} min` : "on time"}</span>;
const Bars = ({ v, hi, col, labels }: { v: number[]; hi?: number; col: string; labels?: string[] }) => {
  const m = Math.max(...v, 1);
  return <div className="bars">{v.map((x, i) => <div key={i} className={i === hi ? "hi" : ""}><i style={{ height: (100 * x) / m + "%", background: col }} /><small>{labels ? labels[i] : i}</small></div>)}</div>;
};

export default function AirportApp() {
  const [days, setDays] = useState(30);
  const D = useMemo(() => dataset(days), [days]);
  const [view, setView] = useState<"dash" | "book" | "pass" | "movie">("dash");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [init, setInit] = useState<{ dest: string; route: "direct" | "via" } | null>(null);
  const S = D.stats;
  const hAvg = S.hourDelay.map((d, i) => d / Math.max(1, S.hourN[i]));
  const peakH = S.hourBags.indexOf(Math.max(...S.hourBags)), worstH = hAvg.indexOf(Math.max(...hAvg));
  const topC = S.causes.indexOf(Math.max(...S.causes));

  if (view === "movie" && trip) return <Movie trip={trip} today={D.today} stats={S} onExit={() => setView("dash")} />;
  if (view === "book") return <Book today={D.today} init={init} onDone={(t) => { setTrip(t); setView("pass"); }} onBack={() => setView("dash")} />;
  if (view === "pass" && trip) return <Pass trip={trip} onGo={() => setView("movie")} onBack={() => setView("book")} />;

  return (
    <div className="ap">
      <div className="blob b1" /><div className="blob b2" />
      <Landing days={days} setDays={setDays} bags={fmt(S.bags)} flights={S.flights.toLocaleString()} onSearch={(d, r) => { setInit({ dest: d, route: r }); setView("book"); }} />
      <section className="kpis">
        <div><small>Bags handled</small><b>{fmt(S.bags)}</b><em>{fmt(S.xfer)} are transfers</em></div>
        <div><small>On time (≤15 min)</small><b>{(100 * (1 - S.late / S.flights)).toFixed(0)}%</b><em>{(S.delaySum / S.flights).toFixed(1)} min average delay</em></div>
        <div><small>Bags at risk of missing a connection</small><b>{fmt(S.missed)}</b><em>{(100 * S.missed / Math.max(1, S.xfer)).toFixed(1)}% of transfers</em></div>
        <div><small>Busiest hour</small><b>{String(peakH).padStart(2, "0")}:00</b><em>{fmt(S.hourBags[peakH] / days)} bags per day in that hour</em></div>
      </section>
      <section className="grid2">
        <div className="soft"><h3>Bags per hour (avg per day)</h3><Bars v={S.hourBags.map((x) => x / days)} col="#6366f1" hi={peakH} /></div>
        <div className="soft"><h3>Average delay by hour (min)</h3><Bars v={hAvg.map((x) => Math.max(0, x))} col="#f97316" hi={worstH} /></div>
        <div className="soft"><h3>Delay distribution</h3><Bars v={S.hist} col="#14b8a6" labels={["early", "≤15", "≤30", "≤60", "≤120", ">120"]} /></div>
        <div className="soft"><h3>Why flights are late</h3>
          {CAUSES.map((c, i) => <div className="cause" key={c}><span>{c}</span><i style={{ width: (100 * S.causes[i] / Math.max(1, S.late)) + "%" }} /><b>{(100 * S.causes[i] / Math.max(1, S.late)).toFixed(0)}%</b></div>)}
        </div>
      </section>
      <section className="soft insight">
        <h3>What the data says</h3>
        <p>Traffic comes in <b>banks</b>: the morning and evening rushes make {String(peakH).padStart(2, "0")}:00 the busiest hour. Delays grow through the day because a late aircraft delays its next flight, so the worst hour for delays is <b>{String(worstH).padStart(2, "0")}:00</b>. The biggest cause is <b>{CAUSES[topC].toLowerCase()}</b>. Transfer bags are the fragile ones: a flight delayed 60+ minutes can strand most of its connecting bags.</p>
      </section>
      <section className="soft">
        <h3>Departures today (from 17:00)</h3>
        <div className="board">{D.today.filter((f) => f.dep >= 1020).slice(0, 12).map((f) => (
          <div key={f.id}><b>{hm(f.dep)}</b><span>{f.code}</span><span style={{ color: color(f.city) }}>● {cityName(f.city)}</span><span>Gate {f.gate}</span><span>{f.bags} bags</span><Chip f={f} /></div>
        ))}</div>
      </section>
    </div>
  );
}

function Book({ today, init, onDone, onBack }: { today: Flight[]; init: { dest: string; route: "direct" | "via" } | null; onDone: (t: Trip) => void; onBack: () => void }) {
  const [dest, setDest] = useState(init?.dest ?? "LHR");
  const [route, setRoute] = useState<"direct" | "via">(init?.route ?? "direct");
  const [hub, setHub] = useState("DXB");
  const [fid, setFid] = useState<number | null>(null);
  const [bags, setBags] = useState(1);
  const [special, setSpecial] = useState(false);
  const [follow, setFollow] = useState(true);
  const [name, setName] = useState("Nayana");
  const useHub = HUBS.includes(dest) && route === "via" ? HUBS.find((h) => h !== dest)! : hub === dest ? "DXB" : hub;
  const target = route === "direct" ? dest : useHub;
  const list = today.filter((f) => f.city === target);
  const f1 = list.find((f) => f.id === fid) ?? null;
  const go = () => {
    if (!f1) return;
    onDone({ name, dest, via: route === "via" ? useHub : null, f1, f2: route === "via" ? leg2(f1, useHub, dest) : null, bags, special, follow });
  };
  return (
    <div className="ap">
      <div className="blob b1" /><div className="blob b2" />
      <button className="pill" onClick={onBack}>← Dashboard</button>
      <h2 className="big">Where is your bag going?</h2>
      <div className="soft"><h3>1 · Destination</h3>
        <div className="row">{CITIES.map((c) => <button key={c[0]} className={"city " + (dest === c[0] ? "on" : "")} style={{ ["--c" as string]: c[2] }} onClick={() => { setDest(c[0]); setFid(null); }}>{c[1]}</button>)}</div>
        <h3>Route</h3>
        <div className="row"><button className={route === "direct" ? "pill on" : "pill"} onClick={() => { setRoute("direct"); setFid(null); }}>Direct</button>
          <button className={route === "via" ? "pill on" : "pill"} onClick={() => { setRoute("via"); setFid(null); }}>Via a hub (connection)</button>
          {route === "via" && HUBS.filter((h) => h !== dest).map((h) => <button key={h} className={useHub === h ? "pill on" : "pill"} onClick={() => { setHub(h); setFid(null); }}>{cityName(h)}</button>)}</div>
      </div>
      <div className="soft"><h3>2 · Choose your {route === "via" ? `first flight to ${cityName(target)}` : "flight"}</h3>
        <div className="board scroll">{list.map((f) => (
          <div key={f.id} className={"pick " + (f.id === fid ? "on" : "")} onClick={() => setFid(f.id)}>
            <b>{hm(f.dep)}</b><span>{f.code}</span><span>Gate {f.gate}</span><span>{f.pax} passengers</span><Chip f={f} /></div>
        ))}</div>
      </div>
      <div className="soft"><h3>3 · Luggage and passenger</h3>
        <div className="row">
          <button className="pill" onClick={() => setBags(Math.max(1, bags - 1))}>−</button><b className="num">{bags} bag{bags > 1 ? "s" : ""}</b><button className="pill" onClick={() => setBags(Math.min(3, bags + 1))}>+</button>
          <label className="chk"><input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} /> Fragile / oversize</label>
          <input className="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <h3>View</h3>
        <div className="row"><button className={follow ? "pill on" : "pill"} onClick={() => setFollow(true)}>Follow my bag</button><button className={!follow ? "pill on" : "pill"} onClick={() => setFollow(false)}>Whole airport</button></div>
      </div>
      <button className="go" disabled={!f1} onClick={go}>Get my boarding pass →</button>
    </div>
  );
}

function Pass({ trip, onGo, onBack }: { trip: Trip; onGo: () => void; onBack: () => void }) {
  const legs = [trip.f1, ...(trip.f2 ? [trip.f2] : [])];
  return (
    <div className="ap">
      <div className="blob b1" /><div className="blob b2" />
      <button className="pill" onClick={onBack}>← Change</button>
      <h2 className="big">You’re all set, {trip.name}</h2>
      <div className="passes">{legs.map((f, i) => {
        const from = i === 0 ? "BLR" : trip.via!, to = i === 0 ? (trip.via ?? trip.dest) : trip.dest;
        return (
          <div className="ticket" key={i} style={{ ["--c" as string]: color(to) }}>
            <div className="t-main">
              <small>BOARDING PASS · {trip.via ? `LEG ${i + 1} OF 2` : "DIRECT"}</small>
              <div className="t-route"><b>{from}</b><span>✈</span><b>{to}</b></div>
              <p>{f.code} · departs {hm(f.dep)} · gate {f.gate}{f.delay > 15 ? ` · expected +${f.delay} min` : ""}</p>
              <p>{trip.name} · {trip.bags} bag{trip.bags > 1 ? "s" : ""}{trip.special ? " · fragile" : ""}</p>
            </div>
            <div className="t-stub"><div className="barcode" /><small>BAG TAG {to}{String(f.id + 1000).slice(-4)}</small></div>
          </div>);
      })}</div>
      <button className="go" onClick={onGo}>Start the journey ▶</button>
    </div>
  );
}
