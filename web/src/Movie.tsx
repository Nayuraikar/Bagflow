import Compute from "./Compute";
import { AircraftStrip } from "./PlaneArt";
import { useEffect, useMemo, useRef, useState } from "react";
import { CITIES, FH, cityName, color, dur, hm, type Flight, type Stats, type Trip } from "./airportData";

interface St { name: string; svc: number; W: number; max: number; c: string; ic: string; txt: string }
const ST: Record<string, St> = {
  checkin: { name: "Check-in", svc: 40, W: 150, max: 300, c: "#6366f1", ic: "🧳", txt: "Each bag is weighed, tagged and given its flight. Bags are independent, so every extra counter checks one more bag at the same time." },
  security: { name: "Security screening", svc: 8, W: 40, max: 100, c: "#f59e0b", ic: "🛃", txt: "Bags are X-rayed and risk-scored: priority, deadline slack, class. This is the batch kernel of the project, the same arithmetic on every bag." },
  sorting: { name: "Sorting", svc: 1.5, W: 20, max: 60, c: "#10b981", ic: "🔀", txt: "Diverters push each bag onto the belt of its flight. Diverters and belts are shared, so routing and queue rules matter here." },
  loading: { name: "Loading", svc: 6, W: 60, max: 150, c: "#0ea5e9", ic: "🛫", txt: "Loaders put bags on the aircraft. Each bag must be aboard before the loading deadline, 20 minutes before departure." },
  transfer: { name: "Transfer at the hub", svc: 30, W: 30, max: 80, c: "#ec4899", ic: "🔁", txt: "Connecting bags move from the arriving plane to the next one. The minimum connection time is 45 minutes, and a delayed first flight eats into it." },
  unload: { name: "Unloading and carousel", svc: 5, W: 8, max: 20, c: "#8b5cf6", ic: "🛄", txt: "Unloaders take the bags off the plane and send them to the carousel. More unloaders means a shorter wait for every passenger." },
};
const SHORT: Record<string, string> = { checkin: "Check-in", security: "Security", sorting: "Sorting", loading: "Loading", transfer: "Transfer", unload: "Carousel" };
type Sc = { k: "stage"; s: string; f: Flight } | { k: "flight"; f: Flight; from: string; to: string } | { k: "end" };
const FM = 0.37; // where in the queue your bag sits
const TARGET: Record<string, number> = { checkin: 45, security: 40, sorting: 30, loading: 35, transfer: 35, unload: 15 }; // minutes at real staffing
function lane(g: CanvasRenderingContext2D, y: number, H: number, title: string, W: number, done: number, K: number, my: number, c: string, follow: boolean) {
  g.fillStyle = "#0f172a"; g.font = "700 14px Inter,system-ui"; g.textAlign = "left"; g.fillText(title, 24, y + 22);
  const top = y + 36, hh = H - 48;
  const lay = (x: number, w: number) => { const cols = Math.max(1, Math.ceil(Math.sqrt(K * w / hh))); return { x, cols, s: Math.min(w / cols, hh / Math.ceil(K / cols)) }; };
  const Q = lay(24, 310), Dn = lay(690, 290);
  const at = (L: { x: number; cols: number; s: number }, i: number): [number, number] => [L.x + (i % L.cols) * L.s + L.s / 2, top + Math.floor(i / L.cols) * L.s + L.s / 2];
  const dot = (i: number, x: number, y2: number, r: number) => {
    g.fillStyle = CITIES[(i * 7 + 3) % 10][2]; g.beginPath(); g.arc(x, y2, r, 0, 6.3); g.fill();
    if (follow && i === my) { g.strokeStyle = "#0f172a"; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y2, r + 4, 0, 6.3); g.stroke(); }
  };
  const nd = Math.floor(done);
  for (let i = nd; i < K; i++) { const [x, y2] = at(Q, i); dot(i, x, y2, Math.max(1.5, Q.s * .32)); }
  for (let i = 0; i < nd; i++) { const [x, y2] = at(Dn, i); dot(i, x, y2, Math.max(1.5, Dn.s * .32)); }
  const Wd = Math.min(W, 40), cols = Math.ceil(Math.sqrt(Wd * 1.6)), rows = Math.ceil(Wd / cols), cs = Math.min(270 / cols, hh / rows, 36), sx = 365 + (270 - cols * cs) / 2;
  for (let j = 0; j < Wd; j++) {
    const x = sx + (j % cols) * cs, y2 = top + Math.floor(j / cols) * cs, busy = nd + j < K;
    g.fillStyle = busy ? c + "30" : "#f1f5f9"; g.strokeStyle = busy ? c : "#cbd5e1"; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(x + 2, y2 + 2, cs - 4, cs - 4, 7); g.fill(); g.stroke();
    if (busy) dot(nd + j, x + cs / 2, y2 + cs / 2, Math.max(2, cs * .2));
  }
  g.fillStyle = "#94a3b8"; g.font = "12px Inter,system-ui"; g.fillText("waiting", 24, y + H - 4); g.fillText(`${W > 40 ? "40 of " : ""}${W} in service`, 365, y + H - 4); g.fillText("done", 690, y + H - 4);
}

export default function Movie({ trip, today, stats, onExit }: { trip: Trip; today: Flight[]; stats: Stats; onExit: () => void }) {
  const { f1, f2, via, dest } = trip;
  const [i, setI] = useState(0), [fast, setFast] = useState(false), [auto, setAuto] = useState(true), [playing, setPlaying] = useState(true), [p, setP] = useState(0);
  const [Ws, setWs] = useState<Record<string, number>>({});
  const [meth, setMeth] = useState(0);
  const win = useMemo(() => today.filter((x) => Math.abs(x.dep - f1.dep) <= 60).reduce((a, x) => a + x.bags, 0), [today, f1]);
  const last = f2 ?? f1;
  const scenes = useMemo<Sc[]>(() => [
    { k: "stage", s: "checkin", f: f1 }, { k: "stage", s: "security", f: f1 }, { k: "stage", s: "sorting", f: f1 }, { k: "stage", s: "loading", f: f1 },
    { k: "flight", f: f1, from: "BLR", to: via ?? dest },
    ...(f2 && via ? [{ k: "stage", s: "transfer", f: f2 } as Sc, { k: "flight", f: f2, from: via, to: dest } as Sc] : []),
    { k: "stage", s: "unload", f: last }, { k: "end" },
  ], [f1, f2, via, dest, last]);
  const info = (s: string) => {
    const st = ST[s], N = s === "unload" ? last.bags * trip.bags + 40 : s === "transfer" ? Math.max(60, Math.round(win * .3)) : win;
    const W0 = Math.max(1, Math.ceil(N * st.svc / (TARGET[s] * 60))), W = Ws[s] ?? W0 * 2;
    const Tp = N * st.svc / W, Ts = N * st.svc / W0;
    return { st, W, W0, N, Tp, Ts, myP: FM * Tp + st.svc, myS: FM * Ts + st.svc };
  };
  const sc = scenes[i];
  const R = useRef({ p: 0, i: 0, fast: false, playing: true, auto: true, hold: 0 });
  const V = useRef({ sc, W: 1, W0: 1, follow: trip.follow, n: scenes.length, stage: null as ReturnType<typeof info> | null });
  const stg = sc.k === "stage" ? info(sc.s) : null;
  V.current = { sc, W: stg ? stg.W : 1, W0: stg ? stg.W0 : 1, follow: trip.follow, n: scenes.length, stage: stg };
  R.current.fast = fast; R.current.playing = playing; R.current.auto = auto;
  useEffect(() => { R.current.i = i; R.current.p = 0; R.current.hold = 0; setP(0); }, [i]);
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = cv.current;
    let raf = 0, prev = performance.now(), lastHud = 0;
    const loop = (now: number) => {
      const r = R.current, v = V.current, dt = Math.min(80, now - prev) / 1000; prev = now;
      if (r.playing && r.p < 1) r.p = Math.min(1, r.p + dt / (r.fast ? 3.5 : 13));
      if (r.p >= 1 && r.playing && r.auto && r.i < v.n - 2) { r.hold += dt; if (r.hold > (r.fast ? .6 : 1.8)) { r.hold = 0; setI((x) => Math.min(v.n - 1, x + 1)); } }
      try {
      if (c && v.sc.k === "stage" && v.stage) {
        const dpr = window.devicePixelRatio || 1;
        if (c.width !== 1000 * dpr) { c.width = 1000 * dpr; c.height = 440 * dpr; }
        const g = c.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, 1000, 440);
        const K = 400, my = Math.floor(FM * K), col = v.stage.st.c;
        const mx = Math.max(v.W, v.W0);
        lane(g, 0, 220, `Your staffing · ${v.W} workers`, v.W, r.p * K * v.W / mx, K, my, col, v.follow);
        g.strokeStyle = "#e2e8f0"; g.beginPath(); g.moveTo(24, 220); g.lineTo(976, 220); g.stroke();
        lane(g, 220, 220, `As staffed today · ${v.W0} workers`, v.W0, r.p * K * v.W0 / mx, K, my, col, v.follow);
      }
      } catch (e) {
        console.error("scene draw failed:", e);
        const gg = c?.getContext("2d");
        if (gg) { gg.setTransform(1, 0, 0, 1, 0, 0); gg.fillStyle = "#b91c1c"; gg.font = "20px monospace"; gg.fillText("draw error: " + String(e), 20, 60); }
      }
      if (now - lastHud > 70) { lastHud = now; setP(r.p); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [i]);

  const pre = ["checkin", "security", "sorting", "loading"].map((s) => info(s));
  const done = scenes.slice(0, i + 1).filter((s) => s.k === "stage" && pre.some((x) => x.st === ST[s.s]));
  const upto = Math.min(pre.length, done.length), BUD = 130 * 60;
  const cumP = pre.slice(0, upto).reduce((a, x) => a + x.myP, 0), cumS = pre.slice(0, upto).reduce((a, x) => a + x.myS, 0);
  const who = trip.follow ? "Your bag" : "A typical bag";
  const hAvg = stats.hourDelay.map((d, k) => d / Math.max(1, stats.hourN[k]));

  const body = () => {
    if (sc.k === "stage") {
      const x = V.current.stage!;
      const conn = f2 && via ? (f2.dep + f2.delay) - (f1.dep + f1.delay + Math.round(FH[via] * 60)) : 0;
      const room = conn - 15;
      return (<>
        <div className="soft"><canvas ref={cv} className="mv-cv" /></div>
        <div className="mv-cmp">
          <div className="soft par"><small>YOUR STAFFING · {x.W} workers</small><b>{dur(x.Tp)}</b><em>{Math.floor(p * x.N).toLocaleString()} of {x.N.toLocaleString()} bags done · {who.toLowerCase()} leaves after {dur(x.myP)}</em></div>
          <div className="soft"><small>AS STAFFED TODAY · {x.W0} workers</small><b>{dur(x.Ts)}</b><em>{who.toLowerCase()} leaves after {dur(x.myS)}</em></div>
        </div>
        <Compute N={x.N} B={stats.bags} m={meth} setM={setMeth} />
        <label className="sl">Workers in this stage <b>{x.W}</b><input type="range" min={1} max={x.W0 * 4} value={x.W} onChange={(e) => { setWs({ ...Ws, [sc.s]: Number(e.target.value) }); R.current.p = 0; }} /></label>
        {sc.s === "transfer" && <div className="soft verdict"><h3>Can the bag make the connection?</h3>
          <p>First flight arrives {hm(f1.dep + f1.delay + FH[via!] * 60)} ({f1.delay > 15 ? `${f1.delay} min late` : "on time"}), next flight leaves {hm(f2!.dep + f2!.delay)}. Connection time <b>{conn} min</b>, minus 15 min loading cutoff leaves <b>{room} min</b>.</p>
          <p className={x.myP / 60 <= room ? "ok" : "bad"}>Your staffing: bag ready in {dur(x.myP)} → {x.myP / 60 <= room ? "makes it ✓" : "misses it ✗"}</p>
          <p className={x.myS / 60 <= room ? "ok" : "bad"}>As staffed today: bag ready in {dur(x.myS)} → {x.myS / 60 <= room ? "makes it ✓" : "misses it ✗"}</p></div>}
        {["checkin", "security", "sorting", "loading"].includes(sc.s) && <div className="soft verdict"><h3>Time budget before the loading deadline (130 min)</h3>
          <div className="meter"><i className="p" style={{ width: Math.min(100, 100 * cumP / BUD) + "%" }} /></div><p className={cumP <= BUD ? "ok" : "bad"}>Your staffing so far: {dur(cumP)} {cumP <= BUD ? "✓" : "✗ too slow"}</p>
          <div className="meter"><i className="s" style={{ width: Math.min(100, 100 * cumS / BUD) + "%" }} /></div><p className={cumS <= BUD ? "ok" : "bad"}>As staffed today so far: {dur(cumS)} {cumS <= BUD ? "✓" : "✗ too slow"}</p></div>}
      </>);
    }
    if (sc.k === "flight") {
      const f = sc.f, g0 = f.delay > 15 ? Math.min(.35, f.delay / 200) : 0, q = Math.max(0, (p - g0) / (1 - g0));
      const hr = Math.min(23, Math.floor(f.dep / 60));
      return (<>
        <div className="soft fl"><div className="sky"><span className="pt">{sc.from}</span><span className="pt e">{sc.to}</span><div className="track" />
          <span className="plane" style={{ left: 4 + q * 84 + "%", top: 40 - Math.sin(Math.PI * q) * 28 }}>✈️</span></div>
          <p className="big2">{p < g0 ? `Held at the gate… ${f.delay} min late` : q < 1 ? `In the air to ${cityName(sc.to)}` : `Landed in ${cityName(sc.to)}`}</p>
          <div className="rates"><span><b>{hm(f.dep)}</b>scheduled</span><span><b>{hm(f.dep + f.delay)}</b>actual departure</span><span><b>{hm(f.dep + f.delay + FH[sc.to] * 60)}</b>arrival</span><span><b>{f.delay > 15 ? f.cause : "none"}</b>cause</span></div></div>
        <div className="soft"><h3>Why delays build up during the day (average delay by departure hour)</h3>
          <div className="bars">{hAvg.map((v, k) => <div key={k} className={k === hr ? "hi" : ""}><i style={{ height: (100 * Math.max(0, v)) / Math.max(1, ...hAvg) + "%", background: "#f97316" }} /><small>{k}</small></div>)}</div>
          <small>An aircraft flies several legs a day, so a morning delay is inherited by the next flight. Your flight leaves at hour {hr}, where the average delay is {hAvg[hr].toFixed(0)} min.</small></div>
      </>);
    }
    const sP = pre.reduce((a, x) => a + x.myP, 0), sS = pre.reduce((a, x) => a + x.myS, 0);
    return (<div className="mv-cmp">
      <div className="soft par"><small>YOUR BAG, YOUR STAFFING</small><b>{sP / 60 <= 130 ? "Made the flight ✓" : "Missed ✗"}</b><em>{dur(sP)} in check-in, screening, sorting and loading; {trip.dest} reached{f1.delay > 15 ? `; flight delayed ${f1.delay} min (${f1.cause.toLowerCase()})` : ""}</em></div>
      <div className="soft ser"><small>AS STAFFED TODAY</small><b>{sS / 60 <= 130 ? "Made the flight ✓" : "Missed ✗"}</b><em>{dur(sS)} before loading with the default staffing</em></div>
    </div>);
  };

  return (
    <div className="ap mv">
      <div className="blob b1" /><div className="blob b2" />
      <div className="mv-top">
        <button className="pill" onClick={onExit}>← Exit</button>
        <div className="dots">{scenes.map((_, j) => <i key={j} className={j === i ? "on" : j < i ? "done" : ""} onClick={() => setI(j)} />)}</div>
        <button className="pill" onClick={() => setI(Math.max(0, i - 1))}>◀</button>
        <button className="pill" onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
        <button className="pill" onClick={() => setI(Math.min(scenes.length - 1, i + 1))}>Next ▶</button>
        <label className="chk"><input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} /> Fast view</label>
        <label className="chk"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-next</label>
      </div>
      <AircraftStrip
        labels={scenes.map((s) => (s.k === "stage" ? SHORT[s.s] : s.k === "flight" ? "Flight" : "Arrived"))}
        i={i} onSelect={setI} hue={color(dest)}
        bags={sc.k === "stage" ? ({ checkin: 0, security: 0, sorting: 0, loading: Math.round(14 * p), transfer: 14, unload: Math.round(14 * (1 - p)) } as Record<string, number>)[sc.s] : sc.k === "flight" ? 14 : 0}
        tile={{ n: (stg ? stg.N : f1.bags).toLocaleString(), label: "bags around your flight", name: `${f1.code} to ${cityName(dest)}` }}
        tag={{ who: trip.name, route: `BLR → ${via ? via + " → " : ""}${dest}`, no: `${dest}${String(f1.id + 1000).slice(-4)}` }}
      />
      <h2 className="big">{sc.k === "stage" ? `${ST[sc.s].ic} ${ST[sc.s].name}` : sc.k === "flight" ? `✈️ ${sc.f.code}  ${sc.from} → ${sc.to}` : "🎉 Journey complete"}</h2>
      <p className="lead">{sc.k === "stage" ? `${ST[sc.s].txt} ${sc.s === "unload" ? "" : `${V.current.stage!.N.toLocaleString()} bags are competing for these ${ST[sc.s].name.toLowerCase()} resources around your flight (each dot stands for about ${Math.round(V.current.stage!.N / 400)}).`}` : sc.k === "flight" ? "The plane takes your bag to the next airport. Departure delay comes from the data: late inbound aircraft, weather, traffic control and more." : "Same bags, same airport, only the amount of parallel work changed."}</p>
      {body()}
    </div>
  );
}
