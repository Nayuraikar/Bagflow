import { Stat } from '../parallel/Stat'
import { speedupText, type SpeedupSpread } from './figures'

export function SpeedupFigure({ label, value, spread }: { label: string; value: number; spread: SpeedupSpread | null }) {
  const t = speedupText(value, spread)
  return <Stat label={label} value={t.headline} note={t.note} />
}
