import {
  Activity, BarChart3, Boxes, Cpu, FlaskConical, Gauge, History, Layers, LayoutDashboard, Luggage,
  Network, Plane, PlaySquare, Settings, SlidersHorizontal, TrafficCone, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Set on pages that are not built yet: what the page will hold. */
  planned?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAVIGATION: NavGroup[] = [
  { title: "Workspace", items: [{ label: "Overview", path: "/dashboard", icon: LayoutDashboard }] },
  {
    title: "Operations",
    items: [
      { label: "Stage Explorer", path: "/operations/stages", icon: Layers, planned: "The seven baggage stages, each marked Modelled, Simplified or Not modelled." },
      { label: "Airport Network", path: "/operations/network", icon: Network, planned: "The airport graph with per-facility statistics." },
      { label: "Baggage Tracker", path: "/operations/baggage", icon: Luggage, planned: "Search bags and follow one bag's timeline." },
      { label: "Congestion Analysis", path: "/operations/congestion", icon: TrafficCone, planned: "Queues, utilisation and waiting times by facility." },
    ],
  },
  {
    title: "Computing",
    items: [
      { label: "Performance Lab", path: "/performance", icon: Gauge, planned: "Configure and run kernel benchmarks." },
      { label: "Benchmark Analytics", path: "/performance/analytics", icon: BarChart3, planned: "Repetition statistics, speedup, efficiency and GPU time split." },
      { label: "Resource Profiler", path: "/performance/profiler", icon: Cpu, planned: "Only the resource measurements the backends really collect." },
    ],
  },
  {
    title: "Experiments",
    items: [
      { label: "Scenario Studio", path: "/experiments/scenarios", icon: SlidersHorizontal, planned: "Build, run and compare scenarios." },
      { label: "Simulation History", path: "/experiments/history", icon: History, planned: "Inspect, compare and export past runs." },
    ],
  },
  {
    title: "Concept demos",
    items: [
      { label: "Airport", path: "/demos/airport", icon: Plane },
      { label: "Scale", path: "/demos/scale", icon: Boxes },
      { label: "Journey", path: "/demos/journey", icon: Activity },
      { label: "Replay", path: "/demos/replay", icon: PlaySquare },
      { label: "Scenarios", path: "/demos/scenarios", icon: FlaskConical },
      { label: "Benchmark lab", path: "/demos/benchmarks", icon: BarChart3 },
    ],
  },
  { title: "System", items: [{ label: "Settings", path: "/settings", icon: Settings, planned: "The blueprint does not define any settings yet." }] },
];
