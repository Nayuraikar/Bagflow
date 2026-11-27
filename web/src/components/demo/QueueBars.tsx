import type { NodeStats } from '../../types/ops'
import { int } from '../../utils/format'
import { BarList } from '../common/BarList'

export function QueueBars({ nodes }: { nodes: NodeStats[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Longest queue at each facility over the run (bags)</h3>
      <BarList rows={nodes.map((n) => ({ key: String(n.id), label: n.name, value: n.maxQueue, text: int(n.maxQueue) }))} />
    </div>
  )
}
