import type { ApiState } from '../hooks/useHealth'

const STATES: Record<ApiState, { text: string; dot: string }> = {
  checking: { text: 'Checking API…', dot: 'bg-muted' },
  online: { text: 'API connected', dot: 'bg-ops' },
  offline: { text: 'API unreachable', dot: 'bg-critical' },
}

export const Topbar = ({ api }: { api: ApiState }) => (
  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3 md:px-8">
    <span className="text-sm text-muted">Parallel Airport Processing &amp; Optimisation Studio</span>
    <span className="flex items-center gap-2 text-sm" role="status">
      <span className={`size-2 rounded-full ${STATES[api].dot}`} aria-hidden />
      {STATES[api].text}
    </span>
  </header>
)
