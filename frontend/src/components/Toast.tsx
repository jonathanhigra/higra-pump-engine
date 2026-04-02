import React, { useEffect, useState } from 'react'

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  text: string
}

interface Props {
  messages: ToastMessage[]
  onDismiss: (id: string) => void
}

const COLORS = {
  success: { bg: 'rgba(76,175,80,0.12)', border: '#4CAF50', text: '#4CAF50' },
  error: { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#ef4444' },
  warning: { bg: 'rgba(255,213,79,0.12)', border: '#FFD54F', text: '#FFD54F' },
  info: { bg: 'rgba(33,150,243,0.12)', border: '#2196F3', text: '#2196F3' },
}

export default function Toast({ messages, onDismiss }: Props) {
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {messages.map(msg => (
        <ToastItem key={msg.id} message={msg} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(message.id), 5000)
    return () => clearTimeout(timer)
  }, [message.id, onDismiss])

  const c = COLORS[message.type]

  return (
    <div style={{
      padding: '10px 16px', background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 6, boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
      animation: 'slideIn 0.2s ease-out',
    }}>
      <span style={{ fontSize: 13, color: c.text, flex: 1 }}>{message.text}</span>
      <button onClick={() => onDismiss(message.id)} style={{
        background: 'none', border: 'none', cursor: 'pointer', color: c.text, fontSize: 16, padding: 0,
      }}>x</button>
    </div>
  )
}
