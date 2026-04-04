import React, { useState, useEffect, useRef } from 'react'
import t from '../i18n/pt-br'
import { runSizing, getCurves, getLossBreakdown, runStressAnalysis } from '../services/api'

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
  { id: 'water20', label: 'Água 20°C', rho: 998, mu: 1.0e-3, pv: 2340 },
  { id: 'water60', label: 'Água 60°C', rho: 983, mu: 4.7e-4, pv: 19940 },
  { id: 'oil', label: 'Óleo Mineral', rho: 870, mu: 30e-3, pv: 50 },
  { id: 'custom', label: 'Custom', rho: 998, mu: 1.0e-3, pv: 2340 },
]

const PRESETS = [
  { label: 'NS280', q: 385, h: 17, n: 1000 },
  { label: 'Bomba Típica', q: 180, h: 30, n: 1750 },
  { label: 'Alta Velocidade', q: 50, h: 80, n: 2900 },
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    } catch (err: any) {
      setError(err.message || 'Erro ao calcular')
    } finally {
      setLoading(false)
    }
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
              }}>
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

        {/* Nq live badge */}
        {nq > 0 && (
          <div style={{ marginBottom: 10, padding: '4px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,0,0,0.3)', border: `1px solid ${badge.color}40` }}>
            {badge.icon && <span style={{ fontSize: 9, color: badge.color, flexShrink: 0 }}>{badge.icon}</span>}
            <span style={{ fontSize: 11, color: badge.color, fontWeight: 600 }}>{badge.label}</span>
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
            placeholder={unit === 'm3h' ? 'ex: 180' : 'ex: 0.05'} />
          {(() => {
            const hint = rangeHint(q_m3h, 1, 10000, 'T\u00EDpico: 1-10000 m\u00B3/h')
            return <div style={{ fontSize: 10, marginTop: 3, color: hint.warn ? '#ff9800' : 'var(--text-muted)' }}>{hint.text}</div>
          })()}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Altura Total H [m]</label>
          <input className="input" type="number" step="0.1" value={head} onChange={e => setHead(e.target.value)} placeholder="ex: 30" />
          {(() => {
            const hint = rangeHint(parseFloat(head) || 0, 1, 500, 'T\u00EDpico: 1-500 m')
            return <div style={{ fontSize: 10, marginTop: 3, color: hint.warn ? '#ff9800' : 'var(--text-muted)' }}>{hint.text}</div>
          })()}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Rota\u00E7\u00E3o n [rpm]</label>
          <input className="input" type="number" step="1" value={rpm} onChange={e => setRpm(e.target.value)} placeholder="ex: 1750" />
          {(() => {
            const hint = rangeHint(parseFloat(rpm) || 0, 300, 15000, 'T\u00EDpico: 300-15000 rpm')
            return <div style={{ fontSize: 10, marginTop: 3, color: hint.warn ? '#ff9800' : 'var(--text-muted)' }}>{hint.text}</div>
          })()}
        </div>
      </div>

      {/* Presets */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>Exemplos rápidos:</div>
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

      <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
        {loading
          ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              Calculando...
            </span>
          : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Executar Dimensionamento
            </span>}
      </button>

      {error && (
        <div style={{ marginTop: 10, padding: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#ef4444', fontSize: 12 }}>
          {error}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </form>
  )
}
