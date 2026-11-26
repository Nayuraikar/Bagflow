/** Shown wherever a value is unavailable. */
export const NA = "--";

export const formatInt = (v: number | null | undefined) =>
  v === null || v === undefined ? NA : Math.round(v).toLocaleString("en-US");

export const formatPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? NA : `${v.toFixed(digits)}%`;

/** Simulation time (ms since midnight of the synthetic day) as HH:MM, with +Nd past midnight. */
export function formatSimTime(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}${days ? ` +${days}d` : ""}`;
}

/** Wall-clock time of a job (Unix ms). */
export const formatDateTime = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : NA;
