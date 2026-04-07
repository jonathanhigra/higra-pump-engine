import React, { useState, useCallback } from 'react'
import type { SizingResult, CurvePoint } from '../App'
import ImpellerMiniPreview from './ImpellerMiniPreview'

interface Props {
  sizing: SizingResult
  curves: CurvePoint[]
  opPoint: { flowRate: number; head: number; rpm: number }
  onNavigate: (tab: string) => void
}

/* ── Mini gauge arc ──────────────────────────────────────────────────────── */
function GaugeArc({ pct, color, size = 110 }: { pct: number; color: string; size?: number }) {
  const r = size * 0.38, cx = size / 2, cy = size / 2
  const sa = -210, ea = 30, arc = ea - sa
  const toRad = (d: number) => d * Math.PI / 180
  const ax = (a: number) => cx + r * Math.cos(toRad(a))
  const ay = (a: number) => cy + r * Math.sin(toRad(a))
  const dArc = (s: number, e: number) => {
    const lg = e - s > 180 ? 1 : 0
    return `M ${ax(s)} ${ay(s)} A ${r} ${r} 0 ${lg} 1 ${ax(e)} ${ay(e)}`
  }
  const angle = sa + arc * Math.min(1, pct / 100)
  return (
    <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.78}`}>
      <path d={dArc(sa, ea)} fill="none" stroke="var(--border-primary)" strokeWidth={8} strokeLinecap="round" />
      <path d={dArc(sa, angle)} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color}80)` }} />
      <text x={cx} y={cy * 0.92} textAnchor="middle" fill={color} fontSize={size * 0.2} fontWeight={700}>{pct.toFixed(1)}</text>
      <text x={cx} y={cy * 1.15} textAnchor="middle" fill="var(--text-muted)" fontSize={size * 0.09}>η %</text>
    </svg>
  )
}

/* ── Status chip ─────────────────────────────────────────────────────────── */
function Check({ ok, warn, label, val }: { ok: boolean; warn?: boolean; label: string; val: string }) {
  const color = ok ? '#22c55e' : warn ? '#f59e0b' : '#ef4444'
  const icon = ok ? '✓' : warn ? '⚠' : '✕'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ color, fontWeight: 700, fontSize: 11, width: 12, textAlign: 'center' }}>{icon}</span>
      <span style={{ color: 'var(--text-muted)', flex: 1 }}>{label}</span>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{val}</span>
    </div>
  )
}

/* ── KPI card — #6 range info, #13 copy button ───────────────────────────── */
function KpiCard({ label, value, unit, sub, accent, large, range }: {
  label: string; value: string; unit: string; sub?: string
  accent?: string; large?: boolean; range?: string
}) {
  const [copied, setCopied] = useState(false)
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
        borderRadius: 8, padding: large ? '12px 14px' : '9px 12px',
        borderTop: `2px solid ${accent || 'var(--border-primary)'}`,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: large ? 22 : 18, fontWeight: 700, color: accent || 'var(--text-primary)', lineHeight: 1.1 }}>
        {value}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 3 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{sub}</div>}
      {range && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1, opacity: 0.7 }}>Ref: {range}</div>}
      {/* #13 — copy on hover */}
      {hov && (
        <button
          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${value} ${unit}`).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
          title="Copiar"
          style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: copied ? '#22c55e' : 'var(--text-muted)', fontSize: 11, lineHeight: 1 }}
        >{copied ? '✓' : '⧉'}</button>
      )}
    </div>
  )
}

/* ── Nav action button ───────────────────────────────────────────────────── */
function NavBtn({ icon, label, desc, color, glow, onClick }: {
  icon: string; label: string; desc: string; color: string; glow: string; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
        background: hov ? `linear-gradient(135deg, ${glow.replace('0.15','0.28')}, ${glow.replace('0.15','0.08')})` : `linear-gradient(135deg, ${glow}, transparent)`,
        border: `1px solid ${hov ? color : color + '50'}`,
        transition: 'all 0.16s',
        transform: hov ? 'translateY(-1px)' : 'none',
        boxShadow: hov ? `0 4px 14px ${glow.replace('0.15','0.3')}` : 'none',
        fontFamily: 'var(--font-family)',
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        background: `${color}22`, border: `1px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</div>
      </div>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  )
}

/* ── Main ────────────────────────────────────────────────────────────────── */
const DEFAULT_KPI_ORDER = ['Nq', 'D2', 'D1', 'b2', 'β₁', 'β₂', 'Z pás', 'De Haller']

export default function QuickSummary({ sizing, curves, opPoint, onNavigate }: Props) {
  const [warningsOpen, setWarningsOpen] = useState(false)
  // #17 — draggable KPI order
  const [kpiOrder, setKpiOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('hpe_kpi_order') || 'null') || DEFAULT_KPI_ORDER }
    catch { return DEFAULT_KPI_ORDER }
  })
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const eta = sizing.estimated_efficiency * 100
  const etaColor = eta >= 80 ? '#22c55e' : eta >= 70 ? '#f59e0b' : '#ef4444'
  const etaLabel = eta >= 80 ? 'Boa' : eta >= 70 ? 'Aceitável' : 'Baixa'
  const dr = (sizing as any).diffusion_ratio || sizing.velocity_triangles?.de_haller || 0
  const u2 = sizing.velocity_triangles?.outlet?.u || 0
  const d2mm = (sizing.impeller_d2 * 1000).toFixed(0)

  const benchmarkEta = (nq: number) => {
    if (nq < 15) return 0.72; if (nq < 25) return 0.78; if (nq < 40) return 0.83
    if (nq < 60) return 0.86; if (nq < 100) return 0.88; return 0.87
  }
  const etaDiff = (sizing.estimated_efficiency - benchmarkEta(sizing.specific_speed_nq)) * 100

  const navCards = [
    { label: 'Curvas H-Q',      desc: `${curves.length} pontos`,  tab: 'curves',   icon: 'M3 12h4l3-9 4 18 3-9h4',                                                                     color: '#22c55e', glow: 'rgba(34,197,94,0.15)' },
    { label: 'Análise Perdas',  desc: 'Distribuição',             tab: 'losses',   icon: 'M12 20V10M18 20V4M6 20v-4',                                                                  color: '#f59e0b', glow: 'rgba(245,158,11,0.15)' },
    { label: 'Otimizar',        desc: 'NSGA-II / Bayesian',       tab: 'optimize', icon: 'M13 10V3L4 14h7v7l9-11h-7z',                                                                 color: '#a78bfa', glow: 'rgba(167,139,250,0.15)' },
    { label: 'Triângulos',      desc: 'Velocidades',              tab: 'velocity', icon: 'M5 12h14M12 5l7 7-7 7',                                                                      color: '#38bdf8', glow: 'rgba(56,189,248,0.15)' },
    { label: 'Geometria 3D',   desc: 'Rotor interativo',          tab: '3d',       icon: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', color: '#00a0df', glow: 'rgba(0,160,223,0.15)' },
    { label: 'Multi-Veloc.',    desc: 'Faixa de RPM',             tab: 'multispeed', icon: 'M22 12h-4l-3 9-4-18-3 9H4',                                                               color: '#fb923c', glow: 'rgba(251,146,60,0.15)' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, width: '100%', alignItems: 'start' }}>

      {/* ══ Left column ════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── 1. Headline strip ─────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(90deg, rgba(0,160,223,0.07) 0%, transparent 100%)',
          border: '1px solid rgba(0,160,223,0.14)', borderRadius: 9,
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rotor</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {(sizing as any).meridional_profile?.impeller_type || 'radial'}
            </span>
          </div>
          <span style={{ color: 'var(--border-primary)' }}>·</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{d2mm} mm</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>D2</span>
          </div>
          <span style={{ color: 'var(--border-primary)' }}>·</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{sizing.blade_count}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>pás</span>
          </div>
          <span style={{ color: 'var(--border-primary)' }}>·</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: etaColor }}>η {eta.toFixed(1)}%</span>
          </div>
          {/* Benchmark comparison */}
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600,
            color: etaDiff >= 0 ? '#22c55e' : '#f59e0b',
          }}>
            {etaDiff >= 0 ? '↑' : '↓'} {Math.abs(etaDiff).toFixed(1)}% vs ref. Nq={sizing.specific_speed_nq.toFixed(0)}
          </span>
          {/* Status pill */}
          <div style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: `${etaColor}18`, border: `1px solid ${etaColor}50`, color: etaColor,
          }}>
            {etaLabel}
          </div>
        </div>

        {/* ── 2. Primary metrics row: Gauge + 2 hero KPIs + Op Point ───── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: 10 }}>

          {/* Gauge */}
          <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <GaugeArc pct={eta} color={etaColor} size={110} />
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Eficiência total</div>
          </div>

          {/* Hero KPI: NPSHr */}
          <div style={{
            background: 'var(--card-bg)', border: `1px solid var(--card-border)`,
            borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
            borderLeft: `3px solid ${sizing.estimated_npsh_r < 5 ? '#22c55e' : sizing.estimated_npsh_r < 10 ? '#f59e0b' : '#ef4444'}`,
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>NPSHr</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: sizing.estimated_npsh_r < 5 ? '#22c55e' : sizing.estimated_npsh_r < 10 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>
              {sizing.estimated_npsh_r.toFixed(1)}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>m</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>cavitação</div>
          </div>

          {/* Hero KPI: Potência */}
          <div style={{
            background: 'var(--card-bg)', border: `1px solid var(--card-border)`,
            borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
            borderLeft: '3px solid #34d399',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>Potência</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#34d399', lineHeight: 1 }}>
              {(sizing.estimated_power / 1000).toFixed(1)}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>kW</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>absorvida</div>
          </div>

          {/* Operating point + checks */}
          <div className="card" style={{ padding: '12px 16px', minWidth: 170 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Ponto de Operação
            </div>
            {[
              { l: 'Q', v: `${opPoint.flowRate} m³/h` },
              { l: 'H', v: `${opPoint.head} m` },
              { l: 'n', v: `${opPoint.rpm} rpm` },
            ].map(r => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>{r.l}</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.v}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Check ok={dr >= 0.7} warn={dr >= 0.6} label="De Haller" val={dr > 0 ? dr.toFixed(3) : '—'} />
              <Check ok={u2 < 35} warn={u2 < 45} label="u₂" val={`${u2.toFixed(1)} m/s`} />
              <Check ok={sizing.estimated_npsh_r < 5} warn={sizing.estimated_npsh_r < 10} label="NPSHr" val={`${sizing.estimated_npsh_r.toFixed(1)} m`} />
            </div>
          </div>
        </div>

        {/* ── 3. Secondary KPIs — draggable (#17) ──────────────────────── */}
        {(() => {
          const kpiDefs: Record<string, React.ReactNode> = {
            'Nq':       <KpiCard label="Nq" value={sizing.specific_speed_nq.toFixed(1)} unit="" sub={sizing.specific_speed_nq < 25 ? 'radial' : sizing.specific_speed_nq < 160 ? 'misto' : 'axial'} accent="#a78bfa" range="15–60 (radial)" />,
            'D2':       <KpiCard label="D2" value={d2mm} unit="mm" sub="diâm. saída" accent="var(--accent)" />,
            'D1':       <KpiCard label="D1" value={(sizing.impeller_d1 * 1000).toFixed(0)} unit="mm" sub="entrada" range="D1/D2 ≈ 0.4–0.6" />,
            'b2':       <KpiCard label="b2" value={(sizing.impeller_b2 * 1000).toFixed(1)} unit="mm" sub="largura" range="b2/D2 = 0.03–0.12" />,
            'β₁':       <KpiCard label="β₁" value={sizing.beta1?.toFixed(1) ?? '—'} unit="°" sub="ângulo entrada" range="15–35°" />,
            'β₂':       <KpiCard label="β₂" value={sizing.beta2?.toFixed(1) ?? '—'} unit="°" sub="ângulo saída" range="15–35°" />,
            'Z pás':    <KpiCard label="Z pás" value={String(sizing.blade_count)} unit="" />,
            'De Haller':<KpiCard label="De Haller" value={dr > 0 ? dr.toFixed(3) : '—'} unit="" accent={dr >= 0.7 ? '#22c55e' : dr >= 0.6 ? '#f59e0b' : '#ef4444'} range="> 0.70" />,
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>⠿ Arrastar para reordenar</span>
                <button type="button" onClick={() => { setKpiOrder(DEFAULT_KPI_ORDER); localStorage.removeItem('hpe_kpi_order') }}
                  style={{ fontSize: 9, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', fontFamily: 'var(--font-family)' }}>
                  Restaurar
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {kpiOrder.map((key, idx) => (
                  <div key={key} draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={e => { e.preventDefault(); setDragOver(idx) }}
                    onDrop={() => {
                      if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOver(null); return }
                      const newOrder = [...kpiOrder]
                      const [moved] = newOrder.splice(dragIdx, 1)
                      newOrder.splice(idx, 0, moved)
                      setKpiOrder(newOrder)
                      localStorage.setItem('hpe_kpi_order', JSON.stringify(newOrder))
                      setDragIdx(null); setDragOver(null)
                    }}
                    onDragEnd={() => { setDragIdx(null); setDragOver(null) }}
                    style={{ opacity: dragIdx === idx ? 0.4 : 1, outline: dragOver === idx ? '2px dashed var(--accent)' : 'none', borderRadius: 8, cursor: 'grab', transition: 'opacity 0.15s' }}
                  >
                    {kpiDefs[key]}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── 4. Avisos — collapsible strip ─────────────────────────────── */}
        {sizing.warnings?.length > 0 && (
          <div style={{
            border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8,
            background: 'rgba(245,158,11,0.04)', overflow: 'hidden',
          }}>
            <button
              onClick={() => setWarningsOpen(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-family)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>
                {sizing.warnings.length} {sizing.warnings.length === 1 ? 'aviso' : 'avisos'}
              </span>
              {/* First warning preview when collapsed */}
              {!warningsOpen && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  — {sizing.warnings[0]}
                </span>
              )}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
                style={{ marginLeft: 'auto', transform: warningsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {warningsOpen && (
              <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sizing.warnings.map((w: string, i: number) => (
                  <div key={i} style={{
                    fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px',
                    background: 'rgba(245,158,11,0.06)', borderRadius: 5,
                    borderLeft: '2px solid rgba(245,158,11,0.4)', lineHeight: 1.5,
                  }}>{w}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 5. Navigation cards ───────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {navCards.map(c => (
            <NavBtn key={c.tab} icon={c.icon} label={c.label} desc={c.desc}
              color={c.color} glow={c.glow} onClick={() => onNavigate(c.tab)} />
          ))}
        </div>

      </div>{/* end left column */}

      {/* ══ Right column: 3D Preview (sticky) ══════════════════════════════ */}
      <ImpellerMiniPreview
        flowRate={opPoint.flowRate}
        head={opPoint.head}
        rpm={opPoint.rpm}
        onExpand={() => onNavigate('3d')}
      />

    </div>
  )
}
