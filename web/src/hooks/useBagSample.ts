import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getBag, getBaggage } from '../services/runService'
import type { BagDetail } from '../types/ops'
import { isExpired } from './useRunData'

const ARRIVALS = 40
const TRAVELLING = 15
/** Roughly the time a bag needs to cross the network without waiting. */
const LOOKBACK_MS = 45_000
const PAGE = 500
const PARTS = 4

/**
 * A bounded set of real bag histories for one stretch of playback: bags arriving during it, spread
 * evenly, plus some on a link when it starts. The API has no sampling endpoint, so this pages the
 * bag list and looks each bag up.
 */
async function sample(runId: string, fromMs: number, windowMs: number): Promise<BagDetail[]> {
  const [first, last, travelling] = await Promise.all([
    getBaggage(runId, { page: 1, pageSize: 1, atMs: Math.max(0, fromMs - LOOKBACK_MS) }),
    getBaggage(runId, { page: 1, pageSize: 1, atMs: fromMs + windowMs }),
    getBaggage(runId, { page: 1, pageSize: TRAVELLING, atMs: fromMs, status: 'IN_TRANSIT' }),
  ])
  // in arrival order, the bags that had arrived by a time are the first (total - notArrived)
  const lo = first.counts.total - first.counts.notArrived
  const hi = last.counts.total - last.counts.notArrived
  const ids = new Set(travelling.items.map((b) => b.id))
  if (hi > lo) {
    const pages = new Map<number, Promise<number[]>>()
    const load = (page: number) => {
      let found = pages.get(page)
      if (!found) {
        found = getBaggage(runId, { sort: 'arrival', page, pageSize: PAGE }).then((r) => r.items.map((b) => b.id))
        pages.set(page, found)
      }
      return found
    }
    // a long stretch is sampled in a few parts spread across it, to bound the number of requests
    const parts = Math.min(PARTS, Math.ceil((hi - lo) / PAGE))
    const length = Math.min(PAGE, Math.floor((hi - lo) / parts))
    const each = Math.min(length, Math.ceil(ARRIVALS / parts))
    for (let part = 0; part < parts; part++) {
      const start = lo + Math.floor((part * (hi - lo)) / parts)
      for (let k = 0; k < each; k++) {
        const i = start + Math.floor((k * length) / each)
        const id = (await load(Math.floor(i / PAGE) + 1))[i % PAGE]
        if (id !== undefined) ids.add(id)
      }
    }
  }
  return Promise.all([...ids].map((id) => getBag(runId, id)))
}

export function useBagSample(runId: string, atMs: number, windowMs: number, enabled: boolean) {
  const from = Math.floor(atMs / windowMs) * windowMs
  // wait for the time to settle, so dragging the slider does not request every stretch
  const [settled, setSettled] = useState(from)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(from), 200)
    return () => clearTimeout(timer)
  }, [from])
  return useQuery({
    queryKey: ['bag-sample', runId, settled, windowMs],
    queryFn: () => sample(runId, settled, windowMs),
    enabled,
    staleTime: Infinity,
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    retry: (n, e) => !isExpired(e) && n < 1,
  })
}
