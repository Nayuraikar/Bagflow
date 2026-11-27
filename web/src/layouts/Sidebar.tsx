import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { BRAND_ICON as Brand, GUIDED_DEMO, SECTIONS, type Destination } from '../config/navigation'

function Item({ item, onClick }: { item: Destination; onClick: () => void }) {
  return (
    <NavLink
      to={item.path}
      end
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-ops/10 font-semibold text-ops' : 'text-heading hover:bg-bg'}`
      }
    >
      <item.icon size={16} aria-hidden />
      {item.label}
    </NavLink>
  )
}

/** A column beside the page; on narrow screens, a header whose links open from a Menu button. */
export function Sidebar() {
  // the path the menu was opened on, so any navigation closes it
  const { pathname } = useLocation()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const close = () => setOpenOn(null)
  const collapsed = open ? '' : 'max-md:hidden'
  return (
    <aside className="flex shrink-0 flex-col border-line bg-surface max-md:border-b md:sticky md:top-0 md:h-screen md:w-64 md:overflow-y-auto md:border-r">
      <div className="flex items-center gap-2.5 px-5 py-4 max-md:py-2">
        <Brand size={22} className="text-ops" aria-hidden />
        <span className="text-lg font-bold">BagFlow</span>
        <button
          type="button" onClick={() => setOpenOn(open ? null : pathname)} aria-expanded={open} aria-controls="main-nav guide-nav"
          className="ml-auto flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm md:hidden"
        >
          {open ? <X size={16} aria-hidden /> : <Menu size={16} aria-hidden />}
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      <nav id="main-nav" aria-label="Main" className={`flex-1 px-2 pb-4 ${collapsed}`}>
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <h2 className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{section.title}</h2>
            {section.items.map((item) => (
              <Item key={item.path} item={item} onClick={close} />
            ))}
          </div>
        ))}
      </nav>
      <div id="guide-nav" className={`border-t border-line p-2 ${collapsed}`}>
        <Item item={GUIDED_DEMO} onClick={close} />
      </div>
    </aside>
  )
}
