/** An error response from the API (with its code), or a failure to reach it. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const TIMEOUT_MS = 10_000

const unreachable = (status: number) => new ApiError(status, 'unreachable', 'API unreachable')

export const isUnreachable = (e: unknown) => e instanceof ApiError && e.code === 'unreachable'

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  let body: unknown
  try {
    response = await fetch(path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    body = await response.json().catch(() => null)
  } catch {
    throw unreachable(0)
  }
  if (!response.ok) {
    const error = (body as { error?: { code: string; message: string } } | null)?.error
    // every API error has this shape, so anything else is the dev proxy failing to reach it
    if (!error) throw unreachable(response.status)
    throw new ApiError(response.status, error.code, error.message)
  }
  if (body === null) throw new ApiError(response.status, 'bad_response', `${path} did not return JSON`)
  return body as T
}

export const postJson = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
