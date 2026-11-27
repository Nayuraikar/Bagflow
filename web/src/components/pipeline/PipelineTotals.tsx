import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Pipeline } from '../../types/models'
import { ms } from '../../utils/format'
import { Card, CardTitle } from '../common/Card'
import { StatusLabel } from '../common/StatusLabel'
import { PHASE_COLOR } from './phaseStyle'

/** The two composed totals on one scale, so the sequential share is visible. */
export default function PipelineTotals({ pipeline }: { pipeline: Pipeline }) {
  const series = [
    ...pipeline.phases.map((p) => ({
      key: p.id as string, name: p.name, color: PHASE_COLOR[p.id],
      sequential: p.comparison?.sequentialMs ?? p.timeMs, parallel: p.timeMs,
    })),
    {
      key: 'other', name: 'Other sequential (setup, summarising)', color: PHASE_COLOR.other,
      sequential: pipeline.otherSequentialMs, parallel: pipeline.otherSequentialMs,
    },
  ]
  const rows = (['sequential', 'parallel'] as const).map((side) => ({
    name: side === 'sequential' ? 'All sequential' : 'With parallel phases',
    ...Object.fromEntries(series.map((s) => [s.key, s[side]])),
  }))
  return (
    <Card>
      <CardTitle aside={<StatusLabel status="Measured" />}>Full pipeline: sum of phase times, not an end-to-end timing</CardTitle>
      <p className="mb-2 text-sm text-muted">
        Each bar adds up separately measured phase times. Repetitions, output checks and saving are left out. Very short phases are
        too thin to see at this scale; the table has their values.
      </p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="#e4e9ef" />
            <XAxis type="number" unit=" ms" tick={{ fontSize: 12, fill: '#738196' }} tickFormatter={(v: number) => v.toFixed(0)} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: '#172b45' }} />
            <Tooltip formatter={(v) => ms(Number(v))} itemStyle={{ color: '#172b45' }} />
            <Legend itemSorter={null} wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span className="text-heading">{v}</span>} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} stackId="total" fill={s.color} stroke="#ffffff" strokeWidth={1} barSize={28} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-120 text-sm">
          <thead className="text-muted">
            <tr>
              <th className="border-b border-line py-1.5 text-left font-medium">Phase</th>
              <th className="border-b border-line py-1.5 text-right font-medium">All sequential</th>
              <th className="border-b border-line py-1.5 text-right font-medium">With parallel phases</th>
              <th className="border-b border-line py-1.5 pl-3 text-right font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.key}>
                <td className="py-1">{s.name}</td>
                <td className="py-1 text-right font-mono">{ms(s.sequential)}</td>
                <td className="py-1 text-right font-mono">{ms(s.parallel)}</td>
                <td className="py-1 pl-3 text-right"><StatusLabel status="Measured" /></td>
              </tr>
            ))}
            <tr className="border-t border-line font-semibold">
              <td className="py-1.5">Sum of phase times</td>
              <td className="py-1.5 text-right font-mono">{ms(pipeline.full.baselineMs)}</td>
              <td className="py-1.5 text-right font-mono">{ms(pipeline.full.parallelMs)}</td>
              <td className="py-1.5 pl-3 text-right"><StatusLabel status="Measured" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  )
}
