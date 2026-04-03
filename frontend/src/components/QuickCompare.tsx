import React, { useState, useRef, useEffect } from 'react'

interface Props {
  metric: string
  currentValue: number
  unit: string
  onWhatIf: (newValue: number) => void
  /** Simple correlations to preview impact */
  previewImpact?: (newValue: number) => { label: string; value: string; delta: string }[]
}

export default function QuickCompare({ metric, currentValue, unit, onWhatIf, previewImpact }: Props) {
  const [open, setOpen] = useState(false)
  const [pct, setPct] = useState(0) // -20 to +20
  const popupRef = useRef<HTMLDivElement>(null)

  const newValue = currentValue * (1 + pct / 100)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false)
        setPct(0)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const impacts = previewImpact ? previewImpact(newValue) : []

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setPct(0) }}
        title={`O que acontece se ${metric} mudar?`}
        style={{
          width: 18, height: 18, borderRadius: '50%',
          border: '1px solid var(--border-primary)',
          background: open ? 'rgba(0,160,223,0.15)' : 'transparent',
          color: open ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, padding: 0,
          transition: 'all 0.15s',
          fontFamily: 'var(--font-family)',
        }}
      >
        ?
      </button>

      {open && (
        <div
          ref={popupRef}
          style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 8, width: 240,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            borderRadius: 8, padding: 14,
            boxShadow: 'var(--shadow-md)',
            zIndex: 1000,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 10 }}>
            O que acontece se {metric} mudar?
          </div>

          {/* Current vs new value */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 8,
          }}>
            <div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Atual: </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {currentValue.toFixed(1)} {unit}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Novo: </span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: pct === 0 ? 'var(--text-secondary)' : 'var(--accent)',
              }}>
                {newValue.toFixed(1)} {unit}
              </span>
            </div>
          </div>

          {/* Slider */}
          <div style={{ marginBottom: 10 }}>
            <input
              type="range" min={-20} max={20} step={1} value={pct}
              onChange={e => setPct(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 9, color: 'var(--text-muted)',
            }}>
              <span>-20%</span>
              <span style={{ fontWeight: pct !== 0 ? 700 : 400, color: pct !== 0 ? 'var(--accent)' : undefined }}>
                {pct > 0 ? '+' : ''}{pct}%
              </span>
              <span>+20%</span>
            </div>
          </div>

          {/* Projected impacts */}
          {impacts.length > 0 && pct !== 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '8px 0', borderTop: '1px solid var(--border-primary)',
              marginBottom: 8,
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 2 }}>
                Impacto projetado:
              </div>
              {impacts.map((imp, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 11,
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>{imp.label}</span>
                  <span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{imp.value}</span>
                    <span style={{
                      marginLeft: 4, fontSize: 10,
                      color: imp.delta.startsWith('-') ? '#ef4444' : '#4caf50',
                    }}>
                      {imp.delta}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Action button */}
          <button
            type="button"
            onClick={() => { onWhatIf(newValue); setOpen(false); setPct(0) }}
            disabled={pct === 0}
            style={{
              width: '100%', padding: '6px 0',
              borderRadius: 6, border: 'none',
              background: pct === 0 ? 'var(--bg-surface)' : 'var(--accent)',
              color: pct === 0 ? 'var(--text-muted)' : '#fff',
              fontSize: 12, fontWeight: 600, cursor: pct === 0 ? 'default' : 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'var(--font-family)',
            }}
          >
            Testar
          </button>
        </div>
      )}
    </div>
  )
}
