import type { PhaseId, PipelinePhase } from '../../types/models'

/** Chart colours, checked with the colour-blind validator in this stacking order. */
export const PHASE_COLOR: Record<PhaseId | 'other', string> = {
  generate: '#3975ce',
  classify: '#b8641f',
  simulate: '#7c5cbf',
  aggregate: '#0a927f',
  other: '#9aa5b5',
}

export function phaseMethod(p: PipelinePhase) {
  switch (p.id) {
    case 'generate':
      return 'Parallel: Rayon'
    case 'classify':
      return `Selected kernel: ${p.backend}`
    case 'simulate':
      return 'Sequential'
    case 'aggregate':
      return `Parallel reduction: ${p.backend}`
  }
}
