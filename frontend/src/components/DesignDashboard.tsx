import React, { useState } from 'react'
import type { SizingResult, Tab } from '../App'
import EngineeringTooltip from './EngineeringTooltip'
import SmartWarnings from './SmartWarnings'
import QuickCompare from './QuickCompare'
import DeltaIndicator from './DeltaIndicator'

/* ── Inline SVG icon helper ────────────────────────────────────────────── */
const SvgIcon = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

interface Props {
  sizing: SizingResult | null
  previousSizing?: SizingResult | null
  opPoint: { flowRate: number; head: number; rpm: number }
  onNavigate: (tab: Tab) => void
  onRunSizing: (q: number, h: number, n: number) => void
  onWhatIf?: (overrideD2: number) => void
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
export default function DesignDashboard({ sizing, previousSizing, opPoint, onNavigate, onRunSizing, onWhatIf }: Props) {
  const [showMiniForm, setShowMiniForm] = useState(false)

  /* ── Empty state — no sizing yet ────────────────────────────────────── */
  if (!sizing) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: 420, gap: 24, padding: 24,
      }}>
        <div style={{ opacity: 0.6 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </div>
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
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
              <SvgIcon d="M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" size={28} />
            </div>
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
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
              <SvgIcon d="M13 10V3L4 14h7v7l9-11h-7z" size={28} />
            </div>
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
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
              <SvgIcon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m4-5l5 5 5-5m-5 5V3" size={28} />
            </div>
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

  const ps = previousSizing || null
  const metrics: {
    iconPath: string; label: string; value: string; unit: string
    status: 'green' | 'yellow' | 'red'; badge?: string; term?: string
    delta?: { current: number; previous: number | null; format: 'pct' | 'abs' | 'mm'; higherIsBetter?: boolean }
  }[] = [
    {
      iconPath: 'M3 12h4l3-9 4 18 3-9h4', label: 'Nq', value: sizing.specific_speed_nq.toFixed(1), unit: '',
      status: 'green', badge: nqTypeLabel(sizing.specific_speed_nq), term: 'Nq',
      delta: ps ? { current: sizing.specific_speed_nq, previous: ps.specific_speed_nq, format: 'abs' } : undefined,
    },
    {
      iconPath: 'M22 12h-4l-3 9-4-18-3 9H4', label: '\u03B7 total', value: `${(sizing.estimated_efficiency * 100).toFixed(1)}`, unit: '%',
      status: etaStatus(sizing.estimated_efficiency), term: '\u03B7 total',
      delta: ps ? { current: sizing.estimated_efficiency, previous: ps.estimated_efficiency, format: 'pct', higherIsBetter: true } : undefined,
    },
    {
      iconPath: 'M12 2.69l5.66 5.66a8 8 0 11-11.31 0z', label: 'NPSHr', value: sizing.estimated_npsh_r.toFixed(1), unit: 'm',
      status: npshStatus(sizing.estimated_npsh_r), term: 'NPSHr',
      delta: ps ? { current: sizing.estimated_npsh_r, previous: ps.estimated_npsh_r, format: 'pct', higherIsBetter: false } : undefined,
    },
    {
      iconPath: 'M13 10V3L4 14h7v7l9-11h-7z', label: 'Pot\u00EAncia', value: (sizing.estimated_power / 1000).toFixed(1), unit: 'kW',
      status: 'green', term: 'Potencia',
      delta: ps ? { current: sizing.estimated_power / 1000, previous: ps.estimated_power / 1000, format: 'pct', higherIsBetter: false } : undefined,
    },
    {
      iconPath: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', label: 'D2', value: (sizing.impeller_d2 * 1000).toFixed(0), unit: 'mm',
      status: 'green', term: 'D2',
      delta: ps ? { current: sizing.impeller_d2 * 1000, previous: ps.impeller_d2 * 1000, format: 'mm' } : undefined,
    },
    {
      iconPath: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z', label: 'De Haller',
      value: deHaller != null ? deHaller.toFixed(3) : '--',
      unit: '',
      status: deHaller != null ? deHallerStatus(deHaller) : 'yellow',
      term: 'De Haller',
    },
  ]

  const quickActions: { iconPath: string; label: string; tab: Tab }[] = [
    { iconPath: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', label: 'Ver Geometria 3D', tab: '3d' },
    { iconPath: 'M3 12h4l3-9 4 18 3-9h4', label: 'Curvas de Desempenho', tab: 'curves' },
    { iconPath: 'M1 12s4-8 11-8 11 8-4 8-11 8-11-8z', label: 'An\u00E1lise de Perdas', tab: 'losses' },
    { iconPath: 'M13 10V3L4 14h7v7l9-11h-7z', label: 'Otimizar Design', tab: 'optimize' },
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
              <SvgIcon d={m.iconPath} size={16} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                {m.term ? <EngineeringTooltip term={m.term}>{m.label}</EngineeringTooltip> : m.label}
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: statusColor(m.status) }}>
                {m.value}
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                  {m.unit}
                </span>
                {m.delta && <DeltaIndicator current={m.delta.current} previous={m.delta.previous} format={m.delta.format} higherIsBetter={m.delta.higherIsBetter} />}
              </div>
              {m.label === 'D2' && onWhatIf && (
                <QuickCompare
                  metric="D2"
                  currentValue={sizing.impeller_d2 * 1000}
                  unit="mm"
                  onWhatIf={(newD2mm) => onWhatIf(newD2mm)}
                  previewImpact={(newD2mm) => {
                    const ratio = newD2mm / (sizing.impeller_d2 * 1000)
                    const newNq = sizing.specific_speed_nq / Math.pow(ratio, 2)
                    const newEta = sizing.estimated_efficiency * (0.5 + 0.5 * (1 / ratio))
                    const newNpsh = sizing.estimated_npsh_r * Math.pow(ratio, 0.5)
                    return [
                      { label: 'Nq', value: newNq.toFixed(1), delta: `${((newNq / sizing.specific_speed_nq - 1) * 100).toFixed(1)}%` },
                      { label: '\u03B7', value: `${(newEta * 100).toFixed(1)}%`, delta: `${((newEta / sizing.estimated_efficiency - 1) * 100).toFixed(1)}%` },
                      { label: 'NPSHr', value: `${newNpsh.toFixed(1)}m`, delta: `${((newNpsh / sizing.estimated_npsh_r - 1) * 100).toFixed(1)}%` },
                    ]
                  }}
                />
              )}
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
            <SvgIcon d={a.iconPath} size={22} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {a.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Smart Warnings ────────────────────────────────────────────── */}
      {sizing.warnings && sizing.warnings.length > 0 && (
        <SmartWarnings warnings={sizing.warnings} sizing={sizing} onNavigate={(t) => onNavigate(t as Tab)} />
      )}
    </div>
  )
}
