import type { ReactNode } from 'react'
import type { Machine } from '../../types/models'
import { StatusLabel } from './StatusLabel'

const machineName = (m: Machine) => `${m.os} / ${m.arch}, ${m.logicalCores} logical cores`

/** Says that the results below come from real runs, and on which machine. */
export function RealBanner({ machine, debugBuild, children }: { machine: Machine; debugBuild: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <StatusLabel status="Real" />
        <strong>{machineName(machine)}</strong>
        <span className="text-muted">{children}</span>
      </p>
      {debugBuild && <p className="text-sm text-critical">This run came from a debug build: timings are not representative.</p>}
    </div>
  )
}
