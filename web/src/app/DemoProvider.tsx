import { useState, type ReactNode } from 'react'
import { DemoContext, type DemoState } from '../hooks/demo'

/** Above the router, so the demo keeps its place while other pages are opened from it. */
export function DemoProvider({ children }: { children: ReactNode }) {
  const [submitted, setAll] = useState<DemoState['submitted']>({})
  const [skipped, setList] = useState<DemoState['skipped']>([])
  const value: DemoState = {
    submitted,
    skipped,
    setSubmitted: (step, id) => {
      setAll((s) => ({ ...s, [step]: id }))
      setList((l) => l.filter((x) => x !== step))
    },
    setSkipped: (step, skip) => setList((l) => (skip ? [...l.filter((x) => x !== step), step] : l.filter((x) => x !== step))),
  }
  return <DemoContext value={value}>{children}</DemoContext>
}
