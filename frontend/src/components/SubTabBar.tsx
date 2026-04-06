import React from 'react'
import { type Tab, type Section, sectionForTab, SUB_TABS } from './Sidebar'

interface Props {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  recentTabs?: Tab[]
}

export default function SubTabBar({ activeTab, onTabChange, recentTabs = [] }: Props) {
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
