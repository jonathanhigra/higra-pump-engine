import React from 'react'
import { type Tab, type Section, sectionForTab, SUB_TABS } from './Sidebar'

interface Props {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  recentTabs?: Tab[]
  sizing?: {
    estimated_efficiency: number
    estimated_npsh_r: number
    specific_speed_nq: number
    impeller_d2: number
    estimated_power: number
  } | null
}

export default function SubTabBar({ activeTab, onTabChange, recentTabs = [], sizing }: Props) {
  const section: Section = sectionForTab(activeTab)
  const tabs = SUB_TABS[section]

  if (!tabs || tabs.length <= 1) return null

  return (
    <div style={{
      display: 'flex',
      gap: 0,
      borderBottom: '1px solid var(--border-primary)',
      marginBottom: 20,
      overflowX: 'auto',
    }}>
      {tabs.map(t => {
        const isActive = t.key === activeTab
        return (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              background: 'none',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s, border-color 0.15s',
              fontFamily: 'var(--font-family)',
              position: 'relative',
            }}
            onMouseEnter={e => {
              if (!isActive) (e.target as HTMLElement).style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={e => {
              if (!isActive) (e.target as HTMLElement).style.color = 'var(--text-muted)'
            }}
          >
            {t.label}
            {/* #9 — metric badge per tab */}
            {sizing && (() => {
              const etaColor = sizing.estimated_efficiency >= 0.8 ? '#22c55e' : sizing.estimated_efficiency >= 0.7 ? '#f59e0b' : '#ef4444'
              const badges: Partial<Record<Tab, { val: string; color: string }>> = {
                'overview': { val: `${(sizing.estimated_efficiency * 100).toFixed(0)}%`, color: etaColor },
                'results':  { val: `η ${(sizing.estimated_efficiency * 100).toFixed(0)}%`, color: 'var(--accent)' },
                'curves':   { val: `Nq${sizing.specific_speed_nq.toFixed(0)}`, color: 'var(--text-muted)' },
                'losses':   { val: `${sizing.estimated_npsh_r.toFixed(1)}m`, color: sizing.estimated_npsh_r < 5 ? '#22c55e' : '#f59e0b' },
                'velocity': { val: `${(sizing.impeller_d2 * 1000).toFixed(0)}mm`, color: 'var(--text-muted)' },
              }
              const badge = badges[t.key]
              if (!badge) return null
              return (
                <span style={{
                  marginLeft: 5, fontSize: 9, padding: '1px 5px', borderRadius: 8,
                  background: `${badge.color}18`, border: `1px solid ${badge.color}40`,
                  color: badge.color, fontWeight: 600, verticalAlign: 'middle', lineHeight: '14px',
                }}>{badge.val}</span>
              )
            })()}
            {!isActive && recentTabs.includes(t.key) && (
              <span style={{
                position: 'absolute', top: 6, right: 6,
                width: 5, height: 5, borderRadius: '50%',
                background: 'var(--accent)', opacity: 0.5,
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}
