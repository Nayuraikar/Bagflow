import { ArrowRight, Gauge, Network, type LucideIcon } from "lucide-react";
import { Link } from "react-router";

interface Destination {
  to: string;
  title: string;
  text: string;
  icon: LucideIcon;
  style: string;
}

const DESTINATIONS: Destination[] = [
  {
    to: "/operations/stages",
    title: "Operations Lab",
    text: "How baggage moves through the airport: stages, network, bags and congestion, from simulation runs.",
    icon: Network,
    style: "bg-ops",
  },
  {
    to: "/performance",
    title: "Performance Lab",
    text: "How parallel implementations process the same batch kernel workload. Benchmarks are separate from simulation runs.",
    icon: Gauge,
    style: "bg-perf",
  },
];

export default function DestinationCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {DESTINATIONS.map(({ to, title, text, icon: Icon, style }) => (
        <Link key={to} to={to} className={`group flex flex-col gap-3 rounded-2xl p-6 text-surface ${style}`}>
          <Icon aria-hidden className="size-7" />
          <h2 className="text-xl">{title}</h2>
          <p className="text-sm opacity-90">{text}</p>
          <span className="mt-auto flex items-center gap-1 text-sm font-semibold">
            Open <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      ))}
    </div>
  );
}
