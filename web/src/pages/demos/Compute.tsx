import { useState } from "react";
import { dur } from "./airportData";

// M bags/s from results/*.txt (10M-bag runs; MPI = 8 ranks, 50M run). Different machines, so compare with care.
export const METHODS = [
  { n: "Scalar", r: 708, c: "#64748b" }, { n: "ILP x4", r: 762, c: "#94a3b8" }, { n: "SIMD (NEON)", r: 1481, c: "#0ea5e9" },
  { n: "Threads (OpenMP x8)", r: 2328, c: "#6366f1" }, { n: "Threads + SIMD", r: 5289, c: "#8b5cf6" }, { n: "GPU Metal + copy", r: 1349, c: "#ec4899" },
  { n: "GPU CUDA + PCIe copy", r: 463, c: "#f43f5e" }, { n: "GPU CUDA, data resident", r: 12027, c: "#10b981" },
  { n: "MPI read x8", r: 1096, c: "#14b8a6" }, { n: "MPI scatter x8", r: 169, c: "#0f766e" },
];
const WINDOW = 300; // the airport re-plans every 5 minutes
const f = (s: number) => (s < 1e-3 ? (s * 1e6).toFixed(0) + " µs" : s < 1 ? (s * 1e3).toFixed(s < 0.01 ? 1 : 0) + " ms" : dur(s));
const big = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "k" : String(Math.round(n)));

export default function Compute({ N, B, m, setM }: { N: number; B: number; m: number; setM: (i: number) => void }) {
  const [scope, setScope] = useState(1);
  const [kExp, setKExp] = useState(3);
  const SC = [["This scene", N], ["Whole dataset", B], ["10-airport network", B * 10]] as const;
  const bags = SC[scope][1], K = Math.round(Math.pow(10, kExp));
  const time = (r: number) => (K * bags) / (r * 1e6);
  const sel = METHODS[m], slow = Math.max(...METHODS.map((x) => time(x.r)));
  const okN = METHODS.filter((x) => time(x.r) <= WINDOW).length;
  return (
    <div className="soft cp">
      <h3>The decision layer: can the software re-plan in time?</h3>
      <p className="cpn">Staff move the bags, and they are always parallel. BagFlow’s software scores every bag and tries what-if plans. The airport re-plans every <b>5 minutes</b>: a method that needs longer gives stale decisions.</p>
      <div className="row">{SC.map((s, i) => <button key={s[0]} className={i === scope ? "pill on" : "pill"} onClick={() => setScope(i)}>{s[0]} · {big(s[1])} bags</button>)}</div>
      <label className="sl">What-if plans to evaluate each cycle <b>{K.toLocaleString()}</b>
        <input type="range" min={0} max={6} step={0.25} value={kExp} onChange={(e) => setKExp(Number(e.target.value))} /></label>
      <p className="cpn"><b>{okN} of {METHODS.length}</b> methods finish {K.toLocaleString()} plans over {big(bags)} bags inside the 5-minute window. <b>{sel.n}</b> can evaluate up to <b>{big((WINDOW * sel.r * 1e6) / bags)}</b> plans per window.</p>
      {METHODS.map((x, i) => {
        const t = time(x.r), ok = t <= WINDOW;
        return (
          <div key={x.n} className="cprow" onClick={() => setM(i)} style={{ fontWeight: i === m ? 700 : 400 }}>
            <span>{x.n}</span>
            <div className="cpbar"><i style={{ width: Math.max(2, (100 * Math.log10(1 + t * 1000)) / Math.log10(1 + slow * 1000)) + "%", background: ok ? x.c : "#fca5a5" }} />
              <u style={{ left: Math.min(100, (100 * Math.log10(1 + WINDOW * 1000)) / Math.log10(1 + Math.max(slow, WINDOW) * 1000)) + "%" }} /></div>
            <span className={ok ? "ok" : "bad"}>{f(t)} {ok ? "✓" : "✗ stale"}</span>
          </div>
        );
      })}
      <small>The vertical tick is the 5-minute window (log scale). For one flight’s bags every method is far inside it, so the staff queue is the bottleneck. Compute becomes the bottleneck only with many bags and many plans, which is the regime your Rayon, SIMD, GPU and MPI work targets.</small>
    </div>
  );
}
