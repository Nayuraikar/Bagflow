import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface NodeRow { id: number; kind: string; servers: number; arrivals: number; avg_wait_s: number; max_queue: number; utilisation: number }
interface Result {
  scenario: string; routing: string; policy: string; pct: number; bags: number; loaded: number; delayed: number;
  delayed_pct: number; tight_delayed_pct: number; mean_s: number; p95_s: number; max_queue: number; sim_seconds: number; nodes: NodeRow[];
}
interface Info { bags: number; scenarios: string[]; routings: string[]; policies: string[] }

const fmt = (v: number, d = 1) => v.toLocaleString(undefined, { maximumFractionDigits: d });

async function runOne(sc: string, routing: string, policy: string, pct: number): Promise<Result> {
  const r = await fetch(`/api/run?scenario=${sc}&routing=${routing}&policy=${policy}&pct=${pct}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default function ScenariosPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [sc, setSc] = useState("Normal");
  const [routing, setRouting] = useState("congestion");
  const [policy, setPolicy] = useState("fcfs");
  const [pct, setPct] = useState(100);
  const [res, setRes] = useState<Result | null>(null);
  const [cmp, setCmp] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/info").then((r) => r.json()).then(setInfo).catch(() => setErr("API not reachable. Start it with: cargo run --release -p bagflow-api"));
  }, []);

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try { await fn(); } catch (e) { setErr(String(e)); }
    setBusy(false);
  };
  const runSingle = () => go(async () => { setCmp([]); setRes(await runOne(sc, routing, policy, pct)); });
  const runCompare = () => go(async () => {
    const all = await Promise.all((info?.routings ?? []).map((r) => runOne(sc, r, policy, pct)));
    setCmp(all);
    setRes(all.find((x) => x.routing === routing) ?? all[0]);
  });

  const sel = (label: string, value: string, set: (v: string) => void, opts: string[]) => (
    <label>{label}<select value={value} onChange={(e) => set(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>
  );

  return (
    <div>
      {err && <p className="bad">{err}</p>}
      {info && (
        <div className="panel row">
          {sel("Scenario", sc, setSc, info.scenarios)}
          {sel("Routing", routing, setRouting, info.routings)}
          {sel("Queue policy", policy, setPolicy, info.policies)}
          <label>Capacity {pct}%<input type="range" min={40} max={150} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} /></label>
          <button disabled={busy} onClick={runSingle}>{busy ? "Running..." : "Run"}</button>
          <button disabled={busy} onClick={runCompare}>Compare 4 routings</button>
          <span className="muted">{fmt(info.bags, 0)} bags, window 17:00-19:00</span>
        </div>
      )}

      {res && (
        <>
          <div className="cards">
            <div><b>{fmt(res.delayed_pct, 2)}%</b><span>delayed</span></div>
            <div><b>{fmt(res.tight_delayed_pct, 2)}%</b><span>tight delayed</span></div>
            <div><b>{fmt(res.mean_s, 0)} s</b><span>mean time</span></div>
            <div><b>{fmt(res.p95_s, 0)} s</b><span>p95 time</span></div>
            <div><b>{fmt(res.max_queue, 0)}</b><span>max queue</span></div>
            <div><b>{fmt(res.sim_seconds, 2)} s</b><span>engine time</span></div>
          </div>
          <table>
            <thead><tr><th>Node</th><th>Servers</th><th>Arrivals</th><th>Avg wait (s)</th><th>Max queue</th><th>Utilisation</th></tr></thead>
            <tbody>
              {res.nodes.map((n) => (
                <tr key={n.id}><td>{n.kind} #{n.id}</td><td>{n.servers}</td><td>{fmt(n.arrivals, 0)}</td>
                  <td>{fmt(n.avg_wait_s)}</td><td>{fmt(n.max_queue, 0)}</td><td>{fmt(n.utilisation * 100, 0)}%</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {cmp.length > 0 && (
        <div className="panel">
          <h3>Delayed % by routing ({cmp[0].scenario}, {cmp[0].policy}, {cmp[0].pct}% capacity)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cmp.map((c) => ({ routing: c.routing, delayed: Number(c.delayed_pct.toFixed(2)), tight: Number(c.tight_delayed_pct.toFixed(2)) }))}>
              <CartesianGrid stroke="#e2e8f0" />
              <XAxis dataKey="routing" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" unit="%" />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
              <Bar dataKey="delayed" name="delayed %" fill="#ef4444" />
              <Bar dataKey="tight" name="tight delayed %" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
