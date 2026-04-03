import { useState, useCallback } from 'react'
import type { ToastMessage, ToastType } from '../components/Toast'

let _counter = 0

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const toast = useCallback((text: string, type: ToastType = 'info', duration = 3000) => {
    const id = `toast-${++_counter}-${Date.now()}`
    setToasts(prev => [...prev, { id, type, text, duration }])
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, toast, dismiss }
}
