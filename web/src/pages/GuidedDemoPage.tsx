import { ArrowLeft, ArrowRight, Check, SkipForward } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { Card } from '../components/common/Card'
import { DataState } from '../components/common/DataState'
import { ParallelStep } from '../components/demo/ParallelStep'
import { ProblemStep } from '../components/demo/ProblemStep'
import { ResultsStep } from '../components/demo/ResultsStep'
import { SimulationStep } from '../components/demo/SimulationStep'
import { SweepStep } from '../components/demo/SweepStep'
import { STEPS, type RunStepId } from '../config/demo'
import { useDemo } from '../hooks/demo'
import { useDemoRuns } from '../hooks/useDemoRuns'
import { useHealth } from '../hooks/useHealth'
import { useHistory } from '../hooks/useHistory'

const BUTTON = 'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-40'

export function GuidedDemoPage() {
  const [params, setParams] = useSearchParams()
  const wanted = Number(params.get('step') ?? 1)
  const index = Number.isInteger(wanted) && wanted >= 1 && wanted <= STEPS.length ? wanted - 1 : 0
  const step = STEPS[index]
  const demo = useDemo()
  const runs = useDemoRuns()
  const health = useHealth()
  const history = useHistory()

  const results: Record<RunStepId, boolean> = {
    problem: runs.problem.metrics.data !== undefined,
    workload: runs.workload.metrics.data !== undefined,
    kernel: runs.kernel.metrics.data !== undefined,
    simulation: runs.simulation.metrics.data !== undefined,
    sweep: runs.sweep.metrics.data !== undefined,
  }
  const hasResult = step.id === 'results' || results[step.id]
  const goTo = (i: number) => setParams({ step: String(i + 1) })

  // after moving between steps, start reading at the top of the new one
  const heading = useRef<HTMLHeadingElement>(null)
  const shown = useRef(index)
  useEffect(() => {
    if (shown.current === index) return
    shown.current = index
    window.scrollTo({ top: 0 })
    heading.current?.focus({ preventScroll: true })
  }, [index])

  const next = () => {
    if (step.id !== 'results') demo.setSkipped(step.id, !hasResult)
    goTo(index + 1)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Guided Demo</h1>
        <p className="text-sm text-muted">Six steps, each backed by a real API run. Nothing runs until you press its button.</p>
      </div>

      <nav aria-label="Demo steps">
        <ol className="grid grid-cols-3 gap-2 lg:grid-cols-6">
          {STEPS.map((s, i) => {
            const done = s.id !== 'results' && results[s.id]
            const skipped = s.id !== 'results' && !done && demo.skipped.includes(s.id)
            return (
              <li key={s.id}>
                <button
                  type="button" onClick={() => goTo(i)} aria-current={i === index ? 'step' : undefined}
                  className={`h-full w-full rounded-lg border px-2 py-2 text-left text-xs ${i === index ? 'border-ops bg-ops/10 font-semibold text-ops' : 'border-line bg-surface'}`}
                >
                  <span className="flex items-center gap-1">{i + 1}.{done && <Check size={12} aria-hidden />}</span>
                  <span className="block">{s.title}</span>
                  <span className="block text-[10px] font-normal text-muted">{done ? 'Result ready' : skipped ? 'Skipped' : s.id === 'results' ? 'Summary' : 'No result'}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
        Step {index + 1} of {STEPS.length}: {step.title} <span className="font-normal text-muted">— {step.subtitle}</span>
      </h2>

      {(!health.data || !history.data) && <Card><DataState error={health.error ?? history.error} /></Card>}

      <div className="space-y-4">
        {step.id === 'problem' && <ProblemStep runs={runs} />}
        {(step.id === 'workload' || step.id === 'kernel') && <ParallelStep key={step.id} step={step.id} runs={runs} />}
        {step.id === 'simulation' && <SimulationStep runs={runs} />}
        {step.id === 'sweep' && <SweepStep runs={runs} />}
        {step.id === 'results' && <ResultsStep runs={runs} goTo={goTo} />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} className={`${BUTTON} border-line bg-surface`}>
          <ArrowLeft size={15} aria-hidden /> Back
        </button>
        <span className="text-sm text-muted">Step {index + 1} of {STEPS.length}</span>
        {index < STEPS.length - 1 ? (
          <button type="button" onClick={next} className={`${BUTTON} ${hasResult ? 'border-ops bg-ops text-white' : 'border-warning bg-warning/15'}`}>
            {hasResult ? <>Next <ArrowRight size={15} aria-hidden /></> : <>Skip this step <SkipForward size={15} aria-hidden /></>}
          </button>
        ) : (
          <button type="button" onClick={() => goTo(0)} className={`${BUTTON} border-line bg-surface`}>Back to step 1</button>
        )}
      </div>
    </div>
  )
}
