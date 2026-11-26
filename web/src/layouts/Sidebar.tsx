import { NavLink } from "react-router";
import { NAVIGATION } from "../config/navigation";

export default function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  return (
    <aside
      className={`${open ? "block" : "hidden"} fixed inset-y-0 left-0 z-20 w-60 shrink-0 overflow-y-auto border-r border-line bg-surface lg:sticky lg:top-0 lg:block lg:h-screen`}
    >
      <div className="px-5 py-5 text-lg font-bold tracking-tight">BagFlow</div>
      <nav aria-label="Main" className="px-3 pb-6">
        {NAVIGATION.map((group) => (
          <div key={group.title} className="mb-4">
            <h2 className="px-2 pb-1 text-[11px] tracking-wider text-muted uppercase">{group.title}</h2>
            <ul>
              {group.items.map(({ label, path, icon: Icon }) => (
                <li key={path}>
                  <NavLink
                    to={path}
                    end
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${isActive ? "bg-heading text-surface" : "hover:bg-bg"}`
                    }
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
