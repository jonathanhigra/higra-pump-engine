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
  success: { bg: '#e8f5e9', border: '#4CAF50', text: '#2E7D32' },
  error: { bg: '#fde8e8', border: '#F44336', text: '#C62828' },
  warning: { bg: '#fff3e0', border: '#FF9800', text: '#E65100' },
  info: { bg: '#e3f2fd', border: '#2196F3', text: '#1565C0' },
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
      borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
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
