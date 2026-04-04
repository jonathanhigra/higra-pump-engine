import React, { useState, useEffect, useRef } from 'react'
import type { SizingResult } from '../App'

interface Props {
  sizing: SizingResult | null
  resultsRef: React.RefObject<HTMLDivElement | null>
}

export default function FloatingMetrics({ sizing, resultsRef }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const target = resultsRef.current
    if (!target || !sizing) { setVisible(false); return }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show floating card when results area is NOT visible (scrolled past it)
        setVisible(!entry.isIntersecting)
      },
      { threshold: 0.1 }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [sizing, resultsRef])

  if (!sizing || !visible) return null

  const metrics = [
    { label: 'Nq', value: sizing.specific_speed_nq.toFixed(1) },
    { label: '\u03B7', value: `${(sizing.estimated_efficiency * 100).toFixed(1)}%` },
    { label: 'D2', value: `${(sizing.impeller_d2 * 1000).toFixed(0)}mm` },
    { label: 'NPSHr', value: `${sizing.estimated_npsh_r.toFixed(1)}m` },
  ]

  return (
    <div style={{
      position: 'fixed',
      top: 64,
      right: 20,
      zIndex: 1200,
      background: 'rgba(15, 20, 30, 0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(0,160,223,0.25)',
      borderRadius: 10,
      padding: '10px 14px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '4px 16px',
      minWidth: 160,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      animation: 'floatIn 200ms ease-out',
    }}>
      {metrics.map(m => (
        <div key={m.label} style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {m.label}: <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{m.value}</b>
        </div>
      ))}
      <style>{`
        @keyframes floatIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
