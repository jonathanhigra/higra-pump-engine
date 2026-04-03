import React, { useState } from 'react'
import Sidebar, { type Tab } from './Sidebar'
import SubTabBar from './SubTabBar'

interface Props {
  page: 'projects' | 'design'
  activeTab: Tab | null
  userName: string
  onNavigate: (page: 'projects' | 'design', tab?: Tab) => void
  onLogout: () => void
  children: React.ReactNode
  noPad?: boolean
}

export type { Tab }

export default function Layout({ page, activeTab, userName, onNavigate, onLogout, children, noPad }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('hpe_sidebar_collapsed') === 'true'
  })

  const handleToggle = () => {
    const next = !isCollapsed
    setIsCollapsed(next)
    localStorage.setItem('hpe_sidebar_collapsed', String(next))
  }

  return (
    <>
      <Sidebar
        page={page}
        activeTab={activeTab}
        userName={userName}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggle}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
      <div className={`main-content${isCollapsed ? ' collapsed' : ''}${noPad ? ' no-pad' : ''}`}>
        {/* Horizontal sub-tabs within each section */}
        {page === 'design' && activeTab && !noPad && (
          <SubTabBar
            activeTab={activeTab}
            onTabChange={(tab) => onNavigate('design', tab)}
          />
        )}
        {children}
      </div>
    </>
  )
}
