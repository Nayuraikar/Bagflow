import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState, type ReactNode } from 'react'
import { JobContext, type BaselineJob } from '../hooks/jobContext'
import { useHistory } from '../hooks/useHistory'
import { useJobProgress } from '../hooks/useJobProgress'
import { createSimulation, getSimulation } from '../services/simulationService'

/**
 * Follows one simulation at a time, matching the API, which runs one job at a time. It lives above
 * the router so progress survives navigation, and it picks up a queued or running simulation from
 * the history, so it also survives a reload.
 */
export function JobProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const history = useHistory()
  const [watchedId, setWatchedId] = useState<string | null>(null)
  const [ended, setEnded] = useState<string[]>([])
  const [outcome, setOutcome] = useState<BaselineJob['outcome']>(null)

  // the history is newest first and the worker takes the oldest job first
  const adopted =
    history.data?.findLast((r) => r.kind === 'simulation' && (r.status === 'running' || r.status === 'queued') && !ended.includes(r.id))
      ?.id ?? null
  if (watchedId === null && adopted !== null) setWatchedId(adopted)

  const onFinished = useCallback(
    (id: string) => {
      setEnded((e) => [...e, id])
      setWatchedId(null)
      void client.invalidateQueries({ queryKey: ['history'] })
      void client.invalidateQueries({ queryKey: ['health'] })
      getSimulation(id).then(
        (run) => setOutcome({ id, result: run.status === 'failed' ? 'failed' : 'done', error: run.error }),
        () => setOutcome({ id, result: 'lost', error: null }),
      )
    },
    [client],
  )
  const active = useJobProgress(watchedId, onFinished)

  const create = useMutation({
    mutationFn: createSimulation,
    onSuccess: ({ id }) => {
      setWatchedId(id)
      void client.invalidateQueries({ queryKey: ['health'] })
      void client.invalidateQueries({ queryKey: ['history'] })
    },
  })

  const value: BaselineJob = {
    activeId: watchedId,
    active,
    outcome,
    submitting: create.isPending,
    submitError: create.error,
    submit: (config, onCreated) => {
      if (watchedId !== null || create.isPending) return
      setOutcome(null)
      create.mutate(config, { onSuccess: ({ id }) => onCreated?.(id) })
    },
  }
  return <JobContext value={value}>{children}</JobContext>
}
