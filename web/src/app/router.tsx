import { createBrowserRouter } from 'react-router'
import { PAGES } from '../config/navigation'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { DashboardPage } from '../pages/DashboardPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'

export const router = createBrowserRouter([
  {
    element: <DashboardLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      ...PAGES.map((page) => ({ path: page.path, element: <PlaceholderPage key={page.path} page={page} /> })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
