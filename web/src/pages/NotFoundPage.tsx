import { Link } from 'react-router'

export const NotFoundPage = () => (
  <div className="space-y-3">
    <h1 className="text-2xl font-bold">Page not found</h1>
    <Link to="/" className="text-sm text-perf underline">Back to the Main Dashboard</Link>
  </div>
)
