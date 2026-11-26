import { useEffect, useRef, useState } from "react";
import { Replay, type Hud } from "./replay";

interface NodeRow { id: number; kind: string; servers: number; arrivals: number; avg_wait_s: number; max_queue: number; utilisation: number }
interface Summary { bags: number; loaded: number; delayed: number; checksum: string; nodes: NodeRow[] }

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(Math.floor(s / 3600) % 24)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

export default function ReplayPage() {
  const host = useRef<HTMLDivElement>(null);
  const replay = useRef<Replay | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [speed, setSpeed] = useState(10);
  const [playing, setPlaying] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const r = new Replay();
    r.onTick = setHud;
    r.init(host.current!)
      .then(() => {
        if (cancelled) r.destroy();
        else replay.current = r;
      })
      .catch(console.error);
    fetch("/summary.json").then((x) => x.json()).then(setSummary).catch(() => {});
    return () => {
      cancelled = true;
      if (replay.current === r) {
        r.destroy();
        replay.current = null;
      }
    };
  }, []);

  const togglePlay = () => {
    const r = replay.current;
    if (!r) return;
    if (!r.playing && r.t >= r.end) r.seek(0);
    r.playing = !r.playing;
    setPlaying(r.playing);
  };
  const changeSpeed = (v: number) => {
    setSpeed(v);
    if (replay.current) replay.current.speed = v;
  };

  return (
    <div className="app">
      <h1>BagFlow replay</h1>
      <div ref={host} className="stage" />
      <div className="controls">
        <button onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
        {[1, 10, 50, 100].map((v) => (
          <button key={v} className={v === speed ? "on" : ""} onClick={() => changeSpeed(v)}>{v}x</button>
        ))}
        <input
          type="range" min={0} max={1000} value={Math.round((hud?.frac ?? 0) * 1000)}
          onChange={(e) => replay.current?.seek(Number(e.target.value) / 1000)}
        />
        <span className="clock">{hud ? clock(hud.t) : "--:--:--"}</span>
      </div>
      {hud && (
        <div className="hud">
          <span>spawned {hud.spawned}</span>
          <span>on conveyors {hud.moving}</span>
          <span className="ok">loaded {hud.loaded}</span>
          <span className="bad">delayed {hud.delayed}</span>
        </div>
      )}
      {summary && (
        <table>
          <thead><tr><th>Node</th><th>Servers</th><th>Arrivals</th><th>Avg wait (s)</th><th>Max queue</th><th>Utilisation</th></tr></thead>
          <tbody>
            {summary.nodes.map((n) => (
              <tr key={n.id}>
                <td>{n.kind}</td><td>{n.servers}</td><td>{n.arrivals}</td>
                <td>{n.avg_wait_s.toFixed(1)}</td><td>{n.max_queue}</td><td>{(n.utilisation * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
