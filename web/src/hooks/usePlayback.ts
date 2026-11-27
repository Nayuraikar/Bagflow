import { useEffect, useState } from 'react'

const TICK_MS = 50

/** A playhead in simulation time. `speed` is simulation seconds per real second. */
export function usePlayback(startMs: number, endMs: number, initialMs: number) {
  const [atMs, setAtMs] = useState(() => Math.min(endMs, Math.max(startMs, initialMs)))
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(5)
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      const step = (now - last) * speed
      last = now
      setAtMs((t) => Math.min(endMs, t + step))
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [playing, speed, endMs])
  const running = playing && atMs < endMs
  return {
    atMs, running, speed, setSpeed,
    seek: setAtMs,
    pause: () => setPlaying(false),
    toggle: () => {
      if (!running && atMs >= endMs) setAtMs(startMs)
      setPlaying(!running)
    },
  }
}
