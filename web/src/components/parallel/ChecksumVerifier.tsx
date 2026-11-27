import { CircleCheck, CircleX } from 'lucide-react'
import type { ParallelMetrics } from '../../types/parallel'
import { checksumsMatch } from '../../utils/telemetry'
import { Stat } from './Stat'

export function ChecksumVerifier({ m }: { m: ParallelMetrics }) {
  const ok = checksumsMatch(m)
  return (
    <div role="status" className={`rounded-lg border p-3 ${ok ? 'border-ops/50 bg-ops/10' : 'border-critical bg-critical/10'}`}>
      <p className={`mb-2 flex items-center gap-2 font-semibold ${ok ? 'text-ops' : 'text-critical'}`}>
        {ok ? <CircleCheck size={18} aria-hidden /> : <CircleX size={18} aria-hidden />}
        {ok
          ? 'Checksum match: every timed repetition on both sides gave the sequential result'
          : m.resultChecksum === m.sequentialChecksum
            ? 'Checksum mismatch in at least one timed repetition (the two median runs shown agree)'
            : 'Checksum mismatch: the result differs from the sequential one'}
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <Stat label="Sequential checksum" value={m.sequentialChecksum} />
        <Stat label={`${m.backend} checksum`} value={m.resultChecksum} />
      </dl>
    </div>
  )
}
