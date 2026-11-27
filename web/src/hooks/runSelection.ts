import { createContext, useContext, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import type { SimulationRun } from '../types/models'
import { useHistory } from './useHistory'

export const RunSelectionContext = createContext<{ selected: string | null; select: (id: string | null) => void } | null>(null)

/**
 * The simulation the Operations pages show: `?sim=` in the URL, else the last one chosen, else the
 * newest finished one.
 */
export function useSelectedRun() {
  const context = useContext(RunSelectionContext)
  if (!context) throw new Error('useSelectedRun needs RunSelectionProvider')
  const { selected, select } = context
  const history = useHistory()
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('sim')
  useEffect(() => {
    if (fromUrl !== null && fromUrl !== selected) select(fromUrl)
  }, [fromUrl, selected, select])

  const runs = history.data?.filter((r): r is SimulationRun => r.kind === 'simulation') ?? []
  const finished = runs.filter((r) => r.status === 'done')
  const id = fromUrl ?? selected ?? finished[0]?.id
  return {
    history,
    finished,
    id,
    /** `undefined` while loading, or when the API has no such run. */
    run: runs.find((r) => r.id === id),
    choose: (next: string) => {
      select(next)
      setParams((p) => {
        p.set('sim', next)
        return p
      }, { replace: true })
    },
  }
}
