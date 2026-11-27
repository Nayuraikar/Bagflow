/** Shown wherever there is no value. */
export const EMPTY = '--'

type Num = number | null | undefined

const fmt = (v: Num, f: (n: number) => string) => (v === null || v === undefined || !Number.isFinite(v) ? EMPTY : f(v))

export const int = (v: Num) => fmt(v, (n) => n.toLocaleString('en-US'))
export const fixed = (v: Num, digits: number) => fmt(v, (n) => n.toFixed(digits))
export const times = (v: Num, digits = 2) => fmt(v, (n) => `${n.toFixed(digits)}x`)
/** `v` is already in percent. */
export const pct = (v: Num, digits = 1) => fmt(v, (n) => `${n.toFixed(digits)}%`)
export const ms = (v: Num) => fmt(v, (n) => `${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)} ms`)
export const dateTime = (v: Num) => fmt(v, (n) => new Date(n).toLocaleString())
