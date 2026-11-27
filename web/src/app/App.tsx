import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { DemoProvider } from './DemoProvider'
import { JobProvider } from './JobProvider'
import { RunSelectionProvider } from './RunSelectionProvider'
import { router } from './router'

// no retries: the queries poll, and an unreachable API should show at once
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, networkMode: 'always' }, mutations: { networkMode: 'always' } },
})

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <JobProvider>
      <RunSelectionProvider>
        <DemoProvider>
          <RouterProvider router={router} />
        </DemoProvider>
      </RunSelectionProvider>
    </JobProvider>
  </QueryClientProvider>
)
