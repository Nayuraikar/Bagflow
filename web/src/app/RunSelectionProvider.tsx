import { useState, type ReactNode } from 'react'
import { RunSelectionContext } from '../hooks/runSelection'

/** Above the router, so the chosen run survives navigation. */
export function RunSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, select] = useState<string | null>(null)
  return <RunSelectionContext value={{ selected, select }}>{children}</RunSelectionContext>
}
