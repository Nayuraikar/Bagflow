import { useHealth } from '../../hooks/useHealth'
import { dateTime, int } from '../../utils/format'
import { Card, CardTitle } from '../common/Card'
import { DataState } from '../common/DataState'
import { StatusLabel } from '../common/StatusLabel'

export function EngineStatus() {
  const { data, error } = useHealth()
  if (!data) {
    return (
      <Card>
        <CardTitle>Engine status</CardTitle>
        <DataState error={error} />
      </Card>
    )
  }
  const available = data.backends.filter((b) => b.available)
  const unavailable = data.backends.filter((b) => !b.available)
  return (
    <Card>
      <CardTitle>Engine status</CardTitle>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted">Machine</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span>
              {data.machine.os} / {data.machine.arch}, <span className="font-mono">{int(data.machine.logicalCores)}</span> logical cores
            </span>
            <StatusLabel status="Measured" />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Engine</dt>
          <dd>
            {data.engine}, API <span className="font-mono">{data.version}</span> <StatusLabel status="Implemented" />
            {data.debugBuild && <span className="block text-critical">Debug build: timings are not representative.</span>}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Job queue (one job runs at a time)</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span>
              {data.queue.runningJobId ? <>running <span className="font-mono break-all">{data.queue.runningJobId}</span></> : 'idle'},{' '}
              <span className="font-mono">{int(data.queue.queued)}</span> of <span className="font-mono">{int(data.queue.maxQueued)}</span> waiting
            </span>
            <StatusLabel status="Measured" />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Last simulation finished</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{dateTime(data.lastSimulation?.finishedAt)}</span>
            {data.lastSimulation && <StatusLabel status="Measured" />}
          </dd>
        </div>
      </dl>

      <h3 className="mt-5 mb-2 flex items-center gap-2 text-sm font-semibold">
        Kernel backends available <StatusLabel status="Implemented" />
      </h3>
      <ul className="flex flex-wrap gap-2">
        {available.map((b) => (
          <li key={b.id} className="rounded-lg border border-line px-2.5 py-1 font-mono text-xs">
            {b.id}
            {b.detail && <span className="text-muted"> · {b.detail}</span>}
          </li>
        ))}
      </ul>

      <h3 className="mt-4 mb-2 flex items-center gap-2 text-sm font-semibold">
        Not available <StatusLabel status="Unavailable" />
      </h3>
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {unavailable.map((b) => (
          <li key={b.id}>
            <span className="font-mono text-xs">{b.id}</span> <span className="text-muted">— {b.reason ?? 'no reason given'}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
