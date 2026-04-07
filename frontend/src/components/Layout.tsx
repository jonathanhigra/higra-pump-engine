import React, { useState } from 'react'
import Sidebar, { type Tab, type Section, sectionForTab } from './Sidebar'
import SubTabBar from './SubTabBar'
import Breadcrumb from './Breadcrumb'

interface Props {
  page: 'projects' | 'design'
  activeTab: Tab | null
  userName: string
  projectName?: string
  onNavigate: (page: 'projects' | 'design', tab?: Tab) => void
  onLogout: () => void
  children: React.ReactNode
  noPad?: boolean
  warningCount?: number
  recentTabs?: Tab[]
  onRecalculate?: () => void
  onExport?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  sizing?: any
}

export type { Tab }

export default function Layout({ page, activeTab, userName, projectName, onNavigate, onLogout, children, noPad, warningCount, recentTabs, onRecalculate, onExport, onContextMenu, sizing }: Props) {
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
        warningCount={warningCount}
      />
      <div className={`main-content${isCollapsed ? ' collapsed' : ''}${noPad ? ' no-pad' : ''}`} onContextMenu={onContextMenu}>
        {/* Breadcrumb navigation */}
        {page === 'design' && activeTab && !noPad && (
          <Breadcrumb
            projectName={projectName}
            section={sectionForTab(activeTab) as Section}
            tab={activeTab}
            onNavigate={onNavigate}
            onRecalculate={onRecalculate}
            onExport={onExport}
          />
        )}
        {page === 'projects' && (
          <Breadcrumb
            section="projects"
            tab={'results' as Tab}
            onNavigate={onNavigate}
          />
        )}
        {/* Horizontal sub-tabs within each section */}
        {page === 'design' && activeTab && !noPad && (
          <SubTabBar
            activeTab={activeTab}
            onTabChange={(tab) => onNavigate('design', tab)}
            recentTabs={recentTabs}
            sizing={sizing}
          />
        )}
        {children}
      </div>
    </>
  )
}
