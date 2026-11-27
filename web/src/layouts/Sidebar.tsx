import { NavLink } from 'react-router'
import { BRAND_ICON as Brand, GUIDED_DEMO, SECTIONS, type Destination } from '../config/navigation'

function Item({ item }: { item: Destination }) {
  return (
    <NavLink
      to={item.path}
      end
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-ops/10 font-semibold text-ops' : 'text-heading hover:bg-bg'}`
      }
    >
      <item.icon size={16} aria-hidden />
      {item.label}
    </NavLink>
  )
}

export const Sidebar = () => (
  <aside className="flex shrink-0 flex-col border-line bg-surface max-md:border-b md:sticky md:top-0 md:h-screen md:w-64 md:overflow-y-auto md:border-r">
    <div className="flex items-center gap-2.5 px-5 py-4">
      <Brand size={22} className="text-ops" aria-hidden />
      <span className="text-lg font-bold">BagFlow</span>
    </div>
    <nav aria-label="Main" className="flex-1 px-2 pb-4">
      {SECTIONS.map((section) => (
        <div key={section.title} className="mb-4">
          <h2 className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{section.title}</h2>
          {section.items.map((item) => (
            <Item key={item.path} item={item} />
          ))}
        </div>
      ))}
    </nav>
    <div className="border-t border-line p-2">
      <Item item={GUIDED_DEMO} />
    </div>
  </aside>
)
