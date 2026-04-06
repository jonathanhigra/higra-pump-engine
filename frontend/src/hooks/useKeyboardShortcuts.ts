import { useEffect } from 'react'
import type { Tab } from '../components/Sidebar'

interface Options {
  onRunSizing?: () => void
  onSave?: () => void
  onCmdPalette?: () => void
  onNavigate?: (page: 'projects' | 'design', tab?: Tab) => void
  onEscape?: () => void
  onF1Help?: () => void
  onExport?: () => void
}

const SECTION_KEYS: Record<string, { page: 'projects' | 'design'; tab?: Tab }> = {
  '1': { page: 'projects' },
  '2': { page: 'design', tab: 'templates' },
  '3': { page: 'design', tab: 'results' },
  '4': { page: 'design', tab: '3d' },
  '5': { page: 'design', tab: 'velocity' },
  '6': { page: 'design', tab: 'optimize' },
  '7': { page: 'design', tab: 'assistant' },
}

export function useKeyboardShortcuts({ onRunSizing, onSave, onCmdPalette, onNavigate, onEscape, onF1Help, onExport }: Options) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable

      // Ctrl+K / Cmd+K — command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        onCmdPalette?.()
        return
      }

      // Ctrl+S / Cmd+S — save design
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        onSave?.()
        return
      }

      // Ctrl+E / Cmd+E — open Export Center
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        onExport?.()
        return
      }

      // Ctrl+Enter — run sizing
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        onRunSizing?.()
        return
      }

      // F1 — contextual help
      if (e.key === 'F1') {
        e.preventDefault()
        onF1Help?.()
        return
      }

      // F5 — run sizing (prevent page reload)
      if (e.key === 'F5') {
        e.preventDefault()
        onRunSizing?.()
        return
      }

      // Escape — close modal/palette
      if (e.key === 'Escape') {
        onEscape?.()
        return
      }

      // Number keys 1-7 — section navigation (only when not in input)
      if (!isInput && SECTION_KEYS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const nav = SECTION_KEYS[e.key]
        onNavigate?.(nav.page, nav.tab)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onRunSizing, onSave, onCmdPalette, onNavigate, onEscape, onF1Help, onExport])
}
