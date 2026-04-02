import React, { useState } from 'react'
import type { SizingResult } from '../App'

interface Props {
  sizing: SizingResult | null
}

interface Message {
  role: 'user' | 'assistant'
  text: string
}

export default function AssistantChat({ sizing }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hello! I can help analyze your pump design. Run a sizing first, then ask me questions.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim()) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)

    // Generate contextual response based on sizing data
    const response = generateResponse(userMsg, sizing)
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', text: response }])
      setLoading(false)
    }, 300)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 450, border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: '#2E8B57', color: '#fff', fontSize: 14, fontWeight: 600 }}>
        Design Assistant
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%', padding: '8px 12px', borderRadius: 8,
            background: msg.role === 'user' ? '#2E8B57' : '#fff',
            color: msg.role === 'user' ? '#fff' : '#333',
            border: msg.role === 'assistant' ? '1px solid #e0e0e0' : 'none',
            fontSize: 13, lineHeight: 1.5,
          }}>
            {msg.text}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', padding: '8px 12px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, color: '#999' }}>
            Thinking...
          </div>
        )}
      </div>

      <div style={{ display: 'flex', padding: 8, gap: 6, background: '#fff', borderTop: '1px solid #e8e8e8' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask about your design..."
          style={{
            flex: 1, padding: '8px 10px', border: '1px solid #ddd',
            borderRadius: 4, fontSize: 13, outline: 'none',
          }}
        />
        <button onClick={handleSend} disabled={loading} style={{
          padding: '8px 16px', background: '#2E8B57', color: '#fff',
          border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
        }}>Send</button>
      </div>
    </div>
  )
}

function generateResponse(question: string, sizing: SizingResult | null): string {
  const q = question.toLowerCase()

  if (!sizing) {
    return 'Please run a sizing analysis first. I need design data to give you advice.'
  }

  const s = sizing
  const eta = (s.estimated_efficiency * 100).toFixed(1)
  const d2 = (s.impeller_d2 * 1000).toFixed(0)
  const nq = s.specific_speed_nq.toFixed(1)

  if (q.includes('efficien')) {
    const tip = s.estimated_efficiency < 0.70
      ? 'Consider increasing blade count or adjusting beta2 to improve efficiency.'
      : s.estimated_efficiency > 0.85
      ? 'Excellent efficiency. Focus on maintaining this at off-design points.'
      : 'Good efficiency for this specific speed range.'
    return `Current efficiency: ${eta}%. Nq=${nq}. ${tip}`
  }

  if (q.includes('npsh') || q.includes('cavit')) {
    return `NPSHr = ${s.estimated_npsh_r.toFixed(1)} m. ${
      s.estimated_npsh_r > 6 ? 'This is relatively high. Consider reducing inlet velocity or increasing D1.' :
      'This is within normal range for this size pump.'
    }`
  }

  if (q.includes('diameter') || q.includes('d2') || q.includes('size')) {
    return `Impeller D2 = ${d2} mm, D1 = ${(s.impeller_d1*1000).toFixed(0)} mm. ` +
      `Outlet width b2 = ${(s.impeller_b2*1000).toFixed(1)} mm. ${s.blade_count} blades.`
  }

  if (q.includes('blade') || q.includes('angle')) {
    return `Blade angles: beta1=${s.beta1.toFixed(1)} deg (inlet), beta2=${s.beta2.toFixed(1)} deg (outlet). ` +
      `${s.beta2 < 20 ? 'Low beta2 — risk of diffuser separation.' : 'Angles are within typical range.'}`
  }

  if (q.includes('warning') || q.includes('issue') || q.includes('problem')) {
    return s.warnings.length > 0
      ? `Warnings: ${s.warnings.join('; ')}`
      : 'No warnings found. Design parameters are within recommended ranges.'
  }

  if (q.includes('improve') || q.includes('optim') || q.includes('better')) {
    const tips: string[] = []
    if (s.estimated_efficiency < 0.75) tips.push('Increase blade count (try Z=7-9)')
    if (s.beta2 < 18) tips.push('Increase beta2 to reduce diffusion losses')
    if (s.estimated_npsh_r > 5) tips.push('Enlarge inlet eye D1 to reduce NPSHr')
    if (tips.length === 0) tips.push('Design is already well-optimized for this duty point')
    return `Improvement suggestions: ${tips.join('. ')}.`
  }

  return `Design summary: Nq=${nq}, D2=${d2}mm, eta=${eta}%, ${s.blade_count} blades, ` +
    `NPSHr=${s.estimated_npsh_r.toFixed(1)}m, Power=${(s.estimated_power/1000).toFixed(1)}kW. ` +
    `Ask me about efficiency, cavitation, dimensions, or improvements.`
}
