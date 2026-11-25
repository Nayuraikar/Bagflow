import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// All numbers copied from results/kernels_10M_metal.txt, kernels_10M_kaggle.txt, mpi_50M.txt, mpi_50M_kaggle.txt.
const mac = [
  { name: "scalar", ms: 14.12 }, { name: "ilp x4", ms: 13.12 }, { name: "neon", ms: 6.75 },
  { name: "openmp-8", ms: 4.3 }, { name: "metal (kernel)", ms: 3.45 }, { name: "metal + copy", ms: 7.41 },
  { name: "rayon-4+neon", ms: 1.89 }, { name: "rayon-8+neon", ms: 2.03 },
];
const kaggle = [
  { name: "scalar", ms: 26.31 }, { name: "ilp x4", ms: 30.5 }, { name: "avx2", ms: 7.91 }, { name: "openmp-4", ms: 7.07 },
  { name: "rayon-4+avx2", ms: 3.56 }, { name: "cuda naive (kernel)", ms: 24.81 }, { name: "cuda warp (kernel)", ms: 0.83 },
  { name: "cuda ptx (kernel)", ms: 0.83 }, { name: "cuda warp + PCIe", ms: 21.61 },
];
const transfer = [
  { name: "M1 Metal (unified memory)", copyIn: 3.01, kernel: 3.45, copyOut: 0.26 },
  { name: "T4 CUDA warp (PCIe)", copyIn: 18.71, kernel: 0.83, copyOut: 2.02 },
];
const mpi = [
  { ranks: 1, macRead: 1.0, macScatter: 1.0, kgRead: 1.0, kgScatter: 1.0 },
  { ranks: 2, macRead: 1.57, macScatter: 2.39, kgRead: 1.65, kgScatter: 0.96 },
  { ranks: 4, macRead: 2.87, macScatter: 2.51, kgRead: 2.23, kgScatter: 0.63 },
  { ranks: 8, macRead: 3.47, macScatter: 1.43 },
];

const axis = { stroke: "#94a3b8" };
const tip = { contentStyle: { background: "#0f172a", border: "1px solid #334155" } };

function Hbar({ data, color }: { data: { name: string; ms: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={data.length * 34 + 40}>
      <BarChart data={data} layout="vertical" margin={{ left: 110 }}>
        <CartesianGrid stroke="#1e293b" />
        <XAxis type="number" {...axis} unit=" ms" />
        <YAxis type="category" dataKey="name" {...axis} width={140} />
        <Tooltip {...tip} />
        <Bar dataKey="ms" fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function BenchPage() {
  return (
    <div>
      <p className="muted">Deadline-risk kernel on 10M bags (lower is better). Every backend is bit-identical to scalar. Compare backends only within one machine.</p>
      <div className="panel"><h3>Apple M1 (8 cores)</h3><Hbar data={mac} color="#38bdf8" /></div>
      <div className="panel"><h3>Kaggle: Xeon 4 logical cores + Tesla T4</h3><Hbar data={kaggle} color="#a78bfa" /></div>
      <div className="panel">
        <h3>Where the GPU time goes: unified memory vs PCIe</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={transfer} layout="vertical" margin={{ left: 130 }}>
            <CartesianGrid stroke="#1e293b" />
            <XAxis type="number" {...axis} unit=" ms" />
            <YAxis type="category" dataKey="name" {...axis} width={170} />
            <Tooltip {...tip} /><Legend />
            <Bar dataKey="copyIn" name="copy in" stackId="a" fill="#f59e0b" />
            <Bar dataKey="kernel" name="kernel" stackId="a" fill="#22c55e" />
            <Bar dataKey="copyOut" name="copy out" stackId="a" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <h3>MPI end-to-end speedup, 50M bags (read = each rank reads its slice; scatter = rank 0 sends)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={mpi}>
            <CartesianGrid stroke="#1e293b" />
            <XAxis dataKey="ranks" {...axis} />
            <YAxis {...axis} unit="x" />
            <Tooltip {...tip} /><Legend />
            <Line dataKey="macRead" name="M1 read" stroke="#38bdf8" />
            <Line dataKey="macScatter" name="M1 scatter" stroke="#38bdf8" strokeDasharray="5 4" />
            <Line dataKey="kgRead" name="Kaggle read" stroke="#a78bfa" />
            <Line dataKey="kgScatter" name="Kaggle scatter" stroke="#a78bfa" strokeDasharray="5 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
