const WORKER_COLORS = ['#3975ce', '#168c7d', '#b8641f', '#7c5cbf', '#b03a6f', '#5f7d1f', '#2a8bab', '#8a5a44']

export const workerColor = (worker: number) => WORKER_COLORS[worker % WORKER_COLORS.length]

export const MERGE_COLOR = '#172b45'

/** A parallel stage the API gives no per-task records for. */
export const HATCH = 'repeating-linear-gradient(45deg, #9aa5b5 0 4px, #cfd6df 4px 8px)'

export const STAGE_NAMES: Record<string, string> = {
  draw_flights: 'draw flights', generate_bags: 'generate bags', append: 'append (merge)', sort: 'sort',
  build_columns: 'build columns', merge: 'merge',
}
