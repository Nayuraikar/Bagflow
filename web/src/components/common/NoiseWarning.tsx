import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

export function NoiseWarning({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="flex items-start gap-2 rounded-lg border border-warning bg-warning/15 p-3 text-sm">
      <TriangleAlert size={18} className="shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
