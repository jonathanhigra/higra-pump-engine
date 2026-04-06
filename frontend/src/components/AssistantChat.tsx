import React, { useState } from 'react'
import t from '../i18n'
import type { SizingResult } from '../App'

interface Props { sizing: SizingResult | null }
interface Message { role: 'user' | 'assistant'; text: string }

export default function AssistantChat({ sizing }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: t.assistantGreeting },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim()) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)
    const response = generateResponse(userMsg, sizing)
    setTimeout(() => { setMessages(prev => [...prev, { role: 'assistant', text: response }]); setLoading(false) }, 300)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 450, border: '1px solid var(--border-primary)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600 }}>{t.designAssistant}</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-secondary)' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%', padding: '8px 12px', borderRadius: 8,
            background: msg.role === 'user' ? 'var(--accent)' : 'var(--card-bg)',
            color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
            border: msg.role === 'assistant' ? '1px solid var(--border-primary)' : 'none',
            fontSize: 13, lineHeight: 1.5,
          }}>{msg.text}</div>
        ))}
        {loading && <div style={{ alignSelf: 'flex-start', padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border-primary)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>{t.thinking}</div>}
      </div>
      <div style={{ display: 'flex', padding: 8, gap: 6, background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-primary)' }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={t.askAboutDesign} className="input" style={{ flex: 1 }} />
        <button onClick={handleSend} disabled={loading} className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>{t.send}</button>
      </div>
    </div>
  )
}

function generateResponse(q: string, sizing: SizingResult | null): string {
  if (!sizing) return t.runSizingFirst
  const s = sizing, ql = q.toLowerCase()
  const eta = (s.estimated_efficiency * 100).toFixed(1), d2 = (s.impeller_d2 * 1000).toFixed(0), nq = s.specific_speed_nq.toFixed(1)

  if (ql.includes('rendimento') || ql.includes('eficien')) {
    const tip = s.estimated_efficiency < 0.70 ? t.assistEffLow : s.estimated_efficiency > 0.85 ? t.assistEffHigh : t.assistEffGood
    return t.assistEfficiency(eta, nq, tip)
  }
  if (ql.includes('npsh') || ql.includes('cavit')) {
    return t.assistNpsh(s.estimated_npsh_r.toFixed(1)) + ' ' + (s.estimated_npsh_r > 6 ? t.assistNpshHigh : t.assistNpshOk)
  }
  if (ql.includes('diametro') || ql.includes('d2') || ql.includes('dimenso')) {
    return t.assistDims(d2, (s.impeller_d1 * 1000).toFixed(0), (s.impeller_b2 * 1000).toFixed(1), s.blade_count)
  }
  if (ql.includes('pa') || ql.includes('angulo')) {
    const tip = s.beta2 < 20 ? t.assistLowBeta2 : t.assistAnglesOk
    return t.assistAngles(s.beta1.toFixed(1), s.beta2.toFixed(1), tip)
  }
  if (ql.includes('aviso') || ql.includes('problema')) {
    return s.warnings.length > 0 ? `${t.warnings}: ${s.warnings.join('; ')}` : t.assistNoWarnings
  }
  if (ql.includes('melhora') || ql.includes('otimiz')) {
    const tips: string[] = []
    if (s.estimated_efficiency < 0.75) tips.push(t.assistImproveBlades)
    if (s.beta2 < 18) tips.push(t.assistImproveBeta2)
    if (s.estimated_npsh_r > 5) tips.push(t.assistImproveD1)
    if (!tips.length) tips.push(t.assistAlreadyOptimized)
    return `${t.assistSuggestions}: ${tips.join('. ')}.`
  }
  return t.assistSummary(nq, d2, eta, s.blade_count, s.estimated_npsh_r.toFixed(1), (s.estimated_power / 1000).toFixed(1))
}
