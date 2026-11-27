import { useApiState } from '../../hooks/useHealth'
import { isUnreachable } from '../../services/http'

/** Why a section has nothing to show yet. An unreachable API is never reported as "no data". */
export function DataState({ error }: { error: Error | null }) {
  const api = useApiState()
  let text = 'Loading…'
  if (api === 'offline' || isUnreachable(error)) text = 'API unreachable'
  else if (error) text = `The API returned an error: ${error.message}`
  return <p className="py-2 text-sm text-muted">{text}</p>
}
