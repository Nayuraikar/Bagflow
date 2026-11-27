export const STATUS_MEANING = {
  Implemented: 'Implemented and runnable on this machine',
  Real: 'Real engine runs by the API on the named machine',
  Measured: 'From a run by the API on this machine, or computed only from such a run',
  Static: 'Saved result from an earlier run, possibly on another machine',
  Simplified: 'A simplified model or display rule, not a direct engine measurement',
  Planned: 'Not built yet',
  Unavailable: 'Unavailable on this machine',
} as const

export type Status = keyof typeof STATUS_MEANING
