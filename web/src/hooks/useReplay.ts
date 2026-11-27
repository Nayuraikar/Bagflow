import { useEffect, useState } from 'react'

/** At speed 1 the longer of the two runs takes this long to replay. */
export const REPLAY_MS = 8000
export const SPEEDS = [0.25, 0.5, 1, 2, 4]

/**
 * A playhead over `durationMs` of recorded job time. Speed only changes how fast the playhead
 * moves; it starts at the end, where the whole recorded run is visible.
 */
export function useReplay(durationMs: number) {
  const [position, setPosition] = useState(durationMs)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const playing = running && position < durationMs

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const jobMs = (Math.max(0, now - last) * speed * durationMs) / REPLAY_MS
      last = now
      setPosition((p) => Math.min(durationMs, p + jobMs))
      frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, durationMs])

  return {
    position,
    playing,
    speed,
    setSpeed,
    /** How many times slower than real time the replay runs. */
    slowdown: REPLAY_MS / speed / durationMs,
    toggle: () => {
      if (playing) return setRunning(false)
      if (position >= durationMs) setPosition(0)
      setRunning(true)
    },
    seek: (to: number) => {
      setRunning(false)
      setPosition(to)
    },
  }
}

export type Replay = ReturnType<typeof useReplay>
