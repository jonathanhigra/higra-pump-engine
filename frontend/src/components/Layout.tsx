import React, { useState } from 'react'
import Sidebar from './Sidebar'

type Tab = 'results' | 'curves' | '3d' | 'velocity' | 'losses' | 'stress' | 'compare' | 'assistant' | 'optimize' | 'loading' | 'pressure' | 'multispeed' | 'meridional-editor' | 'spanwise'

interface Props {
  page: 'projects' | 'design'
  activeTab: Tab | null
  userName: string
  onNavigate: (page: 'projects' | 'design', tab?: Tab) => void
  onLogout: () => void
  children: React.ReactNode
  noPad?: boolean
}

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
        {children}
      </div>
    </>
  )
}
