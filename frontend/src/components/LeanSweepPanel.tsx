/**
 * LeanSweepPanel -- Lean, Sweep, and Bow analysis with three SVG diagrams
 * and numeric results table.
 */
import React, { useCallback, useState } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

interface RZPoint { r: number; z: number }
interface RThetaPoint { r: number; theta: number }

interface LeanSweepData {
  lean_angles: number[]      // [hub, mid, shroud] degrees
  sweep_angle: number        // degrees
  bow_fraction: number       // 0-1
  le_line: RZPoint[]
  te_line: RZPoint[]
  stacking_line: RThetaPoint[]
  recommendations: string[]
}

interface Props {
  defaultFlowRate?: number
  defaultHead?: number
  defaultRpm?: number
}

// ── SVG diagram constants ───────────────────────────────────────────────────

const DW = 220, DH = 170
const DP = { l: 30, r: 10, t: 16, b: 24 }
const diw = DW - DP.l - DP.r
const dih = DH - DP.t - DP.b

// ── Component ───────────────────────────────────────────────────────────────

export default function LeanSweepPanel({
  defaultFlowRate = 180,
  defaultHead = 30,
  defaultRpm = 1750,
}: Props) {
  const [fQ, setFQ] = useState(String(defaultFlowRate))
  const [fH, setFH] = useState(String(defaultHead))
  const [fN, setFN] = useState(String(defaultRpm))
  const [leanAngle, setLeanAngle] = useState('0')
  const [sweepAngle, setSweepAngle] = useState('0')

  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<LeanSweepData | null>(null)

  const handleRun = useCallback(async () => {
    const q = parseFloat(fQ)
    const h = parseFloat(fH)
    const n = parseFloat(fN)
    if (!q || !h || !n) return

    setRunning(true)
    setError('')
    try {
      const res = await fetch('/api/v1/analysis/lean_sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow_rate: q / 3600,
          head: h,
          rpm: n,
          lean_angle: parseFloat(leanAngle) || 0,
          sweep_angle: parseFloat(sweepAngle) || 0,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e: any) {
      setError(e.message ?? 'Erro')
    } finally {
      setRunning(false)
    }
  }, [fQ, fH, fN, leanAngle, sweepAngle])

  return (
    <div style={{ marginBottom: 30 }}>
      <h3 style={{ color: 'var(--accent)', fontSize: 15, margin: '0 0 16px' }}>
        Análise Lean / Sweep / Bow
      </h3>

      {/* Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
        <FieldInput label="Q [m\u00b3/h]" value={fQ} onChange={setFQ} disabled={running} />
        <FieldInput label="H [m]" value={fH} onChange={setFH} disabled={running} />
        <FieldInput label="RPM" value={fN} onChange={setFN} disabled={running} />
        <FieldInput label="Lean [\u00b0]" value={leanAngle} onChange={setLeanAngle} disabled={running} />
        <FieldInput label="Sweep [\u00b0]" value={sweepAngle} onChange={setSweepAngle} disabled={running} />
        <button className="btn-primary" onClick={handleRun} disabled={running}
          style={{ padding: '7px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
          {running ? '...' : 'Analisar'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(220,53,69,0.12)', borderRadius: 6, border: '1px solid rgba(220,53,69,0.3)', fontSize: 13, color: 'var(--accent-danger)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Three diagrams side by side */}
      {data && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <DiagramCard title="Lean (r-\u03b8)">
              <LeanDiagram data={data} />
            </DiagramCard>
            <DiagramCard title="Sweep (r-z)">
              <SweepDiagram data={data} />
            </DiagramCard>
            <DiagramCard title="Bow">
              <BowDiagram data={data} />
            </DiagramCard>
          </div>

          {/* Numeric table */}
          <div className="card" style={{ padding: '10px 14px', marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={thStyle}>Parâmetro</th>
                  <th style={thStyle}>Hub</th>
                  <th style={thStyle}>Mid</th>
                  <th style={thStyle}>Shroud</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdLabel}>Lean [\u00b0]</td>
                  <td style={tdVal}>{data.lean_angles[0]?.toFixed(1)}</td>
                  <td style={tdVal}>{data.lean_angles[1]?.toFixed(1)}</td>
                  <td style={tdVal}>{data.lean_angles[2]?.toFixed(1)}</td>
                </tr>
                <tr>
                  <td style={tdLabel}>Sweep [\u00b0]</td>
                  <td style={tdVal} colSpan={3}>{data.sweep_angle.toFixed(1)}</td>
                </tr>
                <tr>
                  <td style={tdLabel}>Bow [%]</td>
                  <td style={tdVal} colSpan={3}>{(data.bow_fraction * 100).toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="card" style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>
                Recomendações
              </div>
              {data.recommendations.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid var(--border-primary)' }}>
                  {r}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!data && !running && !error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Informe os parâmetros e clique em Analisar
        </div>
      )}
    </div>
  )
}

// ── Diagram wrapper ─────────────────────────────────────────────────────────

function DiagramCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '8px 10px', flex: '1 1 200px', minWidth: 200 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>{title}</div>
      {children}
    </div>
  )
}

// ── Lean diagram: r-theta cross sections at hub/mid/shroud with angle annotation ──

function LeanDiagram({ data }: { data: LeanSweepData }) {
  const pts = data.stacking_line
  if (pts.length < 2) return null

  const rMin = Math.min(...pts.map(p => p.r))
  const rMax = Math.max(...pts.map(p => p.r))
  const tMin = Math.min(...pts.map(p => p.theta))
  const tMax = Math.max(...pts.map(p => p.theta))
  const rRange = rMax - rMin || 1
  const tRange = tMax - tMin || 1

  const toX = (theta: number) => DP.l + ((theta - tMin) / tRange) * diw
  const toY = (r: number) => DP.t + dih - ((r - rMin) / rRange) * dih

  // Hub, mid, shroud indices
  const hubIdx = 0
  const midIdx = Math.floor(pts.length / 2)
  const shrIdx = pts.length - 1

  return (
    <svg width={DW} height={DH} style={{ display: 'block' }}>
      {/* Axes */}
      <line x1={DP.l} y1={DP.t} x2={DP.l} y2={DP.t + dih} stroke="var(--border-primary)" strokeWidth={0.5} />
      <line x1={DP.l} y1={DP.t + dih} x2={DP.l + diw} y2={DP.t + dih} stroke="var(--border-primary)" strokeWidth={0.5} />
      <text x={DW / 2} y={DH - 4} fontSize={8} fill="var(--text-muted)" textAnchor="middle">{'\u03b8 [\u00b0]'}</text>
      <text x={6} y={DH / 2} fontSize={8} fill="var(--text-muted)" textAnchor="middle" transform={`rotate(-90, 6, ${DH / 2})`}>r [mm]</text>

      {/* Stacking line */}
      <polyline
        points={pts.map(p => `${toX(p.theta)},${toY(p.r)}`).join(' ')}
        fill="none" stroke="var(--accent)" strokeWidth={1.5}
      />

      {/* Hub/mid/shroud markers with angle labels */}
      {[
        { idx: hubIdx, label: 'Hub', color: '#4caf50' },
        { idx: midIdx, label: 'Mid', color: '#ff9800' },
        { idx: shrIdx, label: 'Shr', color: '#e040fb' },
      ].map(({ idx, label, color }) => {
        const p = pts[idx]
        const x = toX(p.theta)
        const y = toY(p.r)
        const angle = data.lean_angles[idx === hubIdx ? 0 : idx === midIdx ? 1 : 2]
        return (
          <g key={label}>
            <circle cx={x} cy={y} r={4} fill={color} />
            <text x={x + 6} y={y - 4} fontSize={8} fill={color}>{label} {angle?.toFixed(1)}\u00b0</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Sweep diagram: r-z meridional view with LE/TE lines ──────────────────

function SweepDiagram({ data }: { data: LeanSweepData }) {
  const allPts = [...data.le_line, ...data.te_line]
  if (allPts.length < 2) return null

  const rMin = Math.min(...allPts.map(p => p.r))
  const rMax = Math.max(...allPts.map(p => p.r))
  const zMin = Math.min(...allPts.map(p => p.z))
  const zMax = Math.max(...allPts.map(p => p.z))
  const rRange = rMax - rMin || 1
  const zRange = zMax - zMin || 1

  const toX = (r: number) => DP.l + ((r - rMin) / rRange) * diw
  const toY = (z: number) => DP.t + dih - ((z - zMin) / zRange) * dih

  return (
    <svg width={DW} height={DH} style={{ display: 'block' }}>
      <line x1={DP.l} y1={DP.t} x2={DP.l} y2={DP.t + dih} stroke="var(--border-primary)" strokeWidth={0.5} />
      <line x1={DP.l} y1={DP.t + dih} x2={DP.l + diw} y2={DP.t + dih} stroke="var(--border-primary)" strokeWidth={0.5} />
      <text x={DW / 2} y={DH - 4} fontSize={8} fill="var(--text-muted)" textAnchor="middle">r [mm]</text>
      <text x={6} y={DH / 2} fontSize={8} fill="var(--text-muted)" textAnchor="middle" transform={`rotate(-90, 6, ${DH / 2})`}>z [mm]</text>

      {/* LE line */}
      <polyline
        points={data.le_line.map(p => `${toX(p.r)},${toY(p.z)}`).join(' ')}
        fill="none" stroke="#4caf50" strokeWidth={1.5}
      />
      {/* TE line */}
      <polyline
        points={data.te_line.map(p => `${toX(p.r)},${toY(p.z)}`).join(' ')}
        fill="none" stroke="#ff5722" strokeWidth={1.5}
      />

      {/* Sweep angle annotation */}
      <text x={DP.l + diw - 4} y={DP.t + 14} fontSize={9} fill="var(--accent)" textAnchor="end">
        Sweep {data.sweep_angle.toFixed(1)}{'\u00b0'}
      </text>

      {/* Legend */}
      <line x1={DP.l + 4} y1={DP.t + 6} x2={DP.l + 20} y2={DP.t + 6} stroke="#4caf50" strokeWidth={1.5} />
      <text x={DP.l + 24} y={DP.t + 9} fontSize={7} fill="#4caf50">LE</text>
      <line x1={DP.l + 4} y1={DP.t + 16} x2={DP.l + 20} y2={DP.t + 16} stroke="#ff5722" strokeWidth={1.5} />
      <text x={DP.l + 24} y={DP.t + 19} fontSize={7} fill="#ff5722">TE</text>
    </svg>
  )
}

// ── Bow diagram: deviation curve from hub to shroud ─────────────────────

function BowDiagram({ data }: { data: LeanSweepData }) {
  const pts = data.stacking_line
  if (pts.length < 3) return null

  // Compute deviation from straight line at each span fraction
  const t0 = pts[0].theta
  const t1 = pts[pts.length - 1].theta
  const span_range = t1 - t0

  const devPts: { spanFrac: number; dev: number }[] = pts.map((p, k) => {
    const s = k / (pts.length - 1)
    const expected = t0 + s * span_range
    return { spanFrac: s, dev: p.theta - expected }
  })

  const devMin = Math.min(...devPts.map(d => d.dev))
  const devMax = Math.max(...devPts.map(d => d.dev))
  const devRange = Math.max(Math.abs(devMin), Math.abs(devMax), 0.1)

  const toX = (spanFrac: number) => DP.l + spanFrac * diw
  const toY = (dev: number) => DP.t + dih / 2 - (dev / devRange) * (dih / 2) * 0.9

  return (
    <svg width={DW} height={DH} style={{ display: 'block' }}>
      <line x1={DP.l} y1={DP.t} x2={DP.l} y2={DP.t + dih} stroke="var(--border-primary)" strokeWidth={0.5} />
      <line x1={DP.l} y1={DP.t + dih} x2={DP.l + diw} y2={DP.t + dih} stroke="var(--border-primary)" strokeWidth={0.5} />
      {/* Zero reference line */}
      <line x1={DP.l} y1={toY(0)} x2={DP.l + diw} y2={toY(0)} stroke="var(--border-primary)" strokeWidth={0.5} strokeDasharray="3,3" />
      <text x={DW / 2} y={DH - 4} fontSize={8} fill="var(--text-muted)" textAnchor="middle">Span (Hub{'\u2192'}Shroud)</text>
      <text x={6} y={DH / 2} fontSize={8} fill="var(--text-muted)" textAnchor="middle" transform={`rotate(-90, 6, ${DH / 2})`}>{'\u0394\u03b8 [\u00b0]'}</text>

      {/* Deviation curve */}
      <polyline
        points={devPts.map(d => `${toX(d.spanFrac)},${toY(d.dev)}`).join(' ')}
        fill="none" stroke="#e040fb" strokeWidth={1.5}
      />

      {/* Bow annotation */}
      <text x={DP.l + diw - 4} y={DP.t + 14} fontSize={9} fill="var(--accent)" textAnchor="end">
        Bow {(data.bow_fraction * 100).toFixed(1)}%
      </text>
    </svg>
  )
}

// ── Shared styles & helpers ─────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '6px 8px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 500,
}

const tdLabel: React.CSSProperties = {
  padding: '4px 8px', color: 'var(--text-muted)', fontSize: 11,
}

const tdVal: React.CSSProperties = {
  padding: '4px 8px', color: 'var(--text-primary)', fontSize: 11, fontWeight: 500,
}

function FieldInput({ label, value, onChange, disabled }:
  { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{label}</span>
      <input
        className="input"
        type="number"
        step="any"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ padding: '5px 8px', fontSize: 12, width: '100%' }}
      />
    </label>
  )
}
