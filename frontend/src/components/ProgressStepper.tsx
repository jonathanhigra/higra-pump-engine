import React from 'react'
import type { SizingResult, Tab } from '../App'

interface Props {
  sizing: SizingResult | null
  activeTab: Tab
  completedSteps: string[]
  onStepClick?: (step: string) => void
}

interface Step {
  id: string
  label: string
  tab: Tab
}

const STEPS: Step[] = [
  { id: 'dados', label: 'Dados', tab: 'results' },
  { id: 'sizing', label: 'Sizing', tab: 'results' },
  { id: 'geometria', label: 'Geometria', tab: '3d' },
  { id: 'analise', label: 'Análise', tab: 'curves' },
  { id: 'otimizacao', label: 'Otimização', tab: 'optimize' },
  { id: 'exportar', label: 'Exportar', tab: 'results' },
]

function isStepActive(step: Step, activeTab: Tab): boolean {
  if (step.id === 'dados') return activeTab === 'results'
  if (step.id === 'sizing') return activeTab === 'results'
  if (step.id === 'geometria') return activeTab === '3d' || activeTab === 'meridional-editor' || activeTab === 'meridional-drag'
  if (step.id === 'analise') return ['curves', 'velocity', 'losses', 'stress', 'pressure', 'multispeed', 'spanwise', 'noise'].includes(activeTab)
  if (step.id === 'otimizacao') return ['optimize', 'doe', 'pareto'].includes(activeTab)
  if (step.id === 'exportar') return false
  return false
}

export default function ProgressStepper({ sizing, activeTab, completedSteps, onStepClick }: Props) {
  // Find the furthest completed step index
  const completedSet = new Set(completedSteps)

  // Determine current active step index
  let activeIdx = -1
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (isStepActive(STEPS[i], activeTab)) {
      activeIdx = i
      break
    }
  }

  // Find the next incomplete step (first non-completed step after the current one)
  let nextIncompleteIdx = -1
  for (let i = 0; i < STEPS.length; i++) {
    if (!completedSet.has(STEPS[i].id) && i !== activeIdx) {
      nextIncompleteIdx = i
      break
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      height: 40, padding: '0 8px',
      width: '100%',
    }}>
      {STEPS.map((step, i) => {
        const isCompleted = completedSet.has(step.id)
        const isCurrent = i === activeIdx
        const isNextIncomplete = i === nextIncompleteIdx
        const isFuture = !isCompleted && !isCurrent
        const isClickable = isCompleted && onStepClick

        return (
          <React.Fragment key={step.id}>
            {/* Connector line (before step, except first) */}
            {i > 0 && (
              <div style={{
                flex: 1, height: 2, minWidth: 12,
                background: isCompleted || isCurrent
                  ? 'var(--accent)'
                  : 'var(--border-primary)',
                transition: 'background 0.3s',
              }} />
            )}

            {/* Step circle + label */}
            <div
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onClick={() => isClickable && onStepClick!(step.id)}
              onKeyDown={e => { if (isClickable && e.key === 'Enter') onStepClick!(step.id) }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2, cursor: isClickable ? 'pointer' : 'default',
                position: 'relative',
              }}
              title={step.label}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700,
                transition: 'all 0.3s',
                ...(isCompleted ? {
                  background: 'var(--accent)',
                  border: '2px solid var(--accent)',
                  color: '#fff',
                } : isCurrent ? {
                  background: 'var(--accent)',
                  border: '2px solid var(--accent)',
                  color: '#fff',
                  boxShadow: '0 0 0 3px rgba(0,160,223,0.25)',
                  animation: 'pulse-step 2s ease-in-out infinite',
                } : isNextIncomplete ? {
                  background: 'transparent',
                  border: '2px solid var(--accent)',
                  color: 'var(--accent)',
                  animation: 'pulse-next-step 2s ease-in-out infinite',
                } : {
                  background: 'transparent',
                  border: '2px solid var(--border-primary)',
                  color: 'var(--text-muted)',
                }),
              }}>
                {isCompleted ? (
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span style={{
                fontSize: 9, fontWeight: 500,
                color: isCompleted || isCurrent ? 'var(--accent)' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
                transition: 'color 0.3s',
              }}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        )
      })}

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse-step {
          0%, 100% { box-shadow: 0 0 0 3px rgba(0,160,223,0.25); }
          50% { box-shadow: 0 0 0 6px rgba(0,160,223,0.1); }
        }
        @keyframes pulse-next-step {
          0%, 100% { box-shadow: 0 0 0 0px rgba(0,160,223,0); border-color: var(--accent); }
          50% { box-shadow: 0 0 0 4px rgba(0,160,223,0.15); border-color: var(--accent); }
        }
      `}</style>
    </div>
  )
}
