import type { BenchmarkRun, Run } from '../../types/models'
import { int } from '../../utils/format'
import { RunPicker } from '../common/RunPicker'

const describe = (r: Run) => {
  const b = r as BenchmarkRun
  return `${int(b.bagCount)} bags, ${b.backends.join(', ')}`
}

export function BenchPicker({ runs, value, onChange }: { runs: BenchmarkRun[]; value: string | undefined; onChange: (id: string) => void }) {
  return runs.length ? <RunPicker label="Saved benchmark runs" runs={runs} value={value} onChange={onChange} describe={describe} /> : null
}
