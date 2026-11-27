// Compares saved sweeps that had the same settings. The API times each pass once per sweep.

import { TriangleAlert } from 'lucide-react'
import type { SweepRun } from '../../types/models'
import { EMPTY, int, msFine, pct } from '../../utils/format'
import { NOISE_PCT, repeatSpread } from '../../utils/sweep'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'
import { Table } from '../common/Table'

export function NoiseCheck({ repeats, onRepeat, busy }: { repeats: SweepRun[]; onRepeat: () => void; busy: boolean }) {
  const rows = repeatSpread(repeats)
  const noisy = rows.filter((r) => r.noisy)
  return (
    <Card className="space-y-3">
      <CardTitle>Repeated sweeps and timing noise</CardTitle>
      {repeats.length < 2 ? (
        <p className="text-sm">
          {EMPTY} One saved sweep with these settings. Each thread count was timed once, so run the same sweep again to see how much the
          times move.
        </p>
      ) : (
        <>
          {noisy.length > 0 ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning bg-warning/15 p-3 text-sm">
              <TriangleAlert size={18} className="shrink-0" aria-hidden />
              <span>
                <strong>Noisy timings.</strong> Repeats of this sweep differ by more than {NOISE_PCT}% at{' '}
                {noisy.map((r) => `${r.threads} thread${r.threads === 1 ? '' : 's'}`).join(', ')}. Treat any single speedup here as approximate.
              </span>
            </p>
          ) : (
            <p className="text-sm">Repeats of this sweep are within {NOISE_PCT}% of each other at every thread count.</p>
          )}
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {int(repeats.length)} saved sweeps with identical settings. Spread = (longest − shortest) ÷ shortest. The {NOISE_PCT}% line is a display rule
            of this page. <StatusLabel status="Simplified" />
          </p>
          <Table
            head={['Threads', 'Sweeps', 'Shortest', 'Longest', 'Spread', 'Source']}
            rows={rows.map((r) => ({
              key: r.threads,
              cells: [r.threads, int(r.walls.length), msFine(r.min), msFine(r.max), pct(r.spreadPct), <StatusLabel key="s" status="Measured" />],
            }))}
          />
        </>
      )}
      <button type="button" onClick={onRepeat} disabled={busy} className="rounded-lg border border-ops px-3 py-1.5 text-sm text-ops disabled:opacity-50">
        Run these settings again
      </button>
    </Card>
  )
}
