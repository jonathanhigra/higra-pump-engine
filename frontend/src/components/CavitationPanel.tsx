/**
 * CavitationPanel — Análise de cavitação da bomba.
 *
 * Calcula NPSHr, margem de segurança, nível de risco e recomendações.
 * Exibe curva NPSHr–Q estimada via SVG inline.
 */
import React, { useState, useCallback } from 'react'

interface Props {
  /** Vazão BEP em m³/h (do opPoint) */
  flowRate: number
  /** Altura BEP em m */
  head: number
  /** Rotação em RPM */
  rpm: number
  /** SizingResult completo (opcional para enriquecer dados) */
  sizing?: {
    specific_speed_nq: number
    estimated_npsh_r: number
    sigma: number
    impeller_d2: number
    estimated_efficiency: number
  }
}

interface CavitationResult {
  npsh_r: number
  npsh_a: number
  sigma_plant: number
  sigma_critical: number
  margin: number
  safe: boolean
  nq: number
  suction_specific_speed: number
  risk_level: 'safe' | 'marginal' | 'risky' | 'critical'
  recommendations: string[]
  npshq_curve?: { Q: number; npsh_r: number }[]
}

type PanelState = 'idle' | 'running' | 'completed' | 'failed'

const RISK_COLORS: Record<string, string> = {
  safe:     '#22c55e',
  marginal: '#f59e0b',
  risky:    '#ef4444',
  critical: '#7f1d1d',
}

const RISK_LABELS: Record<string, string> = {
  safe:     'Seguro',
  marginal: 'Marginal',
  risky:    'Risco',
  critical: 'Crítico',
}

export default function CavitationPanel({ flowRate, head, rpm, sizing }: Props) {
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [result, setResult] = useState<CavitationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Inputs configuráveis
  const [npshAvailable, setNpshAvailable] = useState(
    sizing?.estimated_npsh_r != null ? String((sizing.estimated_npsh_r * 1.3).toFixed(1)) : '5.0'
  )
  const [fluidTemp, setFluidTemp] = useState('20')
  const [safetyMargin, setSafetyMargin] = useState('0.5')

  const canRun = flowRate > 0 && head > 0 && rpm > 0

  const handleRun = useCallback(async () => {
    setError(null)
    setPanelState('running')
    setResult(null)

    try {
      const body: Record<string, unknown> = {
        flow_rate:       flowRate / 3600,
        head,
        rpm,
        npsh_available:  parseFloat(npshAvailable) || 5.0,
        fluid_temp_c:    parseFloat(fluidTemp) || 20.0,
        safety_margin:   parseFloat(safetyMargin) || 0.5,
      }

      // Adicionar campos de sizing se disponíveis
      if (sizing) {
        body.specific_speed_nq = sizing.specific_speed_nq
        body.d2                = sizing.impeller_d2
      }

      const resp = await fetch('/api/v1/cfd/cavitation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      if (!resp.ok) {
        const txt = await resp.text()
        throw new Error(`HTTP ${resp.status}: ${txt}`)
      }

      const data = await resp.json()
      // Gerar curva NPSHr–Q estimada no frontend se API não retornar
      if (!data.npshq_curve) {
        data.npshq_curve = _estimateNpshCurve(data.npsh_r, flowRate)
      }
      setResult(data)
      setPanelState('completed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setPanelState('failed')
    }
  }, [flowRate, head, rpm, npshAvailable, fluidTemp, safetyMargin, sizing])

  const handleReset = () => {
    setPanelState('idle')
    setResult(null)
    setError(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Config card */}
      <div style={cardStyle}>
        <h4 style={headingStyle}>Parâmetros de Cavitação</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
          <LabeledInput
            label="NPSH disponível (m)"
            value={npshAvailable}
            onChange={setNpshAvailable}
            type="number"
            min="0"
            step="0.1"
          />
          <LabeledInput
            label="Temperatura fluido (°C)"
            value={fluidTemp}
            onChange={setFluidTemp}
            type="number"
            min="0"
            max="150"
          />
          <LabeledInput
            label="Margem segurança (m)"
            value={safetyMargin}
            onChange={setSafetyMargin}
            type="number"
            min="0"
            step="0.1"
          />
        </div>

        {!canRun && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
            Preencha Q, H e n no ponto de operação antes de analisar.
          </p>
        )}

        {panelState === 'idle' || panelState === 'failed' ? (
          <button
            className="btn-primary"
            onClick={handleRun}
            disabled={!canRun}
            style={{ fontSize: 13, padding: '8px 20px' }}
          >
            Analisar Cavitação
          </button>
        ) : panelState === 'running' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Calculando…</span>
          </div>
        ) : null}

        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444', wordBreak: 'break-word' }}>
            {error}
            <button
              onClick={handleReset}
              style={{ marginLeft: 8, fontSize: 11, background: 'none', border: 'none',
                       cursor: 'pointer', color: 'var(--text-muted)', textDecoration: 'underline' }}
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {panelState === 'completed' && result && (
        <>
          {/* Risk badge + key metrics */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <RiskGauge level={result.risk_level} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: RISK_COLORS[result.risk_level] }}>
                  {RISK_LABELS[result.risk_level]}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Margem: {result.margin >= 0 ? '+' : ''}{result.margin.toFixed(2)} m
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              <MetricCard label="NPSHr" value={`${result.npsh_r.toFixed(2)} m`} />
              <MetricCard label="NPSHd (disponível)" value={`${result.npsh_a.toFixed(2)} m`} />
              <MetricCard label="σ planta" value={result.sigma_plant.toFixed(4)} />
              <MetricCard label="σ crítico" value={result.sigma_critical.toFixed(4)} />
              <MetricCard label="nq" value={result.nq.toFixed(1)} />
              <MetricCard label="Nss" value={result.suction_specific_speed.toFixed(0)} />
            </div>
          </div>

          {/* NPSHr–Q chart */}
          {result.npshq_curve && result.npshq_curve.length > 0 && (
            <div style={cardStyle}>
              <h4 style={headingStyle}>Curva NPSHr – Q</h4>
              <NpshQChart
                curve={result.npshq_curve}
                npshAvailable={parseFloat(npshAvailable)}
                bepQ={flowRate}
              />
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div style={cardStyle}>
              <h4 style={headingStyle}>Recomendações</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                {result.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={handleReset}
            style={{ alignSelf: 'flex-start', fontSize: 12, padding: '4px 12px',
                     background: 'transparent', border: '1px solid var(--border-primary)',
                     borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            Nova análise
          </button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LabeledInput({ label, value, onChange, type = 'text', min, max, step }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; min?: string; max?: string; step?: string
}) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <input
        type={type}
        className="input"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', fontSize: 13 }}
      />
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function RiskGauge({ level }: { level: string }) {
  const color = RISK_COLORS[level] ?? '#888'
  const pct = level === 'safe' ? 0.2 : level === 'marginal' ? 0.5 : level === 'risky' ? 0.75 : 0.95
  const r = 24
  const circ = 2 * Math.PI * r
  const dash = circ * pct

  return (
    <svg width={64} height={64} viewBox="0 0 64 64">
      {/* Track */}
      <circle cx={32} cy={32} r={r} fill="none" stroke="var(--bg-secondary)" strokeWidth={6} />
      {/* Arc */}
      <circle
        cx={32} cy={32} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text x={32} y={37} textAnchor="middle" fontSize={10} fontWeight={700} fill={color}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}

function NpshQChart({ curve, npshAvailable, bepQ }: {
  curve: { Q: number; npsh_r: number }[]
  npshAvailable: number
  bepQ: number
}) {
  const W = 480, H = 180, PL = 48, PR = 12, PT = 12, PB = 32

  const Qs  = curve.map(p => p.Q)
  const Ns  = curve.map(p => p.npsh_r)
  const qMin = Math.min(...Qs), qMax = Math.max(...Qs)
  const nMin = 0, nMax = Math.max(npshAvailable * 1.3, Math.max(...Ns) * 1.1)

  const cx = (q: number) => PL + ((q - qMin) / (qMax - qMin || 1)) * (W - PL - PR)
  const cy = (n: number) => PT + (1 - (n - nMin) / (nMax - nMin || 1)) * (H - PT - PB)

  const npshLine = curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(p.Q).toFixed(1)},${cy(p.npsh_r).toFixed(1)}`).join(' ')
  const availY = cy(npshAvailable)
  const bepX   = cx(bepQ)

  // Axis ticks
  const nTicks = 4
  const yTicks = Array.from({ length: nTicks + 1 }, (_, i) => nMin + (nMax - nMin) * i / nTicks)
  const xTicks = [qMin, (qMin + qMax) / 2, qMax]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Grid */}
      {yTicks.map(v => (
        <line key={v} x1={PL} y1={cy(v)} x2={W - PR} y2={cy(v)}
              stroke="var(--border-subtle)" strokeWidth={0.5} strokeDasharray="3 3" />
      ))}

      {/* NPSHa line */}
      <line x1={PL} y1={availY} x2={W - PR} y2={availY}
            stroke="#22c55e" strokeWidth={1.5} strokeDasharray="6 3" />
      <text x={W - PR - 4} y={availY - 4} fontSize={9} fill="#22c55e" textAnchor="end">
        NPSHd={npshAvailable.toFixed(1)} m
      </text>

      {/* NPSHr curve */}
      <path d={npshLine} fill="none" stroke="var(--accent)" strokeWidth={2} />

      {/* Fill danger zone: NPSHr > NPSHa */}
      {(() => {
        const dangerPts = curve.filter(p => p.npsh_r > npshAvailable)
        if (dangerPts.length < 2) return null
        const area = dangerPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx(p.Q).toFixed(1)},${cy(p.npsh_r).toFixed(1)}`).join(' ')
          + ` L${cx(dangerPts[dangerPts.length-1].Q).toFixed(1)},${availY.toFixed(1)}`
          + ` L${cx(dangerPts[0].Q).toFixed(1)},${availY.toFixed(1)} Z`
        return <path d={area} fill="#ef4444" fillOpacity={0.15} />
      })()}

      {/* BEP marker */}
      <line x1={bepX} y1={PT} x2={bepX} y2={H - PB}
            stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 2" />
      <text x={bepX + 3} y={PT + 10} fontSize={9} fill="var(--text-muted)">BEP</text>

      {/* Y-axis ticks */}
      {yTicks.map(v => (
        <text key={v} x={PL - 4} y={cy(v) + 4} fontSize={9} fill="var(--text-muted)" textAnchor="end">
          {v.toFixed(1)}
        </text>
      ))}
      {/* X-axis ticks */}
      {xTicks.map(q => (
        <text key={q} x={cx(q)} y={H - PB + 14} fontSize={9} fill="var(--text-muted)" textAnchor="middle">
          {q.toFixed(0)}
        </text>
      ))}

      {/* Axis labels */}
      <text x={PL + (W - PL - PR) / 2} y={H} fontSize={10} fill="var(--text-muted)" textAnchor="middle">
        Q (m³/h)
      </text>
      <text x={10} y={PT + (H - PT - PB) / 2} fontSize={10} fill="var(--text-muted)"
            textAnchor="middle" transform={`rotate(-90 10 ${PT + (H - PT - PB) / 2})`}>
        NPSH (m)
      </text>

      {/* Axes */}
      <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="var(--border-primary)" strokeWidth={1} />
      <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="var(--border-primary)" strokeWidth={1} />
    </svg>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14,
      border: '2px solid var(--border-primary)',
      borderTop: '2px solid var(--accent)',
      borderRadius: '50%',
      animation: 'cav-spin 0.8s linear infinite',
      flexShrink: 0,
    }}>
      <style>{`@keyframes cav-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Estimativa local da curva NPSHr–Q usando parábola de Gülich (sem API). */
function _estimateNpshCurve(npshBep: number, qBep: number): { Q: number; npsh_r: number }[] {
  const fractions = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3]
  return fractions.map(f => ({
    Q:      qBep * f,
    // NPSHr ≈ NPSHr_BEP × (1 + 0.3·(f-1)² + 0.2·(f-1))  — simplified
    npsh_r: npshBep * (1 + 0.3 * (f - 1) ** 2 + 0.2 * Math.abs(f - 1)),
  }))
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-primary)',
  borderRadius: 8,
  padding: 16,
  background: 'var(--card-bg)',
}

const headingStyle: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary)',
}
