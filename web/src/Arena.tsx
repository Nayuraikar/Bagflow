import { useEffect, useMemo, useRef, useState } from "react";

type Kind = "cpu" | "gpu" | "mpiread" | "mpiscatter";
interface M { name: string; note: string; kind: Kind; lanes: number; w: number; c: string; ins: number; kern: number; out: number }
interface Row { m: M; run: number; total: number; k: number }

// times in ms per 10M bags, from results/kernels_10M_metal.txt, kernels_10M_kaggle.txt, mpi_10M.txt, mpi_50M_kaggle.txt (per 10M)
const mk = (name: string, note: string, kind: Kind, lanes: number, w: number, c: string, ins: number, kern: number, out: number): M =>
  ({ name, note, kind, lanes, w, c, ins, kern, out });

const GROUPS: Record<"mac" | "kaggle", { title: string; ms: M[] }> = {
  mac: {
    title: "Apple M1 (8 cores) + Metal GPU",
    ms: [
      mk("Scalar", "one bag at a time", "cpu", 1, 1, "#64748b", 0, 14.12, 0),
      mk("ILP x4", "4 independent chains in one core", "cpu", 1, 4, "#94a3b8", 0, 13.12, 0),
      mk("NEON SIMD", "4 bags per instruction", "cpu", 1, 4, "#0ea5e9", 0, 6.75, 0),
      mk("OpenMP, 8 threads", "8 chunks at once", "cpu", 8, 1, "#6366f1", 0, 4.3, 0),
      mk("Rayon 4 threads + NEON", "threads x SIMD", "cpu", 4, 4, "#8b5cf6", 0, 1.89, 0),
      mk("Metal GPU", "copy in, thousands of threads, copy out", "gpu", 1, 1, "#ec4899", 3.01, 4.14, 0.26),
      mk("MPI read, 4 ranks", "each rank loads its slice", "mpiread", 4, 1, "#14b8a6", 8.1, 3.74, 0),
      mk("MPI scatter, 4 ranks", "rank 0 sends every slice", "mpiscatter", 4, 1, "#0f766e", 36.3, 3.7, 0),
    ],
  },
  kaggle: {
    title: "Kaggle: Xeon (4 vCPU) + Tesla T4",
    ms: [
      mk("Scalar", "one bag at a time", "cpu", 1, 1, "#64748b", 0, 26.31, 0),
      mk("ILP x4", "4 independent chains in one core", "cpu", 1, 4, "#94a3b8", 0, 30.5, 0),
      mk("AVX2 SIMD", "8 bags per instruction", "cpu", 1, 8, "#0ea5e9", 0, 7.91, 0),
      mk("OpenMP, 4 threads", "4 chunks at once", "cpu", 4, 1, "#6366f1", 0, 7.07, 0),
      mk("Rayon 4 threads + AVX2", "threads x SIMD", "cpu", 4, 8, "#8b5cf6", 0, 3.56, 0),
      mk("CUDA naive atomics", "every thread fights over 3 counters", "gpu", 1, 1, "#f97316", 18.94, 24.81, 2.14),
      mk("CUDA warp shuffle", "reduce inside the warp first", "gpu", 1, 1, "#ec4899", 18.71, 0.83, 2.02),
      mk("CUDA warp + PTX", "same, hand-written PTX", "gpu", 1, 1, "#d946ef", 18.81, 0.83, 2.08),
      mk("MPI read, 4 ranks", "each rank loads its slice", "mpiread", 4, 1, "#14b8a6", 9.48, 5.06, 0),
      mk("MPI scatter, 4 ranks", "rank 0 sends every slice", "mpiscatter", 4, 1, "#0f766e", 171.2, 5.18, 0),
    ],
  },
};

const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k" : Math.round(n).toString();
function fmtT(ms: number): string {
  if (ms < 1) return (ms * 1000).toFixed(0) + " µs";
  if (ms < 1000) return ms.toFixed(ms < 10 ? 1 : 0) + " ms";
  const s = ms / 1000;
  if (s < 120) return s.toFixed(1) + " s";
  const mi = s / 60;
  if (mi < 120) return mi.toFixed(1) + " min";
  const h = mi / 60;
  if (h < 48) return h.toFixed(1) + " h";
  return (h / 24).toFixed(1) + " days";
}

const C = 96, X0 = 215, X1 = 745;

function drawRow(g: CanvasRenderingContext2D, r: Row, i: number, a: number, maxRun: number, scalarTotal: number, bestTotal: number) {
  const { m } = r;
  const y = 8 + i * 54, cw = (X1 - X0) / C;
  const D = (r.run / maxRun) * 12000;
  const p = Math.min(1, a / D);
  const tot = m.ins + m.kern + m.out;
  const fIn = m.ins / tot, fK = m.kern / tot;
  g.textAlign = "left";
  g.fillStyle = "#0f172a"; g.font = "700 13px Inter, system-ui"; g.fillText(m.name, 10, y + 20);
  g.fillStyle = "#64748b"; g.font = "11px Inter, system-ui"; g.fillText(m.note, 10, y + 36);

  let phase = 1, q = 0;
  if (p < fIn) { phase = 0; q = p / fIn; }
  else {
    const pk = p - fIn;
    if (pk < fK) { phase = 1; q = pk / fK; }
    else { phase = 2; q = m.out > 0 ? Math.min(1, (pk - fK) / (1 - fIn - fK)) : 1; }
  }
  const L = Math.max(1, m.lanes), chunk = C / L;
  for (let c = 0; c < C; c++) {
    const x = X0 + c * cw;
    let fill = "#e2e8f0", alpha = 1, glow = false;
    if (phase === 0) {
      const on = m.kind === "mpiread" ? (c % chunk) / chunk < q : c / C < q;
      if (on) fill = "#fbbf24";
    } else {
      fill = m.ins > 0 ? "#f3e2b3" : "#e2e8f0";
      let lit = false;
      if (phase === 2) lit = true;
      else if (m.kind === "gpu") lit = ((c * 37) % 97) / 97 < q;
      else {
        const j = c % chunk, f = Math.floor(q * chunk);
        lit = j < f;
        if (!lit && j < f + m.w && q < 1) { fill = m.c; glow = true; }
      }
      if (lit) { fill = m.c; alpha = 0.6; }
    }
    g.globalAlpha = alpha; g.fillStyle = fill;
    if (glow) { g.shadowColor = m.c; g.shadowBlur = 10; }
    g.fillRect(x, y + 12, cw - 1, 20);
    g.shadowBlur = 0; g.globalAlpha = 1;
  }
  g.fillStyle = "#94a3b8"; g.font = "10px Inter, system-ui";
  const label = p >= 1 ? "done" : phase === 0 ? (m.kind === "gpu" ? "copying over PCIe / to the GPU..." : m.kind === "mpiscatter" ? "rank 0 sending slices one by one..." : "loading data...") : phase === 1 ? "computing" : "copying results back...";
  g.fillText(label, X0, y + 8);
  if (phase === 2 && m.out > 0 && p < 1) { g.fillStyle = "#2dd4bf"; g.fillRect(X0, y + 35, (X1 - X0) * q, 3); }

  const sp = scalarTotal / r.total;
  g.fillStyle = "#0f172a"; g.font = "700 12px Inter, system-ui"; g.fillText(fmtT(r.run) + " per run", 765, y + 20);
  g.fillStyle = "#64748b"; g.font = "11px Inter, system-ui"; g.fillText(fmtT(r.total) + " for " + r.k.toLocaleString() + " runs", 765, y + 36);
  g.textAlign = "right";
  g.font = "700 14px Inter, system-ui"; g.fillStyle = sp > 1.05 ? "#059669" : sp < 0.95 ? "#e11d48" : "#64748b";
  g.fillText(sp.toFixed(sp < 10 ? 2 : 1) + "x", 995, y + 20);
  if (r.total === bestTotal) { g.fillStyle = "#059669"; g.font = "600 11px Inter, system-ui"; g.fillText("fastest overall", 995, y + 36); }
  g.textAlign = "left";
}

export default function Arena({ N }: { N: number }) {
  const [grp, setGrp] = useState<"mac" | "kaggle">("mac");
  const [kExp, setKExp] = useState(0);
  const [reuse, setReuse] = useState(false);
  const [rep, setRep] = useState(0);
  const k = Math.max(1, Math.round(Math.pow(10, kExp)));
  const cv = useRef<HTMLCanvasElement>(null);
  const t0 = useRef(0);
  const rowsRef = useRef<Row[]>([]);

  const rows: Row[] = useMemo(() => {
    const sc = N / 1e7;
    return GROUPS[grp].ms.map((m) => {
      const run = (m.ins + m.kern + m.out) * sc;
      const total = reuse && m.ins > 0 ? (m.ins + m.out + k * m.kern) * sc : k * run;
      return { m, run, total, k };
    });
  }, [grp, N, k, reuse]);
  rowsRef.current = rows;
  useEffect(() => { t0.current = performance.now(); }, [grp, N, rep]);

  useEffect(() => {
    const c = cv.current!, g = c.getContext("2d")!, dpr = window.devicePixelRatio || 1;
    let raf = 0;
    const loop = (now: number) => {
      const rs = rowsRef.current, H = rs.length * 54 + 16;
      if (c.width !== 1000 * dpr || c.height !== H * dpr) { c.width = 1000 * dpr; c.height = H * dpr; c.style.aspectRatio = `1000 / ${H}`; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, 1000, H);
      const maxRun = Math.max(...rs.map((r) => r.run));
      const a = (now - t0.current) % 14000;
      const best = Math.min(...rs.map((r) => r.total));
      rs.forEach((r, i) => drawRow(g, r, i, a, maxRun, rs[0].total, best));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const best = rows.reduce((b, r) => (r.total < b.total ? r : b), rows[0]);

  return (
    <section className="ar">
      <h2>The parallel arena</h2>
      <p className="ar-lead">Every way of parallelising your batch check, racing on the same {fmt(N)} bags. Times are your measured results scaled to the dataset size; the race plays in slow motion.</p>
      <div className="ar-bar">
        <div className="ar-seg">
          {(["mac", "kaggle"] as const).map((x) => (
            <button key={x} className={grp === x ? "on" : ""} onClick={() => setGrp(x)}>{GROUPS[x].title}</button>
          ))}
        </div>
        <label><span>What-if scenarios to evaluate <b>{k.toLocaleString()}</b></span>
          <input type="range" min={0} max={5} step={0.25} value={kExp} onChange={(e) => setKExp(Number(e.target.value))} /></label>
        <label className="ar-chk"><input type="checkbox" checked={reuse} onChange={(e) => setReuse(e.target.checked)} /> Keep the data on the device between runs (copy once)</label>
        <button className="ar-go" onClick={() => setRep(rep + 1)}>Replay race</button>
      </div>
      <div className="ar-headline">
        Scoring {fmt(N)} bags {k.toLocaleString()} {k === 1 ? "time" : "times"}: scalar needs <b>{fmtT(rows[0].total)}</b>, the best method
        (<b>{best.m.name}</b>) needs <b className="g">{fmtT(best.total)}</b>, which is <b>{(rows[0].total / best.total).toFixed(1)}x</b> faster.
      </div>
      <canvas ref={cv} className="ar-cv" />
      <div className="ar-notes">
        <p><b>Amber is data movement.</b> Copying to a GPU or sending slices over MPI is time the CPU methods never pay. With one run, the T4’s 0.83 ms kernel is buried under an 18.7 ms copy. Tick “keep the data on the device” and raise the scenarios: the copy is paid once and the GPU pulls ahead.</p>
        <p><b>Naive vs warp.</b> Same GPU, same copy, but the naive kernel makes every thread update 3 shared counters: 24.8 ms against 0.83 ms. PTX matches warp shuffle because the compiler already emits the same instructions.</p>
        <p className="ar-small">Machines differ, so compare methods only within one group. Times are linear extrapolations of 10M-bag measurements; MPI Kaggle values are the 50M runs divided by five.</p>
      </div>
    </section>
  );
}
