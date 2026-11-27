import { Pause, Play, SkipForward } from 'lucide-react'
import { SPEEDS, type Replay } from '../../hooks/useReplay'
import { fixed, int, msFine } from '../../utils/format'
import { StatusLabel } from './StatusLabel'

export function ReplayControls({ replay, span, clock = 'Elapsed job time' }: { replay: Replay; span: number; clock?: string }) {
  const slow = replay.slowdown
  return (
    <div className="space-y-2">
      <p className="rounded-lg border border-warning/60 bg-warning/10 px-3 py-2 text-sm">
        <strong>Replay of a measured run, not a live view.</strong> Positions come from the recorded start and end times. Speed changes only how
        fast the replay moves, never a measured value.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={replay.toggle} className="flex items-center gap-2 rounded-lg bg-ops px-3 py-1.5 text-sm font-semibold text-white">
          {replay.playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
          {replay.playing ? 'Pause' : 'Play replay'}
        </button>
        <button type="button" onClick={() => replay.seek(span)} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm">
          <SkipForward size={14} aria-hidden /> Show full run
        </button>
        <label className="text-sm">
          Speed{' '}
          <select value={replay.speed} onChange={(e) => replay.setSpeed(Number(e.target.value))} className="rounded-lg border border-line px-2 py-1">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <span className="text-sm">
          {clock} <span role="timer" className="inline-block min-w-24 text-right font-mono text-lg font-semibold">{msFine(replay.position)}</span>
        </span>
        <span className="text-xs text-muted">
          shown {slow >= 1 ? `about ${int(Math.round(slow))}× slower` : `about ${fixed(1 / slow, 1)}× faster`} than it ran
        </span>
        <StatusLabel status="Measured" />
      </div>
      <input
        type="range" min={0} max={span} step={span / 1000} value={replay.position}
        onChange={(e) => replay.seek(Number(e.target.value))}
        className="w-full accent-ops" aria-label="Replay position"
      />
    </div>
  )
}
