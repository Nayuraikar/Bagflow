import { CITIES } from "./airportData";

export function Plane({ bags = 0, hue = "#1f6feb" }: { bags?: number; hue?: string }) {
  const n = Math.max(0, Math.min(14, Math.round(bags)));
  return (
    <svg viewBox="0 0 900 270" className="plane-svg" role="img" aria-label="Aircraft with a cutaway of the baggage hold">
      <defs>
        <linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d3dbe8" /></linearGradient>
        <linearGradient id="pw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a3afc2" /><stop offset="1" stopColor="#5d687c" /></linearGradient>
      </defs>
      <ellipse cx="460" cy="262" rx="360" ry="7" fill="rgba(15,23,42,.14)" />
      <path d="M730 96 L812 14 L862 14 L836 112 Z" fill={hue} />
      <path d="M730 96 L812 14 L826 14 L762 110 Z" fill="rgba(255,255,255,.28)" />
      <path d="M500 150 L700 150 L640 204 L560 204 Z" fill="#aab4c4" />
      <path d="M30 150 C 44 108, 120 90, 250 88 L 760 88 C 846 90, 884 122, 892 142 C 882 168, 836 182, 760 184 L 190 184 C 110 184, 50 178, 30 150 Z" fill="url(#pf)" stroke="#c7d0de" />
      <path d="M150 142 C 400 136, 640 136, 880 148" stroke={hue} strokeWidth="5" fill="none" opacity=".75" />
      <path d="M62 128 C 80 112, 112 104, 138 104 L 138 124 L 70 132 Z" fill="#1e3a5f" />
      {Array.from({ length: 13 }).map((_, k) => <rect key={k} x={560 + k * 22} y="108" width="12" height="16" rx="6" fill="#1e3a5f" opacity=".88" />)}
      <rect x="190" y="96" width="330" height="76" rx="14" fill="#eef4ff" stroke="#94a3b8" strokeWidth="3" />
      <line x1="200" y1="166" x2="510" y2="166" stroke="#cbd5e1" strokeWidth="3" />
      {Array.from({ length: n }).map((_, k) => {
        const x = 204 + (k % 7) * 44, y = k < 7 ? 108 : 138;
        return (<g key={k}><rect x={x} y={y} width="36" height="26" rx="6" fill={CITIES[k % 10][2]} /><rect x={x + 11} y={y - 5} width="14" height="6" rx="3" fill="none" stroke="#334155" strokeWidth="2" /></g>);
      })}
      <path d="M470 172 L690 172 L612 248 L508 248 Z" fill="url(#pw)" />
      <ellipse cx="560" cy="198" rx="54" ry="22" fill="#e1e7f1" stroke="#94a3b8" />
      <ellipse cx="518" cy="198" rx="10" ry="18" fill="#475569" />
      <rect x="246" y="184" width="6" height="28" fill="#64748b" /><circle cx="249" cy="220" r="14" fill="#1f2937" />
      <rect x="146" y="180" width="5" height="22" fill="#64748b" /><circle cx="148" cy="212" r="11" fill="#1f2937" />
    </svg>
  );
}

export function PaperPlane() {
  return (
    <svg viewBox="0 0 320 220" className="paper" aria-hidden="true">
      <polygon points="10,90 310,10 150,130" fill="#ffffff" />
      <polygon points="10,90 150,130 120,200" fill="#dbeafe" />
      <polygon points="150,130 310,10 120,200" fill="#bfdbfe" />
      <polygon points="150,130 120,200 178,160" fill="#93c5fd" />
    </svg>
  );
}

interface StripProps {
  labels: string[]; i: number; onSelect: (k: number) => void; bags: number; hue: string;
  tile: { n: string; label: string; name: string }; tag: { who: string; route: string; no: string };
}
export function AircraftStrip({ labels, i, onSelect, bags, hue, tile, tag }: StripProps) {
  return (
    <section className="strip">
      <div className="strip-tabs">{labels.map((l, k) => <button key={k} className={k === i ? "on" : k < i ? "done" : ""} onClick={() => onSelect(k)}>{l}</button>)}</div>
      <div className="strip-stage"><Plane bags={bags} hue={hue} /></div>
      <div className="strip-foot">
        <div className="tile"><small>{tile.label.toUpperCase()}</small><b>{tile.n}</b><span>{tile.name}</span></div>
        <div className="floor">
          <h4>Your bag tag</h4>
          <div className="tagrow"><div><small>PASSENGER</small><b>{tag.who}</b></div><div><small>ROUTE</small><b>{tag.route}</b></div><div><small>TAG</small><b>{tag.no}</b></div></div>
          <div className="prog"><i style={{ width: (100 * (i + 1)) / labels.length + "%" }} /></div>
          <small>Scene {i + 1} of {labels.length}</small>
        </div>
      </div>
    </section>
  );
}
