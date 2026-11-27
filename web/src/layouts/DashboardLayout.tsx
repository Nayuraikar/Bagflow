import { Outlet } from 'react-router'
import { useApiState, useHealth } from '../hooks/useHealth'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function DashboardLayout() {
  const api = useApiState()
  const loadedBefore = useHealth().data !== undefined
  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Topbar api={api} />
        {api === 'offline' && (
          <div role="alert" className="border-b border-critical/40 bg-critical/10 px-4 py-3 text-sm md:px-8">
            <strong>API unreachable.</strong> {loadedBefore && 'Values already on screen were loaded earlier and may be out of date. '}Start the API with{' '}
            <code className="font-mono">cargo run --release -p bagflow-api</code>; this page reconnects by itself.
          </div>
        )}
        <main className="mx-auto max-w-6xl p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
