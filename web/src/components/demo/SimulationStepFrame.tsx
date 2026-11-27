// The run panel and waiting states shared by the two simulation steps.

import type { ReactNode } from 'react'
import { useDemo } from '../../hooks/demo'
import { useBaselineJob } from '../../hooks/jobContext'
import { useApiState } from '../../hooks/useHealth'
import type { DemoRuns } from '../../hooks/useDemoRuns'
import type { SimulationConfig } from '../../types/models'
import { int } from '../../utils/format'
import { describeSimulation } from '../../utils/runs'
import { submitMessage } from '../../utils/submitMessage'
import { Card } from '../common/Card'
import { DataState } from '../common/DataState'
import { SimulationProgress } from '../experiments/SimulationProgress'
import { StepRunPanel } from './StepRunPanel'

export function SimulationStepFrame({ step, state, config, activeId, why, children }: {
  step: 'problem' | 'simulation'
  state: DemoRuns['problem']
  config: SimulationConfig
  /** The simulation the app is following, if any. */
  activeId: string | null
  why: string
  children: ReactNode
}) {
  const demo = useDemo()
  const offline = useApiState() === 'offline'
  const { submit, submitting, submitError, outcome } = useBaselineJob()
  const hasResult = state.metrics.data !== undefined
  const waiting = state.status === 'queued' || state.status === 'running'
  const lost = state.fresh && outcome?.id === state.id && outcome?.result === 'lost'
  return (
    <>
      <StepRunPanel
        state={state} hasResult={hasResult} submitting={submitting} wait="One job on the API: dataset, kernel, simulation and aggregation."
        call={<><span className="font-mono text-xs break-words">POST /api/simulations</span>: {describeSimulation(config, int)} requested. {why}</>}
        onRun={() => submit(config, (id) => demo.setSubmitted(step, id))}
        blocked={activeId && activeId !== state.id ? 'The app is already following another simulation. Wait for it to finish, or skip this step.' : null}
        error={submitError ? submitMessage(submitError) : null}
      />
      {state.status === 'failed' && <Card className="text-sm text-critical"><p role="alert">This run failed: {state.run?.error ?? 'no reason given'}</p></Card>}
      {lost && <Card className="text-sm text-critical"><p>The API lost this job before it finished. Run it again.</p></Card>}
      {waiting && (
        <Card>
          {activeId === state.id ? <SimulationProgress /> : <p className="text-sm">{offline ? 'API unreachable. Progress is unknown.' : `This run is ${state.status}.`}</p>}
        </Card>
      )}
      {state.status === 'done' && !hasResult && <Card><DataState error={state.metrics.error} /></Card>}
      {children}
    </>
  )
}
