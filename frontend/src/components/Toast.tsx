import React, { useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
  id: string
  type: ToastType
  text: string
  duration?: number
}

interface Props {
  messages: ToastMessage[]
  onDismiss: (id: string) => void
}

const BORDER_COLORS: Record<ToastType, string> = {
  success: '#4CAF50',
  error: '#ef4444',
  warning: '#FFD54F',
  info: '#2196F3',
}

const BG_COLORS: Record<ToastType, string> = {
  success: 'rgba(76,175,80,0.12)',
  error: 'rgba(239,68,68,0.12)',
  warning: 'rgba(255,213,79,0.12)',
  info: 'rgba(33,150,243,0.12)',
}

const TEXT_COLORS: Record<ToastType, string> = {
  success: '#4CAF50',
  error: '#ef4444',
  warning: '#FFD54F',
  info: '#2196F3',
}

const ICONS: Record<ToastType, string> = {
  success: 'M20 6L9 17l-5-5',
  error: 'M18 6L6 18M6 6l12 12',
  warning: 'M12 9v4m0 4h.01M10.29 3.86l-8.6 14.88A1 1 0 002.56 20h16.88a1 1 0 00.87-1.26l-8.6-14.88a1 1 0 00-1.42 0z',
  info: 'M12 16v-4m0-4h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
}

export default function Toast({ messages, onDismiss }: Props) {
  if (messages.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 48, right: 16, zIndex: 1500,
      display: 'flex', flexDirection: 'column-reverse', gap: 8,
      pointerEvents: 'none',
    }}>
      {messages.map(msg => (
        <ToastItem key={msg.id} message={msg} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(message.id), message.duration || 3000)
    return () => clearTimeout(timer)
  }, [message.id, message.duration, onDismiss])

  const type = message.type

  return (
    <div style={{
      minWidth: 280, padding: '12px 16px',
      background: BG_COLORS[type],
      borderRadius: 8,
      borderLeft: `3px solid ${BORDER_COLORS[type]}`,
      boxShadow: 'var(--shadow-md)',
      display: 'flex', alignItems: 'center', gap: 10,
      animation: 'toast-slide-in 0.25s ease-out',
      pointerEvents: 'auto',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TEXT_COLORS[type]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: 16 }}>
        <path d={ICONS[type]} />
      </svg>
      <span style={{ fontSize: 13, color: TEXT_COLORS[type], flex: 1, fontWeight: 500 }}>
        {message.text}
      </span>
      <button
        onClick={() => onDismiss(message.id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: TEXT_COLORS[type], fontSize: 14, padding: 0, lineHeight: 1,
          opacity: 0.7,
        }}
      >
        x
      </button>
    </div>
  )
}
