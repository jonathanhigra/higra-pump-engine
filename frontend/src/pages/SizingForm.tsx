import React, { useState, useEffect, useRef } from 'react'
import t from '../i18n'
import { runSizing, getCurves, getLossBreakdown, runStressAnalysis } from '../services/api'
import ReverseCalc from '../components/ReverseCalc'

interface DesignHint {
  eta_expected: number
  beta2_recommended_deg: number
  blade_count_recommended: number
  b2_d2_recommended: number
  splitter_recommended: boolean
  notes?: string
}

// ----- constants -----
const MACHINE_TYPES = [
  { id: 'centrifugal_pump', label: 'Bomba Centrif.', rpm_hint: 1450 },
  { id: 'mixed_flow_pump', label: 'Bomba Mista', rpm_hint: 1000 },
  { id: 'axial_pump', label: 'Bomba Axial', rpm_hint: 730 },
  { id: 'francis_turbine', label: 'Turbina Francis', rpm_hint: 1350 },
  { id: 'centrifugal_compressor', label: 'Compressor', rpm_hint: 8000 },
]

const FLUIDS = [
  { id: 'water20', label: 'Água 20°C', rho: 998, mu: 1.0e-3, pv: 2340, color: '#3b82f6' },
  { id: 'water60', label: 'Água 60°C', rho: 983, mu: 4.7e-4, pv: 19940, color: '#ef4444' },
  { id: 'oil', label: 'Óleo Mineral', rho: 870, mu: 30e-3, pv: 50, color: '#a16207' },
  { id: 'custom', label: 'Custom', rho: 998, mu: 1.0e-3, pv: 2340, color: '#6b7280' },
]

const PRESETS = [
  { label: 'NS280', q: 385, h: 17, n: 1000 },
  { label: 'Bomba Típica', q: 180, h: 30, n: 1750 },
  { label: 'Alta Velocidade', q: 50, h: 80, n: 2900 },
]

const APP_PRESETS = [
  { label: 'Agua Industrial', Q: 100, H: 32, n: 1750, fluid: 'water20', note: 'Bomba de processo padrao' },
  { label: 'Irrigacao', Q: 500, H: 15, n: 1150, fluid: 'water20', note: 'Pivo central / aspersao' },
  { label: 'Caldeira', Q: 50, H: 80, n: 3550, fluid: 'water60', note: 'Alimentacao de caldeira' },
  { label: 'Esgoto', Q: 200, H: 8, n: 980, fluid: 'water20', note: 'Estacao elevatoria' },
]

function calcNq(q_m3h: number, h: number, n: number): number {
  const q = q_m3h / 3600
  if (q <= 0 || h <= 0 || n <= 0) return 0
  return n * Math.sqrt(q) / Math.pow(h, 0.75)
}

function nqBadge(nq: number): { label: string; color: string; icon: string } {
  if (nq <= 0) return { label: '\u2014', color: 'var(--text-muted)', icon: '' }
  if (nq < 15) return { label: `Nq \u2248 ${nq.toFixed(0)} (muito baixo)`, color: '#ef4444', icon: '\u26A0' }
  if (nq < 30) return { label: `Nq \u2248 ${nq.toFixed(0)} (radial)`, color: '#4caf50', icon: '\u2B24' }
  if (nq < 80) return { label: `Nq \u2248 ${nq.toFixed(0)} (radial alto)`, color: '#4caf50', icon: '\u2B24' }
  if (nq < 160) return { label: `Nq \u2248 ${nq.toFixed(0)} (mixed-flow)`, color: '#4caf50', icon: '\u25C6' }
  if (nq <= 200) return { label: `Nq \u2248 ${nq.toFixed(0)} (axial)`, color: '#4caf50', icon: '\u25B2' }
  if (nq <= 400) return { label: `Nq \u2248 ${nq.toFixed(0)} (axial alto)`, color: '#FFD54F', icon: '\u25B2' }
  return { label: `Nq \u2248 ${nq.toFixed(0)} (fora de faixa)`, color: '#ef4444', icon: '\u26A0' }
}

/* SVG silhouette icons for impeller type based on Nq */
function ImpellerSilhouette({ nq }: { nq: number }) {
  if (nq <= 0) return null
  const size = 24
  const color = 'var(--accent)'
  // Radial: flat disc
  if (nq < 30) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
        <ellipse cx="12" cy="12" rx="10" ry="3" />
        <line x1="12" y1="9" x2="12" y2="15" />
        <circle cx="12" cy="12" r="2" fill={color} fillOpacity="0.3" />
      </svg>
    )
  }
  // Radial wide eye
  if (nq < 80) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
        <ellipse cx="12" cy="13" rx="10" ry="4" />
        <ellipse cx="12" cy="11" rx="5" ry="2" />
        <line x1="12" y1="9" x2="12" y2="17" />
        <circle cx="12" cy="12" r="1.5" fill={color} fillOpacity="0.3" />
      </svg>
    )
  }
  // Mixed-flow: angled profile
  if (nq < 160) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
        <path d="M4 16 L12 8 L20 16" />
        <ellipse cx="12" cy="16" rx="8" ry="2.5" />
        <circle cx="12" cy="12" r="1.5" fill={color} fillOpacity="0.3" />
      </svg>
    )
  }
  // Axial: propeller shape
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <circle cx="12" cy="12" r="2" fill={color} fillOpacity="0.3" />
      <path d="M12 10 C8 4, 4 6, 6 10" />
      <path d="M14 12 C20 8, 18 4, 14 6" />
      <path d="M12 14 C16 20, 20 18, 18 14" />
      <path d="M10 12 C4 16, 6 20, 10 18" />
    </svg>
  )
}

function rangeHint(value: number, min: number, max: number, typical: string): { text: string; warn: boolean } {
  if (!value || value === 0) return { text: typical, warn: false }
  if (value < min || value > max) return { text: `\u26A0 Valor fora da faixa tipica (${typical})`, warn: true }
  return { text: typical, warn: false }
}

interface Props {
  onResult: (sizing: any, curves: any[], losses: any, stress: any, op?: any) => void
  loading: boolean
  setLoading: (v: boolean) => void
  /** External operating point — syncs form fields when changed (e.g. template selection) */
  extFlowRate?: number   // m³/h
  extHead?: number       // m
  extRpm?: number        // rpm
}

const inputBorder = (field: string, val: string): string => {
  const v = parseFloat(val)
  if (isNaN(v) || v <= 0) return 'var(--accent-danger, #ef4444)'
  if (field === 'Q' && (v < 1 || v > 10000)) return '#facc15'
  if (field === 'H' && (v < 0.5 || v > 500)) return '#facc15'
  if (field === 'n' && (v < 200 || v > 8000)) return '#facc15'
  return 'var(--accent-success, #4caf50)'
}

export default function SizingForm({ onResult, loading, setLoading, extFlowRate, extHead, extRpm }: Props) {
  const [unit, setUnit] = useState<'m3h' | 'm3s'>(() =>
    (localStorage.getItem('hpe_unit') as 'm3h' | 'm3s') || 'm3h'
  )
  const [machineType, setMachineType] = useState('centrifugal_pump')
  const [fluidId, setFluidId] = useState('water20')
  const [flowRate, setFlowRate] = useState('180')  // always in m³/h internally
  const [head, setHead] = useState('30')
  const [rpm, setRpm] = useState('1750')
  const [advOpen, setAdvOpen] = useState(false)
  const [tipClearance, setTipClearance] = useState('0.3')   // mm
  const [roughness, setRoughness] = useState('25')           // μm
  const [overrideD2, setOverrideD2] = useState('')
  const [overrideB2, setOverrideB2] = useState('')
  const [customRho, setCustomRho] = useState('998')
  const [customMu, setCustomMu] = useState('1.0e-3')
  const [error, setError] = useState<string | null>(null)
  const [designHint, setDesignHint] = useState<DesignHint | null>(null)
  const [calculated, setCalculated] = useState(false)
  const [stickyBtn, setStickyBtn] = useState(false)
  const [versionNote, setVersionNote] = useState('')
  const [lastCalcParams, setLastCalcParams] = useState({ q: '', h: '', n: '' })
  const [appPresetsOpen, setAppPresetsOpen] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Sticky button — shows when the submit button scrolls out of view
  useEffect(() => {
    if (!btnRef.current) return
    const obs = new IntersectionObserver(([entry]) => setStickyBtn(!entry.isIntersecting), { threshold: 0 })
    obs.observe(btnRef.current)
    return () => obs.disconnect()
  }, [])

  const fluid = FLUIDS.find(f => f.id === fluidId) || FLUIDS[0]
  const q_m3h = parseFloat(flowRate) || 0
  const nq = calcNq(q_m3h, parseFloat(head) || 0, parseFloat(rpm) || 0)
  const badge = nqBadge(nq)

  useEffect(() => {
    if (nq <= 0) { setDesignHint(null); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch('/api/v1/design/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine_type: machineType, nq }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setDesignHint(data) })
        .catch(() => {})
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [machineType, nq])

  // Sync form fields when external operating point changes (e.g. template selection)
  useEffect(() => {
    if (extFlowRate != null && extFlowRate > 0) {
      setFlowRate(unit === 'm3h' ? String(extFlowRate) : (extFlowRate / 3600).toFixed(5))
    }
  }, [extFlowRate])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (extHead != null && extHead > 0) setHead(String(extHead))
  }, [extHead])

  useEffect(() => {
    if (extRpm != null && extRpm > 0) setRpm(String(extRpm))
  }, [extRpm])

  const toggleUnit = () => {
    const next = unit === 'm3h' ? 'm3s' : 'm3h'
    setUnit(next)
    localStorage.setItem('hpe_unit', next)
    if (next === 'm3s') {
      setFlowRate((q_m3h / 3600).toFixed(5))
    } else {
      setFlowRate((parseFloat(flowRate) * 3600).toFixed(1))
    }
  }

  const applyPreset = (p: typeof PRESETS[0]) => {
    setFlowRate(unit === 'm3h' ? String(p.q) : (p.q / 3600).toFixed(5))
    setHead(String(p.h))
    setRpm(String(p.n))
  }

  const handleMachineType = (id: string) => {
    setMachineType(id)
    const mt = MACHINE_TYPES.find(m => m.id === id)
    if (mt) setRpm(String(mt.rpm_hint))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null)
    try {
      const q_m3s = unit === 'm3h' ? q_m3h / 3600 : parseFloat(flowRate)
      const h = parseFloat(head)
      const n = parseFloat(rpm)
      const rho = fluidId === 'custom' ? parseFloat(customRho) : fluid.rho

      const params = {
        flow_rate: q_m3s, head: h, rpm: n,
        machine_type: machineType,
        fluid_density: rho,
        ...(overrideD2 ? { override_d2: parseFloat(overrideD2) / 1000 } : {}),
        ...(overrideB2 ? { override_b2: parseFloat(overrideB2) / 1000 } : {}),
      }

      // Sequential calls to avoid Starlette BaseHTTPMiddleware concurrency deadlock
      const sizing = await fetch('/api/v1/sizing', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(params) }).then(r => r.json())
      const curvesData = await getCurves(q_m3s, h, n).catch(() => ({ points: [] }))
      const lossData = await getLossBreakdown(q_m3s, h, n).catch(() => null)
      const stressData = await runStressAnalysis(q_m3s, h, n).catch(() => null)
      onResult(sizing, curvesData.points || [], lossData, stressData, { flowRate: q_m3h, head: h, rpm: n })
      setLastCalcParams({ q: flowRate, h: head, n: rpm })
      setCalculated(true)
      setTimeout(() => setCalculated(false), 2000)
    } catch (err: any) {
      setError(err.message || 'Erro ao calcular')
    } finally {
      setLoading(false)
    }
  }

  // Quick recalculate logic (feature #5)
  const changedFields = {
    q: lastCalcParams.q !== '' && flowRate !== lastCalcParams.q,
    h: lastCalcParams.h !== '' && head !== lastCalcParams.h,
    n: lastCalcParams.n !== '' && rpm !== lastCalcParams.n,
  }
  const changedCount = [changedFields.q, changedFields.h, changedFields.n].filter(Boolean).length

  const RecalcChip = ({ field }: { field: 'q' | 'h' | 'n' }) => {
    if (changedCount !== 1 || !changedFields[field]) return null
    return (
      <button type="submit" style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, padding: '2px 8px', borderRadius: 12,
        border: '1px solid var(--accent)', background: 'rgba(0,160,223,0.12)',
        color: 'var(--accent)', cursor: 'pointer', marginTop: 3,
        fontFamily: 'var(--font-family)', fontWeight: 600,
      }}>
        Alterado — Recalcular?
      </button>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', background: 'var(--bg-input)',
    border: '1px solid var(--border-primary)', borderRadius: 6,
    color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-family)',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-muted)', display: 'block',
    marginBottom: 3, fontWeight: 500, letterSpacing: '0.03em',
  }
  const fieldStyle: React.CSSProperties = { marginBottom: 12 }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Machine type pills */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>TIPO DE MÁQUINA</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {MACHINE_TYPES.map(m => (
            <button key={m.id} type="button" onClick={() => handleMachineType(m.id)}
              style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${machineType === m.id ? 'var(--accent)' : 'var(--border-primary)'}`,
                background: machineType === m.id ? 'rgba(0,160,223,0.15)' : 'transparent',
                color: machineType === m.id ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fluid selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>FLUIDO</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FLUIDS.map(f => (
            <button key={f.id} type="button" onClick={() => setFluidId(f.id)}
              style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${fluidId === f.id ? 'var(--accent)' : 'var(--border-primary)'}`,
                background: fluidId === f.id ? 'rgba(0,160,223,0.12)' : 'transparent',
                color: fluidId === f.id ? 'var(--accent)' : 'var(--text-muted)',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
              {f.label}
            </button>
          ))}
        </div>
        {fluidId !== 'custom' && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            ρ = {fluid.rho} kg/m³ · μ = {(fluid.mu * 1000).toFixed(2)} mPa·s · Pv = {fluid.pv} Pa
          </div>
        )}
        {fluidId === 'custom' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <label style={{ flex: 1 }}>
              <span style={labelStyle}>ρ [kg/m³]</span>
              <input style={inputStyle} type="number" value={customRho} onChange={e => setCustomRho(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              <span style={labelStyle}>μ [Pa·s]</span>
              <input style={inputStyle} type="number" value={customMu} onChange={e => setCustomMu(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      {/* Operating point */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>PONTO DE OPERAÇÃO</div>
          <button type="button" onClick={toggleUnit}
            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
            {unit === 'm3h' ? 'm³/h' : 'm³/s'}
          </button>
        </div>

        {/* Nq live badge with machine silhouette */}
        {nq > 0 && (
          <div style={{ marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <div style={{ padding: '4px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(0,0,0,0.3)', border: `1px solid ${badge.color}40` }}>
              {badge.icon && <span style={{ fontSize: 9, color: badge.color, flexShrink: 0 }}>{badge.icon}</span>}
              <span style={{ fontSize: 11, color: badge.color, fontWeight: 600 }}>{badge.label}</span>
            </div>
            <ImpellerSilhouette nq={nq} />
          </div>
        )}

        {/* Design Hints panel */}
        {designHint && nq > 0 && (
          <div style={{
            marginBottom: 12, padding: '10px 12px',
            background: 'rgba(0,160,223,0.06)',
            border: '1px solid rgba(0,160,223,0.2)',
            borderRadius: 6, fontSize: 11,
          }}>
            <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 5, fontSize: 10, letterSpacing: '0.05em' }}>
              DICAS DO BANCO DE DADOS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', color: 'var(--text-secondary)' }}>
              <span>η esperado: <b style={{ color: 'var(--text-primary)' }}>{(designHint.eta_expected * 100).toFixed(0)}%</b></span>
              <span>β2 ref: <b style={{ color: 'var(--text-primary)' }}>{designHint.beta2_recommended_deg}°</b></span>
              <span>Z recomendado: <b style={{ color: 'var(--text-primary)' }}>{designHint.blade_count_recommended}</b></span>
              <span>b2/D2: <b style={{ color: 'var(--text-primary)' }}>{designHint.b2_d2_recommended.toFixed(3)}</b></span>
            </div>
            {designHint.splitter_recommended && (
              <div style={{ marginTop: 5, color: '#a78bfa', fontSize: 10 }}>
                ◆ Considere pás interpassagem (splitter) para Nq = {nq.toFixed(0)}
              </div>
            )}
            {designHint.notes && (
              <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 10, fontStyle: 'italic' }}>
                {designHint.notes}
              </div>
            )}
          </div>
        )}

        <div style={fieldStyle}>
          <label style={labelStyle}>Vaz\u00E3o Q [{unit === 'm3h' ? 'm\u00B3/h' : 'm\u00B3/s'}]</label>
          <input className="input" type="number" step="any"
            value={unit === 'm3h' ? flowRate : (q_m3h / 3600).toFixed(6)}
            onChange={e => setFlowRate(unit === 'm3h' ? e.target.value : String(parseFloat(e.target.value) * 3600))}
            placeholder={unit === 'm3h' ? 'ex: 180' : 'ex: 0.05'}
            style={{ borderColor: inputBorder('Q', flowRate) }} />
          <input type="range" min={0} max={1000} step={1}
            value={Math.round(Math.log10(Math.max(q_m3h, 1)) / Math.log10(5000) * 1000)}
            onChange={e => {
              const logVal = (parseFloat(e.target.value) / 1000) * Math.log10(5000)
              const val = Math.pow(10, logVal)
              setFlowRate(unit === 'm3h' ? val.toFixed(1) : (val / 3600).toFixed(5))
            }}
            className="hpe-slider" />
          {(() => {
            const hint = rangeHint(q_m3h, 1, 10000, 'T\u00EDpico: 1-10000 m\u00B3/h')
            return <div style={{ fontSize: 10, marginTop: 3, color: hint.warn ? '#ff9800' : 'var(--text-muted)' }}>{hint.text}</div>
          })()}
          <div style={{ fontSize: 10, marginTop: 2, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Dica: use Multi-Velocidade para ver o desempenho em faixa de vazao.
          </div>
          <RecalcChip field="q" />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Altura Total H [m]</label>
          <input className="input" type="number" step="0.1" value={head} onChange={e => setHead(e.target.value)} placeholder="ex: 30"
            style={{ borderColor: inputBorder('H', head) }} />
          <input type="range" min={1} max={500} step={1}
            value={Math.min(500, Math.max(1, parseFloat(head) || 1))}
            onChange={e => setHead(e.target.value)}
            className="hpe-slider" />
          {(() => {
            const hint = rangeHint(parseFloat(head) || 0, 1, 500, 'T\u00EDpico: 1-500 m')
            return <div style={{ fontSize: 10, marginTop: 3, color: hint.warn ? '#ff9800' : 'var(--text-muted)' }}>{hint.text}</div>
          })()}
          <RecalcChip field="h" />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Rota\u00E7\u00E3o n [rpm]</label>
          <input className="input" type="number" step="1" value={rpm} onChange={e => setRpm(e.target.value)} placeholder="ex: 1750"
            style={{ borderColor: inputBorder('n', rpm) }} />
          <input type="range" min={300} max={6000} step={10}
            value={Math.min(6000, Math.max(300, parseFloat(rpm) || 300))}
            onChange={e => setRpm(e.target.value)}
            className="hpe-slider" />
          {(() => {
            const hint = rangeHint(parseFloat(rpm) || 0, 300, 15000, 'T\u00EDpico: 300-15000 rpm')
            return <div style={{ fontSize: 10, marginTop: 3, color: hint.warn ? '#ff9800' : 'var(--text-muted)' }}>{hint.text}</div>
          })()}
          <RecalcChip field="n" />
        </div>

        {/* Inline quick-fill examples */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: 'Industrial', q: '100', h: '32', n: '1750' },
              { label: 'Alta press\u00E3o', q: '50', h: '80', n: '3550' },
              { label: 'Grande vaz\u00E3o', q: '1000', h: '20', n: '1750' },
            ].map(ex => (
              <button key={ex.label} type="button"
                onClick={() => {
                  setFlowRate(unit === 'm3h' ? ex.q : (parseFloat(ex.q) / 3600).toFixed(5))
                  setHead(ex.h)
                  setRpm(ex.n)
                }}
                style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 12,
                  border: '1px solid var(--border-primary)',
                  background: 'transparent', color: 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                  lineHeight: '16px',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--accent)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-primary)'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
                }}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Application Presets (feature #9) */}
      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => setAppPresetsOpen(o => !o)}
          style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-family)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ transform: appPresetsOpen ? 'rotate(90deg)' : 'none', transition: '0.15s' }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          Aplicacoes
        </button>
        {appPresetsOpen && (
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {APP_PRESETS.map(ap => (
              <button key={ap.label} type="button" onClick={() => {
                setFlowRate(unit === 'm3h' ? String(ap.Q) : (ap.Q / 3600).toFixed(5))
                setHead(String(ap.H))
                setRpm(String(ap.n))
                setFluidId(ap.fluid)
              }}
                style={{
                  padding: '8px 10px', borderRadius: 6, fontSize: 11, textAlign: 'left',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
                  fontFamily: 'var(--font-family)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{ap.label}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Q={ap.Q} H={ap.H} n={ap.n}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>{ap.note}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Presets */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>Exemplos rapidos:</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {PRESETS.map(p => (
            <button key={p.label} type="button" onClick={() => applyPreset(p)}
              style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced options */}
      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => setAdvOpen(o => !o)}
          style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ transform: advOpen ? 'rotate(90deg)' : 'none', transition: '0.15s' }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          Opções Avançadas
        </button>
        {advOpen && (
          <div style={{ marginTop: 10, padding: 12, background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border-primary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>
              <span style={labelStyle}>Folga de topo [mm]</span>
              <input style={inputStyle} type="number" step="0.1" value={tipClearance} onChange={e => setTipClearance(e.target.value)} placeholder="0.3" />
            </label>
            <label>
              <span style={labelStyle}>Rugosidade Ra [μm]</span>
              <input style={inputStyle} type="number" step="1" value={roughness} onChange={e => setRoughness(e.target.value)} placeholder="25" />
            </label>
            <label>
              <span style={labelStyle}>Sobreposição D2 [mm]</span>
              <input style={inputStyle} type="number" step="1" value={overrideD2} onChange={e => setOverrideD2(e.target.value)} placeholder="Automático" />
            </label>
            <label>
              <span style={labelStyle}>Sobreposição b2 [mm]</span>
              <input style={inputStyle} type="number" step="0.5" value={overrideB2} onChange={e => setOverrideB2(e.target.value)} placeholder="Automático" />
            </label>
          </div>
        )}
      </div>

      <button type="submit" className="btn-primary" disabled={loading}
        style={{
          width: '100%',
          background: calculated ? '#22c55e' : undefined,
          borderColor: calculated ? '#22c55e' : undefined,
          animation: calculated ? 'btnPulse 300ms ease' : undefined,
          transition: 'background 0.3s, border-color 0.3s',
        }}>
        {loading
          ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              Calculando...
            </span>
          : calculated
          ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              &#10003; Calculado
            </span>
          : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Executar Dimensionamento
            </span>}
      </button>

      <button type="button" onClick={() => setReverseOpen(true)}
        style={{
          width: '100%', marginTop: 6, padding: 6, fontSize: 11,
          background: 'transparent', border: '1px solid var(--border-primary)',
          color: 'var(--text-muted)', borderRadius: 4, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        Reverso (dado D2, encontrar Q)
      </button>

      <ReverseCalc
        open={reverseOpen}
        onClose={() => setReverseOpen(false)}
        onResult={(q, h, n) => {
          setFlowRate(unit === 'm3h' ? q.toFixed(1) : (q / 3600).toFixed(5))
          setHead(h.toFixed(1))
          setRpm(n.toFixed(0))
        }}
      />

      <input
        type="text"
        placeholder="Observacao desta versao..."
        value={versionNote}
        onChange={e => setVersionNote(e.target.value)}
        style={{ ...inputStyle, fontSize: 11, marginTop: 6 }}
      />

      {error && (
        <div style={{ marginTop: 10, padding: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>
          {error}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes btnPulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
        .hpe-slider {
          width: 100%;
          height: 4px;
          margin: 6px 0 0 0;
          -webkit-appearance: none;
          appearance: none;
          background: var(--border-primary);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
          accent-color: var(--accent);
        }
        .hpe-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          border: none;
        }
        .hpe-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          border: none;
        }
        .hpe-slider::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
        }
        .hpe-slider::-moz-range-track {
          height: 4px;
          border-radius: 2px;
          background: var(--border-primary);
        }
      `}</style>
    </form>
  )
}
