import type { Experiment } from '../../types/sweep'
import { describeExperiment } from '../../utils/sweep'
import { workerColor } from '../parallel/style'

export interface Cell {
  state: 'waiting' | 'running' | 'completed' | 'failed'
  worker: number | null
}

/** One cell per experiment in grid order, coloured by the worker that ran it. */
export function ExperimentGrid({ cells, experiments, selected, onSelect }: {
  cells: Cell[]
  /** Absent while the job runs: the API sends the experiment list with the result. */
  experiments?: Experiment[]
  selected?: number
  onSelect?: (index: number) => void
}) {
  return (
    <>
      <ul className="flex flex-wrap gap-1" aria-label="Experiment grid">
        {cells.map((c, i) => {
          const color = c.worker === null ? '#cfd6df' : workerColor(c.worker)
          const label = `experiment ${i}${experiments ? `: ${describeExperiment(experiments[i])}` : ''}, ${c.state}${c.worker === null ? '' : `, worker ${c.worker}`}`
          return (
            <li key={i}>
              <button
                type="button" title={label} aria-label={label} data-state={c.state} disabled={!onSelect}
                onClick={() => onSelect?.(i)}
                className={`flex h-7 min-w-7 items-center justify-center rounded border px-1 font-mono text-[10px] disabled:cursor-default ${
                  c.state === 'completed' ? 'text-white' : ''} ${selected === i ? 'ring-2 ring-heading ring-offset-1' : ''}`}
                style={{
                  borderColor: c.state === 'failed' ? '#d95757' : color,
                  borderWidth: c.state === 'running' || c.state === 'failed' ? 3 : 1,
                  background: c.state === 'completed' ? color : undefined,
                }}
              >
                {c.state === 'failed' ? '✕' : i}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Grey outline: not started. Thick outline: running. Filled: completed, in its worker’s colour. ✕: failed.
      </p>
    </>
  )
}
