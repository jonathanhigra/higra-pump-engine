import React, { useState } from 'react'

export default function FeedbackStars({ tab }: { tab: string }) {
  const storageKey = `hpe_feedback_${tab}`
  const [rating, setRating] = useState(0)
  const [submitted, setSubmitted] = useState(() => localStorage.getItem(storageKey) === '1')
  const [hover, setHover] = useState(0)

  if (submitted) return <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0', marginTop: 16 }}>Obrigado pelo feedback!</div>

  return (
    <div style={{ textAlign: 'center', padding: '8px 0', marginTop: 16, borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)' }}>
      <span>Esta funcionalidade foi util? </span>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n}
          onClick={() => { setRating(n); setSubmitted(true); localStorage.setItem(storageKey, '1') }}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '0 1px',
            color: n <= (hover || rating) ? 'var(--accent)' : 'var(--text-muted)',
            transition: 'color 0.15s',
          }}>&#9733;</button>
      ))}
    </div>
  )
}
