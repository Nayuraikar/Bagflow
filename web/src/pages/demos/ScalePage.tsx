import { useEffect, useMemo, useRef, useState } from "react";
import Arena from "./Arena";

const BINS = 1440, H = BINS + 720, LAG = 2, WINDOW = 150;
const RATE = [12, 14, 16, 10]; // bags per minute per worker: check-in, screening, sorter, loading
const CITY = [["DEL", "#6366f1"], ["DXB", "#f97316"], ["LHR", "#14b8a6"], ["SIN", "#ec4899"], ["SYD", "#8b5cf6"]];

function stage(inf: Float64Array, cap: number) {
  const out = new Float64Array(H), q = new Float64Array(H);
  let Q = 0;
  for (let i = 0; i < H; i++) { const a = Q + inf[i], o = Math.min(a, cap); out[i] = o; Q = a - o; q[i] = Q; }
  return { out, q };
}
const shift = (a: Float64Array, l: number) => { const r = new Float64Array(H); for (let i = l; i < H; i++) r[i] = a[i - l]; return r; };

function model(N: number, W: number) {
  const arr = new Float64Array(H);
  let s = 0;
  for (let i = 0; i < BINS; i++) { const h = i / 60; arr[i] = 0.15 + Math.exp(-((h - 7) ** 2) / 4) + 1.1 * Math.exp(-((h - 18) ** 2) / 5); s += arr[i]; }
  for (let i = 0; i < BINS; i++) arr[i] = (arr[i] / s) * N;
  const s0 = stage(arr, W * RATE[0]);
  const s1 = stage(shift(s0.out, LAG), W * RATE[1]);
  const s2 = stage(shift(s1.out, LAG), W * RATE[2]);
  const s3 = stage(shift(s2.out, LAG), W * RATE[3]);
  let cum = 0, cumOut = 0, j = 0, onTime = 0, finish = -1;
  const outs = s3.out;
  cumOut = outs[0];
  for (let i = 0; i < BINS; i++) {
    cum += arr[i];
    while (j < H - 1 && cumOut < cum - 1e-6) { j++; cumOut += outs[j]; }
    if (cumOut >= cum - 1e-6 && Math.max(j, i) - i <= WINDOW) onTime += arr[i];
  }
  let c = 0;
  for (let i = 0; i < H; i++) { c += outs[i]; if (c >= N * 0.999) { finish = i; break; } }
  return { arr, flows: [s0.out, s1.out, s2.out, s3.out], qs: [s0.q, s1.q, s2.q, s3.q], onTime: onTime / N, finish, N, W };
}

const fmt = (n: number) => n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k" : Math.round(n).toString();
const dur = (min: number) => min < 0 ? "never in this window" : min < 120 ? Math.round(min) + " min" : min < 2880 ? (min / 60).toFixed(1) + " h" : (min / 1440).toFixed(min > 1440 * 400 ? 0 : 1) + " days";
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m) % 60).padStart(2, "0")}`;

type P = [number, number];
const NODES: P[] = [[130, 300], [340, 190], [560, 330], [770, 210], [900, 300]];
const CTRL: P[][] = [[[230, 360], [250, 190]], [[440, 150], [470, 330]], [[650, 400], [690, 200]]];
function bez(a: P, c1: P, c2: P, b: P, u: number): P {
  const v = 1 - u;
  return [v * v * v * a[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * b[0], v * v * v * a[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * b[1]];
}
const hue = (p: number) => `hsl(${Math.round(150 - 150 * Math.min(1, p))} 80% 52%)`;
const DEST: P[] = CITY.map((_, i) => [925, 70 + i * 100]);

export default function ScalePage() {
  const [N, setN] = useState(5_000_000), [W, setW] = useState(512), [speed, setSpeed] = useState(6), [playing, setPlaying] = useState(true);
  const par = useMemo(() => model(N, W), [N, W]);
  const ser = useMemo(() => model(N, 1), [N]);
  const cv = useRef<HTMLCanvasElement>(null);
  const R = useRef({ par, t: 360, playing: true, speed: 6, W });
  const [t, setT] = useState(360);
  useEffect(() => { R.current.par = par; R.current.W = W; }, [par, W]);
  useEffect(() => { R.current.playing = playing; R.current.speed = speed; }, [playing, speed]);

  useEffect(() => {
    const c = cv.current!, dpr = window.devicePixelRatio || 1;
    c.width = 1000 * dpr; c.height = 540 * dpr;
    const g = c.getContext("2d")!; g.scale(dpr, dpr);
    let raf = 0, last = performance.now(), lastHud = 0;
    const loop = (now: number) => {
      const r = R.current, m = r.par, dt = Math.min(80, now - last) / 1000; last = now;
      if (r.playing) r.t = (r.t + dt * r.speed * 30) % (BINS + 600);
      const i = Math.min(H - 1, Math.floor(r.t)), tt = now / 1000;
      g.clearRect(0, 0, 1000, 540);
      const mx = Math.max(...m.flows.map((f) => f.reduce((a, b) => Math.max(a, b), 0)), 1);
      const k = Math.max(1, m.N / 4000);
      // ribbons + particles
      for (let s = 0; s < 4; s++) {
        const a = NODES[s], b = NODES[s + 1], f = m.flows[s][i];
        const press = Math.min(1, m.qs[s][i] / Math.max(1, r.W * RATE[s] * 20));
        if (s < 3) {
          const [c1, c2] = CTRL[s];
          g.lineCap = "round";
          g.strokeStyle = "rgba(148,163,184,.25)"; g.lineWidth = 14;
          g.beginPath(); g.moveTo(a[0], a[1]); g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b[0], b[1]); g.stroke();
          g.strokeStyle = hue(press); g.globalAlpha = 0.25 + 0.7 * Math.min(1, f / mx); g.lineWidth = 3 + 15 * Math.min(1, f / mx);
          g.beginPath(); g.moveTo(a[0], a[1]); g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b[0], b[1]); g.stroke(); g.globalAlpha = 1;
          const cnt = Math.min(70, Math.ceil((f / mx) * 70));
          for (let p = 0; p < cnt; p++) {
            const u = ((tt * 0.35 + p / cnt) % 1), [x, y] = bez(a, c1, c2, b, u);
            g.fillStyle = "#fff"; g.shadowColor = hue(press); g.shadowBlur = 10;
            g.beginPath(); g.arc(x, y, 2.6, 0, 6.3); g.fill(); g.shadowBlur = 0;
          }
        } else {
          for (let d = 0; d < 5; d++) {
            const dest = DEST[d], share = f / 5 / (mx / 5);
            g.strokeStyle = CITY[d][1]; g.globalAlpha = 0.18 + 0.5 * Math.min(1, share * 0.9); g.lineWidth = 2 + 6 * Math.min(1, share);
            g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + dest[0]) / 2, dest[1], dest[0], dest[1]); g.stroke(); g.globalAlpha = 1;
            const cnt = Math.min(14, Math.ceil(share * 14));
            for (let p = 0; p < cnt; p++) {
              const u = ((tt * 0.3 + p / cnt + d * 0.17) % 1), x = (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * (a[0] + dest[0]) / 2 + u * u * dest[0], y = (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * dest[1] + u * u * dest[1];
              g.fillStyle = CITY[d][1]; g.beginPath(); g.arc(x, y, 2.6, 0, 6.3); g.fill();
            }
          }
        }
      }
      // nodes
      const names = ["Check-in", "Screening", "Sorter", "Loading"];
      for (let s = 0; s < 4; s++) {
        const [x, y] = NODES[s], q = m.qs[s][i], press = Math.min(1, q / Math.max(1, r.W * RATE[s] * 20));
        const halo = 46 + 26 * Math.min(1, Math.log10(q + 1) / 7);
        const rg = g.createRadialGradient(x, y, 10, x, y, halo);
        rg.addColorStop(0, hue(press) + "55"); rg.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, halo, 0, 6.3); g.fill();
        g.shadowColor = "rgba(30,41,59,.25)"; g.shadowBlur = 18; g.shadowOffsetY = 6;
        g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, 38, 0, 6.3); g.fill();
        g.shadowBlur = 0; g.shadowOffsetY = 0;
        g.strokeStyle = hue(press); g.lineWidth = 4; g.beginPath(); g.arc(x, y, 38, -1.57, -1.57 + 6.28 * Math.min(1, m.flows[s][i] / Math.max(1, r.W * RATE[s]))); g.stroke();
        g.fillStyle = "#0f172a"; g.textAlign = "center"; g.font = "700 13px Inter, system-ui"; g.fillText(names[s], x, y - 2);
        g.font = "11px Inter, system-ui"; g.fillStyle = "#64748b"; g.fillText(`${fmt(r.W)} workers`, x, y + 13);
        g.font = "600 12px Inter, system-ui"; g.fillStyle = q > 1000 ? "#dc2626" : "#16a34a";
        g.fillText(q > 1 ? `${fmt(q)} waiting` : "no queue", x, y + halo + 8);
      }
      CITY.forEach(([n, col], d) => {
        const [x, y] = DEST[d]; let done = 0; for (let j = 0; j <= i; j++) done += m.flows[3][j] / 5;
        g.fillStyle = col; g.beginPath(); g.arc(x, y, 26, 0, 6.3); g.fill();
        g.fillStyle = "#fff"; g.font = "700 12px Inter, system-ui"; g.textAlign = "center"; g.fillText(n, x, y - 1);
        g.font = "10px Inter, system-ui"; g.fillText(fmt(done), x, y + 12);
      });
      g.fillStyle = "#475569"; g.font = "11px Inter, system-ui"; g.textAlign = "left";
      g.fillText(`each glowing dot stands for about ${fmt(k)} bags`, 24, 524);
      if (now - lastHud > 100) { lastHud = now; setT(r.t); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const i = Math.min(H - 1, Math.floor(t));
  let done = 0; for (let j = 0; j <= i; j++) done += par.flows[3][j];
  const serFinish = ser.finish >= 0 ? ser.finish : (N / RATE[0]);
  const pct = (v: number) => (v * 100).toFixed(v > 0.995 || v < 0.005 ? 1 : 0) + "%";

  return (
    <div className="sc">
      <div className="sc-blob b1" /><div className="sc-blob b2" /><div className="sc-blob b3" />
      <section className="sc-hero">
        <p className="sc-kicker">BagFlow at scale</p>
        <h1>{fmt(N)} suitcases.<br /><span>{par.W === 1 ? "One" : fmt(par.W)} {par.W === 1 ? "worker" : "workers in parallel"}.</span></h1>
        <p className="sc-lead">Slide the dataset up to 50 million bags and the workers from 1 to 4096. See where the queues bloom and how many bags still make their flight.</p>
      </section>

      <div className="sc-scene"><canvas ref={cv} /><div className="sc-clock">{clock(t)}<small>{fmt(done)} of {fmt(N)} loaded</small></div></div>

      <div className="sc-dock">
        <label><span>Bags in the dataset <b>{fmt(N)}</b></span>
          <input type="range" min={0} max={100} value={Math.round(Math.log10(N / 1e5) / Math.log10(500) * 100)}
            onChange={(e) => setN(Math.round(1e5 * Math.pow(500, Number(e.target.value) / 100) / 1e5) * 1e5)} /></label>
        <label><span>Parallel workers <b>{fmt(W)}</b></span>
          <input type="range" min={0} max={100} value={Math.round(Math.log2(W) / 12 * 100)}
            onChange={(e) => setW(Math.max(1, Math.round(Math.pow(2, Number(e.target.value) / 100 * 12))))} /></label>
        <label><span>Speed <b>{speed}x</b></span><input type="range" min={1} max={30} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
        <button onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
        <button className="ghost" onClick={() => setW(1)}>Serial</button>
        <button className="ghost" onClick={() => setW(512)}>512</button>
        <button className="ghost" onClick={() => setW(4096)}>4096</button>
      </div>

      <section className="sc-stats">
        <div><small>Bags that make their flight</small><b className={par.onTime > 0.95 ? "g" : "r"}>{pct(par.onTime)}</b><em>serial: {pct(ser.onTime)}</em></div>
        <div><small>Time to clear everything</small><b>{dur(par.finish)}</b><em>serial: {dur(serFinish)}</em></div>
        <div><small>Speedup</small><b>{(serFinish / Math.max(1, par.finish)).toFixed(0)}x</b><em>ideal: {fmt(W)}x</em></div>
        <div><small>Peak queue (check-in)</small><b>{fmt(Math.max(...par.qs[0]))}</b><em>serial: {fmt(Math.max(...ser.qs[0]))}</em></div>
      </section>

      <Arena N={N} />
    </div>
  );
}
