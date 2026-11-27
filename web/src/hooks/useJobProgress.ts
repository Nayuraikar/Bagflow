import { useEffect, useRef, useState } from 'react'
import { ApiError, isUnreachable } from '../services/http'
import { openJobEvents } from '../services/jobEvents'
import { getSimulation, simulationPath } from '../services/simulationService'
import type { JobProgress } from '../types/models'

/** `lost`: the API answers but no longer knows the job (it restarted before the job finished). */
export type JobLink = 'connecting' | 'live' | 'unreachable' | 'lost'

export interface WatchedJob {
  progress: JobProgress | null
  link: JobLink
}

const CHECK_MS = 2000
const finished = (p: JobProgress) => p.status === 'done' || p.status === 'failed'

/**
 * Progress of one simulation job over SSE. A proxy can keep a dead stream open and phases can be
 * silent for a while, so a quiet stream is also checked against the job record. `onFinished` is
 * called once, when the job is done, failed or lost.
 */
export function useJobProgress(id: string | null, onFinished: (id: string) => void): WatchedJob {
  const [state, setState] = useState<WatchedJob & { id: string | null }>({ id: null, progress: null, link: 'connecting' })
  const onFinishedRef = useRef(onFinished)
  useEffect(() => {
    onFinishedRef.current = onFinished
  })

  useEffect(() => {
    if (id === null) return
    let over = false
    let close: (() => void) | null = null
    let heardAt = Date.now()
    let checking = false
    let last: JobProgress | null = null

    const show = (link: JobLink, progress: JobProgress | null = last) => {
      last = progress
      setState({ id, progress, link })
    }
    const stop = () => {
      over = true
      clearInterval(timer)
      close?.()
    }
    const end = (link: JobLink, progress: JobProgress | null) => {
      stop()
      show(link, progress)
      onFinishedRef.current(id)
    }
    const take = (p: JobProgress) => {
      if (over) return
      heardAt = Date.now()
      if (finished(p)) end('live', p)
      else show('live', p)
    }
    const connect = () => {
      close = openJobEvents(`${simulationPath(id)}/events`, {
        progress: take,
        error: () => {
          close = null
          void check()
        },
      })
    }
    const check = async () => {
      if (checking || over) return
      checking = true
      try {
        const run = await getSimulation(id)
        if (over) return
        if (run.status === 'done' || run.status === 'failed') {
          end('live', { status: run.status, phase: run.status, done: last?.done ?? 0, total: last?.total ?? 0, error: run.error })
        } else if (!close) {
          connect()
        }
      } catch (e) {
        if (over) return
        if (e instanceof ApiError && e.status === 404 && e.code === 'not_found') end('lost', last)
        else if (isUnreachable(e)) {
          // reopen the stream once the API answers again
          close?.()
          close = null
          show('unreachable')
        }
      } finally {
        checking = false
      }
    }
    const timer = setInterval(() => {
      if (!close || Date.now() - heardAt >= CHECK_MS) void check()
    }, CHECK_MS)
    connect()
    return stop
  }, [id])

  // never show the previous job's progress for a new one
  return state.id === id ? state : { progress: null, link: 'connecting' }
}
