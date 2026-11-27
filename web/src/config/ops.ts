import type { BagStatus, FacilityStatus } from '../types/ops'

/** Colours of the API's facility display rule: green, amber, red, grey. */
export const FACILITY_STATUS: Record<FacilityStatus, { label: string; color: string }> = {
  normal: { label: 'Normal', color: '#2e9e5b' },
  high: { label: 'High', color: '#d99a35' },
  congested: { label: 'Congested', color: '#d95757' },
  offline: { label: 'Offline', color: '#9aa5b1' },
}

export const RULE_NAME = 'BagFlow display rule, not an airport standard'

export const BAG_STATUS_LABEL: Record<BagStatus, string> = {
  CHECKED_IN: 'Checked in', IDENTIFIED: 'Identified', SCREENING: 'Screening', CLEARED: 'Cleared (at sorter)',
  IN_TRANSIT: 'In transit', SORTED: 'Sorted', TRANSFER_PENDING: 'Transfer pending', LOADING: 'Loading',
  LOADED: 'Loaded on time', DELAYED: 'Delayed', MISROUTED: 'Misrouted', HELD_FOR_INSPECTION: 'Held for inspection',
}

/**
 * Statuses a table row can have. IDENTIFIED and SORTED appear only in timelines; the engine never
 * produces MISROUTED or TRANSFER_PENDING, so they are not offered.
 */
export const PLAYBACK_STATUSES: BagStatus[] = [
  'CHECKED_IN', 'SCREENING', 'HELD_FOR_INSPECTION', 'CLEARED', 'IN_TRANSIT', 'LOADING', 'LOADED', 'DELAYED',
]
export const FINAL_STATUSES: BagStatus[] = ['LOADED', 'DELAYED']

export const NOT_PRODUCED = 'The engine does not produce MISROUTED or TRANSFER_PENDING, so there is no count for either.'

export const PRIORITY_LABEL: Record<string, string> = {
  standard: 'Standard', priority: 'Priority', tight_connection: 'Tight connection',
}

/** What each scenario changes, from crates/bagflow-core/src/scenarios.rs. */
export const SCENARIO_NOTES: Record<string, string> = {
  Normal: 'The generated day as it is.',
  PeakSurge: 'Adds extra bags: about half as many again as arrive 17:00–18:00, each up to 10 minutes after its original.',
  ConveyorFailure: 'The link from Screening A to Sorter 1 is down 17:00–18:30.',
  ScreeningDelay: 'Screening A runs at 40% of its capacity 17:00–18:30.',
  ConnectingRush: 'About 60% of transfer bags arriving 17:00–18:30 become tight connections with at most 30 minutes to their deadline.',
  SorterOverload: 'Sends about 60% of the bags arriving 17:00–19:00 to Loading area 1. Sorter queues follow from routing toward it.',
}

/** Time of day the playback starts at, when the run covers it: the start of the evening peak. */
export const DEFAULT_PLAYBACK_MS = 18 * 3600 * 1000
