import { useSearchParams } from 'react-router'
import { Card } from '../components/common/Card'
import { StatusLabel } from '../components/common/StatusLabel'
import { StageContribution } from '../components/stages/StageContribution'
import { STAGES, type BaggageStage } from '../config/stages'

function Model({ model }: { model: BaggageStage['model'] }) {
  if (model === 'Simplified') return <StatusLabel status="Simplified" />
  if (model === 'Modelled') return <StatusLabel status="Implemented" />
  return <span className="rounded-full border border-dashed border-muted/60 px-2 py-0.5 text-[11px] font-medium">Not modelled</span>
}

export function StageExplorerPage() {
  const [params, setParams] = useSearchParams()
  const stage = STAGES.find((s) => s.id === params.get('stage')) ?? STAGES[0]
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Stage Explorer</h1>
        <p className="text-sm text-muted">
          The seven baggage stages. The simulation itself is sequential; the parallel work listed here runs beside it, on whole batches.
        </p>
      </div>
      <nav aria-label="Baggage stages" className="flex flex-wrap gap-2">
        {STAGES.map((s, i) => (
          <button
            key={s.id} type="button" aria-current={s.id === stage.id ? 'step' : undefined}
            onClick={() => setParams({ stage: s.id }, { replace: true })}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${s.id === stage.id ? 'border-ops bg-ops/10 font-semibold text-ops' : 'border-line bg-surface'}`}
          >
            <span className="block">{i + 1}. {s.name}</span>
            <span className="block text-[11px] font-normal text-muted">{s.work ? 'Has parallel work' : 'Not implemented'}</span>
          </button>
        ))}
      </nav>
      <Card>
        <h2 className="mb-1 flex flex-wrap items-center gap-2 text-lg font-semibold">
          {stage.name} <span className="text-sm font-normal text-muted">Engine model:</span> <Model model={stage.model} />
        </h2>
        <p className="text-sm text-muted">Not in the engine: {stage.missing}</p>
      </Card>
      <StageContribution key={stage.id} stage={stage} />
    </div>
  )
}
