import React from 'react'
import { type Tab, type Section, SUB_TABS } from './Sidebar'

interface Props {
  projectName?: string
  section: Section
  tab: Tab
  onNavigate: (page: 'projects' | 'design', tab?: Tab) => void
}

const SECTION_LABELS: Record<Section, string> = {
  projects: 'Projetos',
  templates: 'Templates',
  design: 'Design',
  geometry: 'Geometria',
  analysis: 'Análise',
  optimization: 'Otimização',
  assistant: 'Assistente',
}

const SECTION_HINTS: Record<string, string> = {
  projects: 'Lista de projetos',
  templates: 'Templates pre-configurados',
  design: 'Dimensionamento e curvas',
  geometry: 'Rotor 3D e editor meridional',
  analysis: 'Perdas, pressao, velocidades',
  optimization: 'NSGA-II, Pareto, DoE',
  assistant: 'Assistente de projeto',
}

export default function Breadcrumb({ projectName, section, tab, onNavigate }: Props) {
  const subTabs = SUB_TABS[section] || []
  const currentSubTab = subTabs.find(t => t.key === tab)

  const items: { label: string; hint?: string; onClick?: () => void }[] = [
    { label: 'HPE', onClick: () => onNavigate('projects') },
  ]

  if (projectName) {
    items.push({ label: projectName, onClick: () => onNavigate('design', 'results') })
  }

  if (section !== 'projects') {
    const sectionDefaultTab = subTabs.length > 0 ? subTabs[0].key : tab
    items.push({
      label: SECTION_LABELS[section],
      hint: SECTION_HINTS[section],
      onClick: currentSubTab ? () => onNavigate('design', sectionDefaultTab) : undefined,
    })
  }

  if (currentSubTab && subTabs.length > 1) {
    items.push({ label: currentSubTab.label })
  }

  return (
    <div style={{
      height: 36,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '0 24px',
      background: 'var(--bg-elevated)',
      borderBottom: '1px solid var(--border-subtle)',
      fontSize: 12,
      fontFamily: 'var(--font-family)',
      flexShrink: 0,
    }}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <span style={{ color: 'var(--text-muted)', userSelect: 'none' }}>&#8250;</span>
            )}
            {isLast ? (
              <span style={{ color: 'var(--accent)', fontWeight: 600 }} title={item.hint}>
                {item.label}
              </span>
            ) : (
              <span
                role="button"
                tabIndex={0}
                onClick={item.onClick}
                onKeyDown={e => { if (e.key === 'Enter' && item.onClick) item.onClick() }}
                title={item.hint}
                style={{
                  color: 'var(--text-muted)',
                  cursor: item.onClick ? 'pointer' : 'default',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => {
                  if (item.onClick) (e.currentTarget as HTMLElement).style.color = 'var(--accent)'
                }}
                onMouseLeave={e => {
                  if (item.onClick) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                }}
              >
                {item.label}
              </span>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
