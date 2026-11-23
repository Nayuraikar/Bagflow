import { Application, Graphics, Text } from "pixi.js";

export interface NodeInfo { id: number; kind: string; servers: number; x: number; y: number }
export interface EdgeInfo { from: number; to: number; travel_ms: number }

export interface Hud {
  t: number;
  frac: number;
  spawned: number;
  moving: number;
  loaded: number;
  delayed: number;
  perNode: number[];
}

// indexed by BagState value (0..11)
const STATE_COLORS = [
  0x94a3b8, // CheckedIn
  0x38bdf8, // Identified
  0xfbbf24, // Screening
  0x2dd4bf, // Cleared
  0xa78bfa, // InTransit
  0x818cf8, // Sorted
  0xfb923c, // TransferPending
  0x84cc16, // Loading
  0x22c55e, // Loaded
  0xef4444, // Delayed
  0xec4899, // Misrouted
  0x3b82f6, // HeldForInspection
];
const LABELS: Record<string, string> = {
  CheckIn: "Check-in", Identification: "Identify", Screening: "Screening",
  Conveyor: "Conveyor", Sorter: "Sorter", Loading: "Loading",
};
const W = 1000;
const H = 380;
const FADE_MS = 3000;

function mix(a: number, b: number, f: number): number {
  const r = ((a >> 16) & 255) * (1 - f) + ((b >> 16) & 255) * f;
  const g = ((a >> 8) & 255) * (1 - f) + ((b >> 8) & 255) * f;
  const bl = (a & 255) * (1 - f) + (b & 255) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
function heat(r: number): number {
  return r < 0.5 ? mix(0x22c55e, 0xfbbf24, r * 2) : mix(0xfbbf24, 0xef4444, (r - 0.5) * 2);
}

export class Replay {
  app = new Application();
  onTick: (h: Hud) => void = () => {};
  speed = 10;
  playing = true;
  t = 0;
  start = 0;
  end = 0;

  private nodes: NodeInfo[] = [];
  private edges: EdgeInfo[] = [];
  private nb = 0;
  private arrive = new Float64Array(0); // [bag * nodes + node] first arrival time
  private endT = new Float64Array(0);
  private stT: number[][] = [];
  private stS: number[][] = [];
  private nodeG = new Graphics();
  private bagG = new Graphics();
  private labels: Text[] = [];
  private labelCache: string[] = [];
  private lastHud = 0;

  async init(host: HTMLElement) {
    await this.app.init({ width: W, height: H, background: "#0f172a", antialias: true });
    host.appendChild(this.app.canvas);

    const [net, buf] = await Promise.all([
      fetch("/network.json").then((r) => r.json()),
      fetch("/events.bin").then((r) => r.arrayBuffer()),
    ]);
    this.nodes = net.nodes;
    this.edges = net.edges;
    const nn = this.nodes.length;

    // events: 12-byte records -> 3 x u32 (time, bag, from | to<<8 | node<<16)
    const n = Number(new DataView(buf).getBigUint64(8, true));
    const ev = new Uint32Array(buf, 16, n * 3);
    let maxBag = 0;
    for (let i = 0; i < n; i++) maxBag = Math.max(maxBag, ev[3 * i + 1]);
    this.nb = maxBag + 1;
    this.arrive = new Float64Array(this.nb * nn).fill(Infinity);
    this.endT = new Float64Array(this.nb);
    this.stT = Array.from({ length: this.nb }, () => []);
    this.stS = Array.from({ length: this.nb }, () => []);
    for (let i = 0; i < n; i++) {
      const t = ev[3 * i], b = ev[3 * i + 1], p = ev[3 * i + 2];
      const to = (p >> 8) & 255, node = (p >> 16) & 255;
      const k = b * nn + node;
      if (this.arrive[k] === Infinity) this.arrive[k] = t;
      this.endT[b] = t;
      this.stT[b].push(t);
      this.stS[b].push(to);
    }
    let s = Infinity, e = 0;
    for (let b = 0; b < this.nb; b++) {
      s = Math.min(s, this.arrive[b * nn]);
      e = Math.max(e, this.endT[b]);
    }
    this.start = s - 2000;
    this.end = e + FADE_MS;
    this.t = this.start;

    // static layer: conveyors
    const edgeG = new Graphics();
    for (const ed of this.edges) {
      const a = this.nodes[ed.from], b = this.nodes[ed.to];
      edgeG.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 6, color: 0x334155 });
    }
    this.app.stage.addChild(edgeG, this.nodeG, this.bagG);
    for (const nd of this.nodes) {
      const tx = new Text({ text: "", style: { fill: 0xe2e8f0, fontSize: 13, fontFamily: "system-ui", align: "center" } });
      tx.anchor.set(0.5, 0);
      tx.position.set(nd.x, nd.y + 44);
      this.app.stage.addChild(tx);
      this.labels.push(tx);
      this.labelCache.push("");
    }

    this.app.ticker.add((tk) => {
      if (this.playing) {
        this.t += tk.deltaMS * this.speed;
        if (this.t >= this.end) {
          this.t = this.end;
          this.playing = false;
        }
      }
      this.draw();
    });
  }

  seek(frac: number) {
    this.t = this.start + frac * (this.end - this.start);
  }

  private draw() {
    const T = this.t;
    const nn = this.nodes.length;
    const counts = new Array<number>(nn).fill(0);
    let spawned = 0, moving = 0, loaded = 0, delayed = 0;
    const g = this.bagG;
    g.clear();

    for (let b = 0; b < this.nb; b++) {
      const base = b * nn;
      if (T < this.arrive[base]) continue;
      spawned++;
      const ts = this.stT[b], ss = this.stS[b];
      const finished = T >= this.endT[b];
      if (finished) {
        if (ss[ss.length - 1] === 8) loaded++;
        else delayed++;
        if (T > this.endT[b] + FADE_MS) continue;
      }

      let k = 0;
      for (let j = 1; j < nn; j++) if (this.arrive[base + j] <= T) k = j;
      const here = this.nodes[k];
      let x = here.x, y = here.y;
      let inNode = true;
      if (k < nn - 1) {
        const dep = this.arrive[base + k + 1] - this.edges[k].travel_ms;
        if (T >= dep) {
          inNode = false;
          const f = Math.min(1, (T - dep) / this.edges[k].travel_ms);
          const nx = this.nodes[k + 1];
          x = here.x + (nx.x - here.x) * f;
          y = here.y + (nx.y - here.y) * f;
        }
      }
      if (inNode) {
        const ang = b * 2.399963;
        const rad = 6 + (b % 13) * 2.2;
        x += Math.cos(ang) * rad;
        y += Math.sin(ang) * rad;
        if (!finished) counts[k]++;
      } else {
        moving++;
      }

      let st = 0;
      for (let i = 0; i < ts.length; i++) {
        if (ts[i] <= T) st = ss[i];
        else break;
      }
      g.circle(x, y, 2.6).fill(STATE_COLORS[st]);
    }

    const ng = this.nodeG;
    ng.clear();
    for (let i = 0; i < nn; i++) {
      const nd = this.nodes[i];
      const col = heat(Math.min(1, counts[i] / (nd.servers * 3)));
      ng.circle(nd.x, nd.y, 38).fill({ color: col, alpha: 0.28 }).stroke({ width: 2, color: col });
      const txt = `${LABELS[nd.kind] ?? nd.kind}\n${counts[i]} here`;
      if (txt !== this.labelCache[i]) {
        this.labelCache[i] = txt;
        this.labels[i].text = txt;
      }
    }

    const now = performance.now();
    if (now - this.lastHud > 100) {
      this.lastHud = now;
      this.onTick({ t: T, frac: (T - this.start) / (this.end - this.start), spawned, moving, loaded, delayed, perNode: counts });
    }
  }

  destroy() {
    this.app.destroy(true, { children: true });
  }
}
