import type { ReactElement } from 'react'
import { createBrowserRouter } from 'react-router'
import { PAGES } from '../config/navigation'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { BackendComparisonPage } from '../pages/BackendComparisonPage'
import { DashboardPage } from '../pages/DashboardPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { ParallelStudioPage } from '../pages/ParallelStudioPage'
import { ParallelSweepsPage } from '../pages/ParallelSweepsPage'
import { PerformanceLabPage } from '../pages/PerformanceLabPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { StageExplorerPage } from '../pages/StageExplorerPage'

const BUILT: Record<string, ReactElement> = {
  '/experiments/sweeps': <ParallelSweepsPage />,
  '/performance': <PerformanceLabPage />,
  '/performance/backends': <BackendComparisonPage />,
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
