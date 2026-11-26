export const FLIGHTS = [
  { code: "AI502", city: "Delhi", color: "#4f46e5" },
  { code: "EK565", city: "Dubai", color: "#f97316" },
  { code: "BA118", city: "London", color: "#0d9488" },
  { code: "SQ503", city: "Singapore", color: "#e11d48" },
  { code: "QF68", city: "Sydney", color: "#7c3aed" },
];
export const FLY = 100; // seconds in the air

export interface Bag {
  id: number; f: number; a: number;
  k0: number; s0: number; e0: number; r1: number;
  k1: number; s1: number; e1: number; r2: number;
  s2: number; e2: number; r3: number;
  s3: number; e3: number; ok: boolean; su: number; eu: number;
}
export interface Sched {
  bags: Bag[]; dep: number[]; okCount: number[];
  end: number; lastCheckin: number; avgWait: number; missed: number;
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FCFS multi-server stage: items in `order` take the earliest free server.
function serve(order: number[], ready: number[], dur: number[], W: number, st: number[], srv: number[]) {
  const free = new Array<number>(W).fill(0);
  for (const i of order) {
    let k = 0;
    for (let j = 1; j < W; j++) if (free[j] < free[k]) k = j;
    const s = Math.max(ready[i], free[k]);
    st[i] = s; srv[i] = k; free[k] = s + dur[i];
  }
}
const byKey = (n: number, key: number[]) =>
  Array.from({ length: n }, (_, i) => i).sort((x, y) => key[x] - key[y] || x - y);

/** Same random bags for every W, so serial and parallel runs are directly comparable. */
export function build(n: number, F: number, W: number, myF: number): Sched {
  const r = rng(7);
  const span = n * 1.2;
  const f: number[] = [], a: number[] = [], d0: number[] = [], d1: number[] = [], d2: number[] = [], d3: number[] = [];
  for (let i = 0; i < n; i++) {
    const rf = r(), ra = r();
    f.push(i === 0 ? myF : Math.floor(rf * F));
    a.push(i === 0 ? 3 : ra * span);
    d0.push(3.5 + r() * 1.5);
    d1.push(2 + r() * 1.2 + (r() < 0.05 ? 12 : 0));
    d2.push(0.8 + r() * 0.5);
    d3.push(2.5 + r());
  }
  const s0: number[] = [], k0: number[] = [], s1: number[] = [], k1: number[] = [], s2: number[] = [], k2: number[] = [];
  serve(byKey(n, a), a, d0, W, s0, k0);
  const e0 = s0.map((s, i) => s + d0[i]);
  const r1 = e0.map((e) => e + 4);
  serve(byKey(n, r1), r1, d1, W, s1, k1);
  const e1 = s1.map((s, i) => s + d1[i]);
  const r2 = e1.map((e) => e + 6);
  serve(byKey(n, r2), r2, d2, Math.max(1, Math.ceil(W / 2)), s2, k2);
  const e2 = s2.map((s, i) => s + d2[i]);
  const r3 = e2.map((e, i) => e + 5 + f[i] * 1.5);

  const L = Math.max(1, Math.ceil(W / F));
  const dep = Array.from({ length: F }, (_, x) => span + 90 + x * 40);
  const s3 = new Array<number>(n).fill(0), e3 = new Array<number>(n).fill(0);
  const ok = new Array<boolean>(n).fill(false);
  const su = new Array<number>(n).fill(Infinity), eu = new Array<number>(n).fill(Infinity);
  const okCount = new Array<number>(F).fill(0);
  for (let x = 0; x < F; x++) {
    const ids = byKey(n, r3).filter((i) => f[i] === x);
    const free = new Array<number>(L).fill(0);
    for (const i of ids) {
      let k = 0;
      for (let j = 1; j < L; j++) if (free[j] < free[k]) k = j;
      const s = Math.max(r3[i], free[k]);
      s3[i] = s; e3[i] = s + d3[i];
      if (s < dep[x]) { free[k] = e3[i]; ok[i] = e3[i] <= dep[x]; }
      if (ok[i]) okCount[x]++;
    }
    const land = dep[x] + FLY;
    const fu = new Array<number>(L).fill(land);
    for (const i of ids.filter((i) => ok[i]).sort((p, q) => e3[p] - e3[q])) {
      let k = 0;
      for (let j = 1; j < L; j++) if (fu[j] < fu[k]) k = j;
      su[i] = Math.max(land, fu[k]); eu[i] = su[i] + 1.5; fu[k] = eu[i];
    }
  }
  const bags: Bag[] = [];
  for (let i = 0; i < n; i++) {
    bags.push({ id: i, f: f[i], a: a[i], k0: k0[i], s0: s0[i], e0: e0[i], r1: r1[i], k1: k1[i], s1: s1[i], e1: e1[i],
      r2: r2[i], s2: s2[i], e2: e2[i], r3: r3[i], s3: s3[i], e3: e3[i], ok: ok[i], su: su[i], eu: eu[i] });
  }
  const fin = eu.filter((v) => Number.isFinite(v));
  return {
    bags, dep, okCount,
    end: fin.length ? Math.max(...fin) : Math.max(...e0) + 10,
    lastCheckin: Math.max(...e0),
    avgWait: s0.reduce((s, v, i) => s + v - a[i], 0) / n,
    missed: ok.filter((v) => !v).length,
  };
}
