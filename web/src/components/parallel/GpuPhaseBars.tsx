import type { Gpu } from '../../types/parallel'
import { msFine } from '../../utils/format'
import { StatusLabel } from '../common/StatusLabel'

/** Durations of the phases of one run. They are not placed in time: the API gives no start times. */
export function GpuPhaseBars({ gpu }: { gpu: Gpu }) {
  const rows = [
    { name: 'Copy in', value: gpu.copyInMs, color: '#d99a35' },
    { name: 'Kernel (device time)', value: gpu.kernelMs, color: '#3975ce' },
    { name: 'Launch and wait beyond the kernel', value: gpu.launchOverheadMs, color: '#9aa5b5' },
    { name: 'Copy out', value: gpu.copyOutMs, color: '#b8641f' },
  ]
  const max = Math.max(...rows.map((r) => r.value))
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>{r.name}</span>
            <span className="flex items-center gap-2"><span className="font-mono">{msFine(r.value)}</span><StatusLabel status="Measured" /></span>
          </div>
          <div className="h-3 rounded bg-line">
            <div className="h-3 rounded" style={{ width: max > 0 ? `${(100 * r.value) / max}%` : 0, background: r.color }} />
          </div>
        </div>
      ))}
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          {gpu.device ?? 'GPU'} · {gpu.note}. Bar lengths compare durations only. No per-task times, so no worker lanes. Median kernel time over all
          repetitions: <span className="font-mono">{msFine(gpu.medianKernelMs)}</span>.
        </span>
        <StatusLabel status="Measured" />
      </p>
    </div>
  )
}
