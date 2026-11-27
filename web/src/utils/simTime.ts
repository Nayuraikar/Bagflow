import { EMPTY } from './format'

const two = (n: number) => String(n).padStart(2, '0')

/** Simulation time as a clock. A saturated run goes past midnight, shown as extra days. */
export function simClock(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return EMPTY
  const s = Math.floor(ms / 1000)
  const days = Math.floor(s / 86_400)
  const clock = `${two(Math.floor(s / 3600) % 24)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`
  return days ? `${clock} (+${days} d)` : clock
}

export function duration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return EMPTY
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const s = Math.round(ms / 1000)
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`
  return `${Math.floor(s / 3600).toLocaleString('en-US')} h ${Math.floor(s / 60) % 60} min`
}
