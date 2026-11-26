import { Suspense, useState } from "react";
import { Outlet, useLocation } from "react-router";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen">
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMenuOpen((o) => !o)} />
        <main className="flex-1">
          <Suspense key={pathname} fallback={<p className="p-8 text-sm text-muted">Loading...</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
