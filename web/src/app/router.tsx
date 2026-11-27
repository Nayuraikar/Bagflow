import type { ReactElement } from 'react'
import { createBrowserRouter } from 'react-router'
import { PAGES } from '../config/navigation'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { DashboardPage } from '../pages/DashboardPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { ParallelStudioPage } from '../pages/ParallelStudioPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { StageExplorerPage } from '../pages/StageExplorerPage'

const BUILT: Record<string, ReactElement> = {
  '/operations/parallel-studio': <ParallelStudioPage />,
  '/operations/stages': <StageExplorerPage />,
}

export const router = createBrowserRouter([
  {
    element: <DashboardLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      ...PAGES.map((page) => ({ path: page.path, element: BUILT[page.path] ?? <PlaceholderPage key={page.path} page={page} /> })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
