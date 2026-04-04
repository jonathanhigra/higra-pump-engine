import React from 'react'
import type { Tab } from '../App'

interface Props {
  currentTab: Tab
  hasSizing: boolean
  onNavigate: (tab: Tab) => void
}

interface NextStep {
  label: string
  tab: Tab
}

function getNextStep(currentTab: Tab, hasSizing: boolean): NextStep | null {
  if (!hasSizing) return null
  switch (currentTab) {
    case 'results':
      return { label: 'Ver Geometria 3D', tab: '3d' }
    case '3d':
    case 'meridional-editor':
    case 'meridional-drag':
      return { label: 'Analisar Perdas', tab: 'losses' }
    case 'losses':
    case 'curves':
    case 'velocity':
    case 'stress':
    case 'pressure':
    case 'multispeed':
    case 'spanwise':
    case 'noise':
      return { label: 'Otimizar Design', tab: 'optimize' }
    case 'optimize':
    case 'doe':
    case 'pareto':
      return { label: 'Exportar', tab: 'results' }
    default:
      return null
  }
}

export default function NextStepBanner({ currentTab, hasSizing, onNavigate }: Props) {
  const next = getNextStep(currentTab, hasSizing)
  if (!next) return null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(next.tab)}
      onKeyDown={e => { if (e.key === 'Enter') onNavigate(next.tab) }}
      style={{
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 12,
        background: 'rgba(0,160,223,0.10)',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(0,160,223,0.18)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(0,160,223,0.10)'
      }}
    >
      <span style={{
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--accent)',
        letterSpacing: '0.02em',
      }}>
        Proximo: {next.label}
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  )
}
