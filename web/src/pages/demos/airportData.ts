export const CITIES = [
  ["DEL", "Delhi", "#6366f1"], ["DXB", "Dubai", "#f97316"], ["LHR", "London", "#14b8a6"], ["SIN", "Singapore", "#ec4899"],
  ["SYD", "Sydney", "#8b5cf6"], ["JFK", "New York", "#0ea5e9"], ["BOM", "Mumbai", "#eab308"], ["DOH", "Doha", "#10b981"],
  ["FRA", "Frankfurt", "#f43f5e"], ["HKG", "Hong Kong", "#64748b"],
] as const;
export const HUBS = ["DXB", "DOH", "SIN", "FRA"];
export const FH: Record<string, number> = { DEL: 2.8, DXB: 4.2, LHR: 9.5, SIN: 4.6, SYD: 12, JFK: 15.5, BOM: 1.8, DOH: 4.5, FRA: 9, HKG: 5.4 };
export const CAUSES = ["Late inbound aircraft", "Air traffic control", "Weather", "Technical", "Baggage handling", "Security queue"];
export const color = (c: string) => CITIES.find((x) => x[0] === c)?.[2] ?? "#64748b";
export const cityName = (c: string) => CITIES.find((x) => x[0] === c)?.[1] ?? c;

export interface Flight { id: number; code: string; city: string; dep: number; seats: number; pax: number; bags: number; xfer: number; delay: number; cause: string; gate: string }
export interface Stats { days: number; flights: number; bags: number; xfer: number; late: number; delaySum: number; missed: number; hourBags: number[]; hourDelay: number[]; hourN: number[]; hist: number[]; causes: number[] }
export interface Trip { name: string; dest: string; via: string | null; f1: Flight; f2: Flight | null; bags: number; special: boolean; follow: boolean }

export const hm = (m: number) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); };
export const dur = (s: number) => s < 90 ? s.toFixed(0) + " s" : s < 5400 ? (s / 60).toFixed(0) + " min" : s < 172800 ? (s / 3600).toFixed(1) + " h" : (s / 86400).toFixed(1) + " days";

export function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(6.2832 * r());
function pick<T>(r: () => number, items: [T, number][]): T {
  let u = r() * items.reduce((a, b) => a + b[1], 0);
  for (const [v, w] of items) { if (u < w) return v; u -= w; }
  return items[items.length - 1][0];
}
const AIR = ["AI", "EK", "BA", "SQ", "QF", "LH", "QR", "CX", "6E", "UK"];
const SEATS: [number, number][] = [[76, .15], [150, .25], [180, .30], [220, .15], [300, .10], [350, .05]];
const CAUSE_W: [number, number][] = [[0, .34], [1, .20], [2, .15], [3, .15], [4, .09], [5, .07]];
const PEAKS = [[7, 1, 1.3], [12.5, .45, 1.6], [18.5, 1.2, 1.5], [21, .6, 1.1]];
const HOURW = Array.from({ length: 24 }, (_, h) => 0.1 + PEAKS.reduce((a, [m, k, s]) => a + k * Math.exp(-((h + .5 - m) ** 2) / (2 * s * s)), 0));
const HW = HOURW.reduce((a, b) => a + b, 0);
const FPD = 900;

const empty = (days: number): Stats => ({ days, flights: 0, bags: 0, xfer: 0, late: 0, delaySum: 0, missed: 0, hourBags: Array(24).fill(0), hourDelay: Array(24).fill(0), hourN: Array(24).fill(0), hist: Array(6).fill(0), causes: Array(6).fill(0) });

function genDay(seed: number, S: Stats, keep: boolean): Flight[] {
  const r = rng(seed), out: Flight[] = [];
  for (let i = 0; i < FPD; i++) {
    let u = r() * HW, h = 0;
    while (h < 23 && u > HOURW[h]) { u -= HOURW[h]; h++; }
    const dep = h * 60 + Math.floor(r() * 60);
    const city = CITIES[Math.floor(r() * CITIES.length)][0];
    const seats = pick(r, SEATS);
    const pax = Math.round(seats * Math.min(1, Math.max(.45, .82 + .08 * gauss(r))));
    const bags = Math.max(0, Math.round(pax * 1.04 + gauss(r) * Math.sqrt(pax) * .8));
    const xfer = Math.round(bags * (.25 + .1 * r()));
    const delay = r() < .6 ? Math.round(-6 + r() * 11) : Math.round(Math.exp(2.9 + .9 * gauss(r)) * (1 + h / 18));
    const cause = delay > 15 ? pick(r, CAUSE_W) : -1;
    const code = AIR[Math.floor(r() * AIR.length)] + (100 + Math.floor(r() * 900));
    const gate = "ABCD"[Math.floor(r() * 4)] + (1 + Math.floor(r() * 30));
    S.flights++; S.bags += bags; S.xfer += xfer; S.hourBags[h] += bags; S.hourDelay[h] += delay; S.hourN[h]++; S.delaySum += delay;
    if (delay > 15) { S.late++; S.causes[cause]++; }
    if (delay > 30) S.missed += Math.round(xfer * Math.min(1, (delay - 30) / 90));
    S.hist[delay <= 0 ? 0 : delay <= 15 ? 1 : delay <= 30 ? 2 : delay <= 60 ? 3 : delay <= 120 ? 4 : 5]++;
    if (keep) out.push({ id: i, code, city, dep, seats, pax, bags, xfer, delay, cause: cause < 0 ? "" : CAUSES[cause], gate });
  }
  return out;
}

export function dataset(days: number) {
  const S = empty(days);
  let today: Flight[] = [];
  for (let d = 0; d < days; d++) { const f = genDay(d + 1, S, d === 0); if (d === 0) today = f.sort((a, b) => a.dep - b.dep); }
  return { stats: S, today };
}

/** The onward flight from the hub, scheduled with a 45 min minimum connection time plus slack. */
export function leg2(f: Flight, hub: string, dest: string): Flight {
  const r = rng(f.id * 131 + f.dep + 7);
  const dep = f.dep + Math.round(FH[hub] * 60) + 45 + 20 + Math.floor(r() * 100);
  const delay = r() < .7 ? Math.round(-3 + r() * 10) : Math.round(Math.exp(2.6 + .8 * gauss(r)));
  return { id: -1, code: AIR[Math.floor(r() * AIR.length)] + (100 + Math.floor(r() * 900)), city: dest, dep, seats: f.seats, pax: f.pax, bags: f.bags, xfer: 0, delay, cause: delay > 15 ? CAUSES[0] : "", gate: "T" + (1 + Math.floor(r() * 20)) };
}
