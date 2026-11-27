import { ApiError, isUnreachable } from '../services/http'

export function submitMessage(e: Error) {
  if (isUnreachable(e)) return 'API unreachable. The run was not submitted.'
  if (e instanceof ApiError && e.code === 'queue_full') return `The job queue is full (${e.message}). Try again when a job finishes.`
  return `The run was not accepted: ${e.message}`
}
