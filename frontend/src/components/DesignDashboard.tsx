import React, { useState } from 'react'
import type { SizingResult, Tab } from '../App'

interface Props {
  sizing: SizingResult | null
  opPoint: { flowRate: number; head: number; rpm: number }
  onNavigate: (tab: Tab) => void
  onRunSizing: (q: number, h: number, n: number) => void
}

/* ── Metric status color helper ─────────────────────────────────────────── */
function statusColor(level: 'green' | 'yellow' | 'red'): string {
  switch (level) {
    case 'green': return 'var(--accent-success)'
    case 'yellow': return 'var(--accent-warning)'
    case 'red': return 'var(--accent-danger)'
  }
}

function nqTypeLabel(nq: number): string {
  if (nq < 25) return 'radial'
  if (nq < 70) return 'radial'
  if (nq < 160) return 'misto'
  return 'axial'
}

function etaStatus(eta: number): 'green' | 'yellow' | 'red' {
  if (eta >= 0.80) return 'green'
  if (eta >= 0.70) return 'yellow'
  return 'red'
}

function npshStatus(npsh: number): 'green' | 'yellow' | 'red' {
  if (npsh < 5) return 'green'
  if (npsh < 10) return 'yellow'
  return 'red'
}

function deHallerStatus(val: number): 'green' | 'yellow' | 'red' {
  if (val > 0.72) return 'green'
  if (val >= 0.65) return 'yellow'
  return 'red'
}

/* ── Quick-start mini sizing form ───────────────────────────────────────── */
function MiniSizingForm({ onRun }: { onRun: (q: number, h: number, n: number) => void }) {
  const [q, setQ] = useState('180')
  const [h, setH] = useState('30')
  const [n, setN] = useState('1750')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
            Q (m\u00B3/h)
          </label>
          <input className="input" value={q} onChange={e => setQ(e.target.value)}
            style={{ fontSize: 13, padding: '6px 8px' }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
            H (m)
          </label>
          <input className="input" value={h} onChange={e => setH(e.target.value)}
            style={{ fontSize: 13, padding: '6px 8px' }} />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
            RPM
          </label>
          <input className="input" value={n} onChange={e => setN(e.target.value)}
            style={{ fontSize: 13, padding: '6px 8px' }} />
        </div>
      </div>
      <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}
        onClick={() => onRun(Number(q), Number(h), Number(n))}>
        Executar
      </button>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function DesignDashboard({ sizing, opPoint, onNavigate, onRunSizing }: Props) {
  const [showMiniForm, setShowMiniForm] = useState(false)

  /* ── Empty state — no sizing yet ────────────────────────────────────── */
  if (!sizing) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: 420, gap: 24, padding: 24,
      }}>
        <div style={{ fontSize: 40, lineHeight: 1, opacity: 0.6 }}>&#9881;</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
          Comece seu projeto
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16, width: '100%', maxWidth: 700,
        }}>
          {/* Card: Templates */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onNavigate('templates')}
            onKeyDown={e => { if (e.key === 'Enter') onNavigate('templates') }}
            style={{
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              borderRadius: 10, padding: 20, cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
              textAlign: 'center',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
              ;(e.currentTarget as HTMLElement).style.background = 'var(--card-hover-bg)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--card-border)'
              ;(e.currentTarget as HTMLElement).style.background = 'var(--card-bg)'
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#128196;</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Templates</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Escolha um ponto de partida
            </div>
          </div>

          {/* Card: Quick sizing */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowMiniForm(v => !v)}
            onKeyDown={e => { if (e.key === 'Enter') setShowMiniForm(v => !v) }}
            style={{
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              borderRadius: 10, padding: 20, cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
              textAlign: 'center',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
              ;(e.currentTarget as HTMLElement).style.background = 'var(--card-hover-bg)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--card-border)'
              ;(e.currentTarget as HTMLElement).style.background = 'var(--card-bg)'
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#9889;</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Dimensionamento R\u00E1pido
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Informe Q, H e RPM
            </div>
            {showMiniForm && (
              <div onClick={e => e.stopPropagation()}>
                <MiniSizingForm onRun={onRunSizing} />
              </div>
            )}
          </div>

          {/* Card: Import */}
          <div style={{
            background: 'var(--card-bg)', border: '1px dashed var(--border-primary)',
            borderRadius: 10, padding: 20, textAlign: 'center', opacity: 0.5,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#128230;</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Importar Projeto
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Em breve
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Dashboard mode — sizing exists ─────────────────────────────────── */
  const deHaller = sizing.velocity_triangles?.de_haller ?? null

  const metrics: {
    icon: string; label: string; value: string; unit: string
    status: 'green' | 'yellow' | 'red'; badge?: string
  }[] = [
    {
      icon: '\u{1F300}', label: 'Nq', value: sizing.specific_speed_nq.toFixed(1), unit: '',
      status: 'green', badge: nqTypeLabel(sizing.specific_speed_nq),
    },
    {
      icon: '\u{2699}', label: '\u03B7 total', value: `${(sizing.estimated_efficiency * 100).toFixed(1)}`, unit: '%',
      status: etaStatus(sizing.estimated_efficiency),
    },
    {
      icon: '\u{1F4A7}', label: 'NPSHr', value: sizing.estimated_npsh_r.toFixed(1), unit: 'm',
      status: npshStatus(sizing.estimated_npsh_r),
    },
    {
      icon: '\u26A1', label: 'Pot\u00EAncia', value: (sizing.estimated_power / 1000).toFixed(1), unit: 'kW',
      status: 'green',
    },
    {
      icon: '\u2B55', label: 'D2', value: (sizing.impeller_d2 * 1000).toFixed(0), unit: 'mm',
      status: 'green',
    },
    {
      icon: '\u{1F6E1}', label: 'De Haller',
      value: deHaller != null ? deHaller.toFixed(3) : '--',
      unit: '',
      status: deHaller != null ? deHallerStatus(deHaller) : 'yellow',
    },
  ]

  const quickActions: { icon: string; label: string; tab: Tab }[] = [
    { icon: '\u{1F4D0}', label: 'Ver Geometria 3D', tab: '3d' },
    { icon: '\u{1F4C8}', label: 'Curvas de Desempenho', tab: 'curves' },
    { icon: '\u{1F50D}', label: 'An\u00E1lise de Perdas', tab: 'losses' },
    { icon: '\u26A1', label: 'Otimizar Design', tab: 'optimize' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Metric cards ──────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
      }}>
        {metrics.map((m, i) => (
          <div key={i} style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: 8, padding: '14px 16px',
            borderLeft: `3px solid ${statusColor(m.status)}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                {m.label}
              </span>
              {m.badge && (
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 8,
                  background: 'rgba(0,160,223,0.15)', color: 'var(--accent)',
                  fontWeight: 600, textTransform: 'uppercase',
                }}>
                  {m.badge}
                </span>
              )}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: statusColor(m.status) }}>
              {m.value}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                {m.unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Quick-action cards ────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
      }}>
        {quickActions.map((a, i) => (
          <div
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => onNavigate(a.tab)}
            onKeyDown={e => { if (e.key === 'Enter') onNavigate(a.tab) }}
            style={{
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              borderRadius: 8, padding: '14px 16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
              ;(e.currentTarget as HTMLElement).style.background = 'var(--card-hover-bg)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--card-border)'
              ;(e.currentTarget as HTMLElement).style.background = 'var(--card-bg)'
            }}
          >
            <span style={{ fontSize: 22 }}>{a.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {a.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Warnings ──────────────────────────────────────────────────── */}
      {sizing.warnings && sizing.warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sizing.warnings.map((w, i) => (
            <div key={i} style={{
              background: 'rgba(255,213,79,0.08)', border: '1px solid rgba(255,213,79,0.3)',
              borderRadius: 6, padding: '8px 14px', fontSize: 12,
              color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>&#9888;</span>
              {w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
