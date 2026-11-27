import type { JobProgress } from '../types/models'
import type { WireProgress } from '../types/wire'
import { toProgress } from './adapters'

/**
 * Follow a job's server-sent events (`progress`, `done`, `failed`). The stream is closed after
 * `done`, `failed` or the first connection error; the caller decides whether to reopen it.
 * Returns a function that stops watching.
 */
export function openJobEvents(url: string, on: { progress: (p: JobProgress) => void; error: () => void }): () => void {
  const source = new EventSource(url)
  const handle = (finished: boolean) => (event: MessageEvent<string>) => {
    if (finished) source.close()
    on.progress(toProgress(JSON.parse(event.data) as WireProgress))
  }
  source.addEventListener('progress', handle(false))
  source.addEventListener('done', handle(true))
  source.addEventListener('failed', handle(true))
  source.onerror = () => {
    source.close()
    on.error()
  }
  return () => source.close()
}
