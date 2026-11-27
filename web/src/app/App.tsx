import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
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
        <RouterProvider router={router} />
      </RunSelectionProvider>
    </JobProvider>
  </QueryClientProvider>
)
