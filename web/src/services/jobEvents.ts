import type { JobProgress } from "../types/models";

/**
 * Follow a job's server-sent events (`progress`, `done`, `failed`). The stream is closed
 * after `done` or `failed`. `lost(false)` means the browser is reconnecting; `lost(true)`
 * means it gave up. Returns a function that stops watching.
 */
export function watchJob<T extends JobProgress>(
  url: string,
  on: { progress: (p: JobProgress) => void; lost: (closed: boolean) => void },
): () => void {
  const source = new EventSource(url);
  const handle = (finished: boolean) => (event: MessageEvent<string>) => {
    if (finished) source.close();
    on.progress(JSON.parse(event.data) as T);
  };
  source.addEventListener("progress", handle(false));
  source.addEventListener("done", handle(true));
  source.addEventListener("failed", handle(true));
  source.onerror = () => on.lost(source.readyState === EventSource.CLOSED);
  return () => source.close();
}
