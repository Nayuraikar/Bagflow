import { useEffect, useMemo, useRef, useState } from "react";
import { FLIGHTS, FLY, build, type Bag, type Sched } from "./journeySim";

const CW = 1000, CH = 560;
const rowY = (f: number, F: number) => 80 + (440 / F) * (f + 0.5);
const slot = (k: number, m: number) => 70 + ((k % m) + 0.5) * (450 / m);
const lerp = (a: number, b: number, u: number) => a + (b - a) * Math.max(0, Math.min(1, u));
const frac = (t: number, a: number, b: number) => (b > a ? (t - a) / (b - a) : 1);

function beltPos(f: number, F: number, u: number): [number, number] {
  const y = rowY(f, F), L1 = 60, L2 = Math.abs(y - 280), L3 = 100;
  let d = Math.max(0, Math.min(1, u)) * (L1 + L2 + L3);
  if (d < L1) return [480 + d, 280];
  d -= L1;
  if (d < L2) return [540, 280 + Math.sign(y - 280) * d];
  d -= L2;
  return [540 + d, y];
}

interface Hud { t: number; q: number[]; busy: number[]; boarded: number; missed: number; step: number }

function stepOf(b: Bag, t: number): number {
  if (t < b.a) return 0;
  if (t < b.r1) return 1;
  if (t < b.r2) return 2;
  if (t < b.r3) return 3;
  if (!b.ok || t < b.e3) return 4;
  if (t < b.eu) return 5;
  return 6;
}

function drawBag(c: CanvasRenderingContext2D, x: number, y: number, col: string, red: boolean) {
  c.fillStyle = red ? "#ef4444" : col;
  c.beginPath(); c.roundRect(x - 4.5, y - 3.5, 9, 7, 2); c.fill();
}

function drawPlane(c: CanvasRenderingContext2D, x: number, y: number, col: string, lift: number) {
  c.save(); c.translate(x, y - lift);
  c.fillStyle = col;
  c.beginPath(); c.ellipse(0, 0, 22, 5, 0, 0, 6.3); c.fill();
  c.beginPath(); c.moveTo(-4, 0); c.lineTo(-12, -16); c.lineTo(-6, -16); c.lineTo(6, 0); c.fill();
  c.beginPath(); c.moveTo(-4, 0); c.lineTo(-12, 16); c.lineTo(-6, 16); c.lineTo(6, 0); c.fill();
  c.beginPath(); c.moveTo(-18, 0); c.lineTo(-24, -9); c.lineTo(-19, -9); c.lineTo(-13, 0); c.fill();
  c.restore();
}

function draw(c: CanvasRenderingContext2D, S: Sched, t: number, F: number, W: number): Hud {
  const bg = c.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, "#f8fafc"); bg.addColorStop(1, "#eef2ff");
  c.fillStyle = bg; c.fillRect(0, 0, CW, CH);
  const zone = (x: number, w: number, title: string) => {
    c.fillStyle = "rgba(255,255,255,.8)"; c.strokeStyle = "#e2e8f0"; c.lineWidth = 1;
    c.beginPath(); c.roundRect(x, 8, w, CH - 16, 14); c.fill(); c.stroke();
    c.fillStyle = "#334155"; c.font = "600 13px system-ui"; c.textAlign = "left"; c.fillText(title, x + 12, 30);
  };
  zone(10, 250, "1  Check-in hall"); zone(270, 130, "2  Screening"); zone(410, 100, "3  Sorter");
  zone(520, 180, "4  Loading dock"); zone(710, 280, "5  Flight to destination");

  const m0 = Math.min(W, 12), m1 = Math.min(W, 10);
  const bags = S.bags;
  const q0: Bag[] = [], q1: Bag[] = [], q2: Bag[] = [], q3: Bag[][] = Array.from({ length: F }, () => []);
  const car: Bag[][] = Array.from({ length: F }, () => []);
  const busy0 = new Array<boolean>(m0).fill(false), busy1 = new Array<boolean>(m1).fill(false);
  const boardedF = new Array<number>(F).fill(0);
  let b0 = 0, b1 = 0, b2 = 0, boarded = 0, missed = 0;
  const dots: { x: number; y: number; b: Bag; red: boolean }[] = [];
  const put = (b: Bag, x: number, y: number, red = false) => dots.push({ x, y, b, red });

  // belts
  c.lineCap = "round"; c.setLineDash([]);
  c.strokeStyle = "#cbd5e1"; c.lineWidth = 10;
  c.beginPath(); c.moveTo(380, 280); c.lineTo(470, 280); c.stroke();
  for (let f = 0; f < F; f++) {
    const y = rowY(f, F);
    c.fillStyle = FLIGHTS[f].color + "14";
    c.beginPath(); c.roundRect(526, y - 220 / F * 1 - 4 + 0, 458, 440 / F - 8 + 0, 10); c.fill();
    c.strokeStyle = "#cbd5e1"; c.lineWidth = 8;
    c.beginPath(); c.moveTo(480, 280); c.lineTo(540, 280); c.lineTo(540, y); c.lineTo(645, y); c.stroke();
    c.setLineDash([6, 10]); c.lineDashOffset = -t * 8; c.strokeStyle = FLIGHTS[f].color; c.lineWidth = 2;
    c.beginPath(); c.moveTo(480, 280); c.lineTo(540, 280); c.lineTo(540, y); c.lineTo(645, y); c.stroke();
    c.setLineDash([]);
  }
  c.setLineDash([6, 10]); c.lineDashOffset = -t * 8; c.strokeStyle = "#64748b"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(380, 280); c.lineTo(470, 280); c.stroke(); c.setLineDash([]);

  for (const b of bags) {
    if (t < b.a) continue;
    if (t < b.s0) { q0.push(b); continue; }
    if (t < b.e0) { busy0[b.k0 % m0] = true; b0++; put(b, 205, slot(b.k0, m0)); continue; }
    if (t < b.r1) { const u = frac(t, b.e0, b.r1); put(b, lerp(222, 300, u), lerp(slot(b.k0, m0), 300, u)); continue; }
    if (t < b.s1) { q1.push(b); continue; }
    if (t < b.e1) { busy1[b.k1 % m1] = true; b1++; put(b, 365, slot(b.k1, m1)); continue; }
    if (t < b.r2) { const u = frac(t, b.e1, b.r2); put(b, lerp(380, 460, u), lerp(slot(b.k1, m1), 280, u)); continue; }
    if (t < b.s2) { q2.push(b); continue; }
    if (t < b.e2) { b2++; put(b, 460, 280); continue; }
    if (t < b.r3) { const [x, y] = beltPos(b.f, F, frac(t, b.e2, b.r3)); put(b, x, y); continue; }
    if (!b.ok) { q3[b.f].push(b); if (t > S.dep[b.f]) missed++; continue; }
    if (t < b.s3) { q3[b.f].push(b); continue; }
    const y = rowY(b.f, F);
    if (t < b.e3) { const u = frac(t, b.s3, b.e3); put(b, lerp(640, 675, u), y); continue; }
    boardedF[b.f]++; boarded++;
    if (t < b.su) continue;
    if (t < b.eu) { const u = frac(t, b.su, b.eu); put(b, lerp(850, 935, u), lerp(y, y + 14, u)); continue; }
    car[b.f].push(b);
  }
  q0.sort((p, q) => p.a - q.a); q1.sort((p, q) => p.r1 - q.r1); q2.sort((p, q) => p.r2 - q.r2);
  q0.forEach((b, k) => put(b, 175 - (k % 12) * 12, 60 + Math.floor(k / 12) * 12));
  q1.forEach((b, k) => put(b, 340 - (k % 6) * 10, 60 + (Math.floor(k / 6) % 40) * 10));
  q2.forEach((b, k) => put(b, 430 + (k % 6) * 11, 330 + (Math.floor(k / 6) % 15) * 10));
  for (let f = 0; f < F; f++) {
    const y = rowY(f, F);
    q3[f].sort((p, q) => p.r3 - q.r3).forEach((b, k) =>
      put(b, 640 - (k % 6) * 10, y - 30 + (Math.floor(k / 6) % 8) * 8, !b.ok && t > S.dep[f]));
    car[f].forEach((b, k) => put(b, 925 + (k % 6) * 10, y - 24 + (Math.floor(k / 6) % 6) * 9));
  }

  // machines
  for (let k = 0; k < m0; k++) {
    c.fillStyle = busy0[k] ? "#dbeafe" : "#f1f5f9"; c.strokeStyle = busy0[k] ? "#3b82f6" : "#cbd5e1"; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(190, slot(k, m0) - 11, 32, 22, 6); c.fill(); c.stroke();
  }
  for (let k = 0; k < m1; k++) {
    c.fillStyle = busy1[k] ? "#fef3c7" : "#f1f5f9"; c.strokeStyle = busy1[k] ? "#f59e0b" : "#cbd5e1";
    c.beginPath(); c.roundRect(350, slot(k, m1) - 11, 30, 22, 6); c.fill(); c.stroke();
  }
  c.fillStyle = b2 ? "#dcfce7" : "#f1f5f9"; c.strokeStyle = b2 ? "#22c55e" : "#cbd5e1";
  c.beginPath(); c.roundRect(440, 262, 40, 36, 8); c.fill(); c.stroke();
  c.fillStyle = "#64748b"; c.font = "11px system-ui"; c.textAlign = "left";
  c.fillText(`${W} counter${W > 1 ? "s" : ""}${W > 12 ? " (12 shown)" : ""}`, 20, 548);
  c.fillText(`${W} scanner${W > 1 ? "s" : ""}`, 282, 548);
  c.fillText(`waiting ${q0.length}`, 20, 52);

  // flights
  for (let f = 0; f < F; f++) {
    const y = rowY(f, F), dep = S.dep[f], land = dep + FLY, fl = FLIGHTS[f];
    const u = t < dep ? 0 : t < land ? (t - dep) / FLY : 1;
    drawPlane(c, 690 + u * 160, y, fl.color, t >= dep && t < land ? Math.sin(Math.PI * u) * 14 : 0);
    c.fillStyle = fl.color; c.font = "600 12px system-ui"; c.textAlign = "left";
    c.fillText(`${fl.code} to ${fl.city}`, 722, y - 36 + 0);
    c.fillStyle = "#64748b"; c.font = "11px system-ui";
    c.fillText(t < dep ? `departs in ${Math.ceil(dep - t)} s` : t < land ? "in the air" : "landed", 722, y + 34);
    c.fillText(`on board ${boardedF[f]} / ${S.okCount[f]}`, 790, y + 34);
    c.strokeStyle = fl.color; c.fillStyle = "#fff"; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(895, y - 32, 88, 64, 10); c.fill(); c.stroke();
    c.fillStyle = fl.color; c.font = "600 11px system-ui"; c.fillText(`${fl.city} carousel`, 900, y + 46);
  }

  for (const d of dots) if (d.b.id !== 0) drawBag(c, d.x, d.y, FLIGHTS[d.b.f].color, d.red);
  const me = dots.find((d) => d.b.id === 0);
  if (me) {
    c.strokeStyle = "#0f172a"; c.lineWidth = 2; c.fillStyle = "rgba(250,204,21,.35)";
    c.beginPath(); c.arc(me.x, me.y, 11, 0, 6.3); c.fill(); c.stroke();
    drawBag(c, me.x, me.y, FLIGHTS[me.b.f].color, me.red);
    c.fillStyle = "#0f172a"; c.font = "bold 10px system-ui"; c.textAlign = "center"; c.fillText("YOU", me.x, me.y - 16);
  }
  return {
    t, boarded, missed, step: stepOf(bags[0], t),
    q: [q0.length, q1.length, q2.length, q3.reduce((s, l) => s + l.length, 0)],
    busy: [b0, b1, b2],
  };
}

const STEPS = ["Choose flight", "Check-in", "Screening", "Sorting & belts", "Loading", "In flight", "Delivered"];

function story(step: number, h: Hud, W: number, city: string, missedMine: boolean): [string, string] {
  switch (step) {
    case 0: return ["You book a bag to " + city, "Pick your flight on the left. Other passengers are arriving for every flight, and each bag is coloured by its destination. Press play and follow the ringed bag marked YOU."];
    case 1: return ["Check-in: " + h.q[0] + " bags waiting, " + h.busy[0] + " being checked",
      W === 1 ? "With one counter the check-in line only grows: every bag waits for the one before it. This is serial processing."
        : `Each bag is independent, so ${W} counters check ${W} bags at once. This is thread-level parallelism (Rayon / OpenMP in your engine). Compare the queue with W = 1.`];
    case 2: return ["Screening: " + h.busy[1] + " bags in scanners",
      "Every bag gets the same arithmetic: priority, deadline slack, risk class. That is exactly your batch kernel. SIMD (NEON, AVX2) does 4 to 8 bags per instruction, and a GPU thousands, but copying data to a GPU over PCIe cost 18.7 ms against a 0.83 ms kernel on your T4."];
    case 3: return ["Sorting: each bag is sent to its flight’s belt",
      "The sorter reads the flight and diverts the bag onto that flight’s belt. Choosing which belt or sorter is routing (Dijkstra vs congestion-aware). Belts and sorters are shared, so this part needs coordination, which is why your event loop stays sequential."];
    case 4: return missedMine
      ? ["Your bag missed the plane", "It reached the dock after departure, so it turned red and will be rebooked. Increase the workers and replay: faster check-in gets it there in time."]
      : ["Loading: " + h.boarded + " bags on board", "Loaders put bags on the plane for their flight. Each flight has its own loaders working in parallel, and every bag has to be loaded before the departure time. Red bags missed it."];
    case 5: return ["Flying to " + city, "The plane takes your bag to the destination. On arrival the unloaders run in parallel again, one team per flight."];
    default: return ["Delivered", "Your bag is on the " + city + " carousel. Try W = 1 against W = 8 in the comparison below: same bags, same checks, different waiting time."];
  }
}

export default function JourneyPage() {
  const [n, setN] = useState(120), [F, setF] = useState(4), [W, setW] = useState(8);
  const [myF, setMyF] = useState(0), [speed, setSpeed] = useState(8), [playing, setPlaying] = useState(true);
  const my = Math.min(myF, F - 1);
  const S = useMemo(() => build(n, F, W, my), [n, F, W, my]);
  const B = useMemo(() => build(n, F, 1, my), [n, F, my]);
  const cv = useRef<HTMLCanvasElement>(null);
  const R = useRef({ S, t: 0, playing: true, speed: 8, F, W });
  const [hud, setHud] = useState<Hud>({ t: 0, q: [0, 0, 0, 0], busy: [0, 0, 0], boarded: 0, missed: 0, step: 0 });

  useEffect(() => { R.current.S = S; R.current.F = F; R.current.W = W; R.current.t = 0; }, [S, F, W]);
  useEffect(() => { R.current.playing = playing; R.current.speed = speed; }, [playing, speed]);

  useEffect(() => {
    const c = cv.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = CW * dpr; c.height = CH * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    let raf = 0, last = performance.now(), lastHud = 0;
    const tick = (now: number) => {
      const r = R.current;
      const dt = Math.min(100, now - last) / 1000; last = now;
      if (r.playing) r.t = Math.min(r.S.end + 5, r.t + dt * r.speed);
      const h = draw(ctx, r.S, r.t, r.F, r.W);
      if (now - lastHud > 120) { lastHud = now; setHud(h); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const mine = S.bags[0];
  const fl = FLIGHTS[my];
  const [title, text] = story(hud.step, hud, W, fl.city, !mine.ok);
  const timeline: [string, number][] = [
    ["Booked for " + fl.code + " to " + fl.city, mine.a], ["Checked in", mine.e0], ["Screened", mine.e1],
    ["Sorted onto the " + fl.code + " belt", mine.e2], [mine.ok ? "Loaded on the plane" : "Missed the plane", mine.ok ? mine.e3 : S.dep[my]],
    ["Landed in " + fl.city, S.dep[my] + FLY], ["On the carousel", mine.eu],
  ];
  const speedup = B.lastCheckin / S.lastCheckin;
  const pct = (m: number) => (100 * (n - m) / n).toFixed(0) + "%";

  return (
    <div className="jr">
      <header className="jr-hero">
        <h2>Follow a suitcase from check-in to carousel</h2>
        <p>Watch your bag and everyone else’s move through a baggage system, then change how many things happen in parallel.</p>
      </header>

      <div className="jr-grid">
        <aside className="jr-card">
          <h3>Book your bag</h3>
          <label>Destination
            <select value={my} onChange={(e) => setMyF(Number(e.target.value))}>
              {FLIGHTS.slice(0, F).map((f, i) => <option key={f.code} value={i}>{f.city} ({f.code})</option>)}
            </select>
          </label>
          <h3>Airport load</h3>
          <label>Suitcases <b>{n}</b><input type="range" min={20} max={400} step={10} value={n} onChange={(e) => setN(Number(e.target.value))} /></label>
          <label>Flights / destinations <b>{F}</b><input type="range" min={2} max={5} value={F} onChange={(e) => setF(Number(e.target.value))} /></label>
          <h3>Parallelism</h3>
          <div className="jr-seg">
            <button className={W === 1 ? "on" : ""} onClick={() => setW(1)}>Serial (1 worker)</button>
            <button className={W > 1 ? "on" : ""} onClick={() => setW(8)}>Parallel</button>
          </div>
          <label>Workers per stage <b>{W}</b><input type="range" min={1} max={32} value={W} onChange={(e) => setW(Number(e.target.value))} /></label>
          <h3>Playback</h3>
          <div className="jr-seg">
            <button onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
            <button onClick={() => { R.current.t = 0; setPlaying(true); }}>Restart</button>
          </div>
          <label>Speed <b>{speed}x</b><input type="range" min={1} max={60} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
        </aside>

        <main>
          <div className="jr-steps">
            {STEPS.map((s, i) => <span key={s} className={i === hud.step ? "on" : i < hud.step ? "done" : ""}>{i + 1}. {s}</span>)}
          </div>
          <div className="jr-card jr-stage">
            <canvas ref={cv} style={{ width: "100%", aspectRatio: `${CW} / ${CH}`, display: "block" }} />
            <div className="jr-scrub">
              <span>{hud.t.toFixed(0)} s</span>
              <input type="range" min={0} max={Math.ceil(S.end)} value={hud.t}
                onChange={(e) => { R.current.t = Number(e.target.value); }} />
            </div>
          </div>
          <div className="jr-card jr-story"><h3>{title}</h3><p>{text}</p></div>
        </main>
      </div>

      <div className="jr-cards">
        <div className="jr-card"><b>{S.lastCheckin.toFixed(0)} s</b><span>last bag checked in (serial: {B.lastCheckin.toFixed(0)} s)</span></div>
        <div className="jr-card"><b>{speedup.toFixed(1)}x</b><span>check-in speedup over serial</span></div>
        <div className="jr-card"><b>{S.avgWait.toFixed(0)} s</b><span>average wait at check-in (serial: {B.avgWait.toFixed(0)} s)</span></div>
        <div className="jr-card"><b className={S.missed ? "bad" : "good"}>{pct(S.missed)}</b><span>bags made their flight (serial: {pct(B.missed)})</span></div>
      </div>

      <div className="jr-card">
        <h3>Your bag’s journey</h3>
        <ol className="jr-tl">
          {timeline.map(([l, tm]) => <li key={l} className={hud.t >= tm ? "done" : ""}><b>{Number.isFinite(tm) ? tm.toFixed(0) + " s" : "-"}</b> {l}</li>)}
        </ol>
      </div>
    </div>
  );
}
