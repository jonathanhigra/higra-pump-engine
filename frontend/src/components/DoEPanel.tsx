/**
 * DoEPanel — Design of Experiments visual workflow.
 *
 * Allows users to define design variables with ranges, choose a DoE method,
 * generate sample points via the backend, view results in a table and scatter
 * plot, export to CSV, and trigger surrogate training.
 */
import React, { useCallback, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Variable {
  name: string
  min: number
  max: number
}

interface DesignPoint {
  variables: Record<string, number>
  responses: {
    efficiency?: number
    npsh_r?: number
    power?: number
    [key: string]: number | undefined
  }
}

type DoEMethod = 'latin_hypercube' | 'full_factorial' | 'central_composite'
type RunState = 'idle' | 'running' | 'done' | 'error'

interface Props {
  defaultFlowRate?: number
  defaultHead?: number
  defaultRpm?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = '/api/v1'

function FieldInput({
  label,
  value,
  onChange,
  disabled,
  type = 'text',
  style,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  type?: string
  style?: React.CSSProperties
}) {
  return (
    <label style={{ display: 'block', ...style }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
        {label}
      </span>
      <input
        className="input"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ padding: '5px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DoEPanel({
  defaultFlowRate = 180,
  defaultHead = 30,
  defaultRpm = 1750,
}: Props) {
  // Base operating point
  const [fQ, setFQ] = useState(String(defaultFlowRate))
  const [fH, setFH] = useState(String(defaultHead))
  const [fN, setFN] = useState(String(defaultRpm))

  // Variables
  const defaultVars: Variable[] = [
    { name: 'd2_override_pct', min: -10, max: 10 },
    { name: 'b2_override_pct', min: -15, max: 15 },
    { name: 'rpm_pct', min: -5, max: 5 },
  ]
  const [variables, setVariables] = useState<Variable[]>(defaultVars)

  // DoE settings
  const [sampleCount, setSampleCount] = useState(30)
  const [method, setMethod] = useState<DoEMethod>('latin_hypercube')

  // Runtime
  const [runState, setRunState] = useState<RunState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [results, setResults] = useState<DesignPoint[]>([])

  // Scatter axes
  const [xAxis, setXAxis] = useState('d2_override_pct')
  const [yAxis, setYAxis] = useState('efficiency')

  // Surrogate training state
  const [trainState, setTrainState] = useState<'idle' | 'training' | 'done'>('idle')

  // ---- Variable management ----

  const addVariable = useCallback(() => {
    setVariables(prev => [...prev, { name: `var_${prev.length}`, min: -10, max: 10 }])
  }, [])

  const removeVariable = useCallback((idx: number) => {
    setVariables(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const updateVariable = useCallback((idx: number, field: keyof Variable, value: string) => {
    setVariables(prev => {
      const next = [...prev]
      if (field === 'name') {
        next[idx] = { ...next[idx], name: value }
      } else {
        next[idx] = { ...next[idx], [field]: parseFloat(value) || 0 }
      }
      return next
    })
  }, [])

  // ---- Run DoE ----

  const handleRun = useCallback(async () => {
    setRunState('running')
    setErrorMsg('')
    setResults([])

    try {
      const body = {
        flow_rate: parseFloat(fQ) / 3600,
        head: parseFloat(fH),
        rpm: parseFloat(fN),
        variables: variables.map(v => ({ name: v.name, min: v.min, max: v.max })),
        n_samples: sampleCount,
        method,
      }

      const res = await fetch(`${API}/optimize/doe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || res.statusText)
      }

      const data = await res.json()
      const points: DesignPoint[] = (data.points || data.results || []).map(
        (pt: any) => ({
          variables: pt.variables || pt.inputs || {},
          responses: pt.responses || pt.outputs || pt.objectives || {},
        })
      )
      setResults(points)
      setRunState('done')

      // Set scatter axes to first variable and efficiency if available
      if (variables.length > 0) setXAxis(variables[0].name)
      setYAxis('efficiency')
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao gerar DoE')
      setRunState('error')
    }
  }, [fQ, fH, fN, variables, sampleCount, method])

  // ---- Export CSV ----

  const exportCSV = useCallback(() => {
    if (results.length === 0) return
    const allVarKeys = Object.keys(results[0].variables)
    const allResKeys = Object.keys(results[0].responses)
    const headers = [...allVarKeys, ...allResKeys]

    const rows = results.map(pt => {
      const vals = [
        ...allVarKeys.map(k => pt.variables[k] ?? ''),
        ...allResKeys.map(k => pt.responses[k] ?? ''),
      ]
      return vals.join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'doe_results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [results])

  // ---- Train surrogate ----

  const handleTrain = useCallback(async () => {
    setTrainState('training')
    try {
      const res = await fetch(`${API}/surrogate/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n_samples: results.length }),
      })
      if (!res.ok) throw new Error('Training failed')
      setTrainState('done')
    } catch {
      setTrainState('idle')
    }
  }, [results])

  // ---- Scatter plot helpers ----

  const SVG_W = 420
  const SVG_H = 240
  const PAD = { l: 52, r: 16, t: 16, b: 42 }
  const iw = SVG_W - PAD.l - PAD.r
  const ih = SVG_H - PAD.t - PAD.b

  const getVal = (pt: DesignPoint, key: string): number => {
    if (key in pt.variables) return pt.variables[key]
    if (key in pt.responses) return pt.responses[key] ?? 0
    return 0
  }

  const xVals = results.map(pt => getVal(pt, xAxis))
  const yVals = results.map(pt => getVal(pt, yAxis))
  const etaVals = results.map(pt => pt.responses.efficiency ?? 0)

  const xMin = Math.min(...xVals, 0)
  const xMax = Math.max(...xVals, 1)
  const yMin = Math.min(...yVals, 0)
  const yMax = Math.max(...yVals, 1)
  const etaMin = Math.min(...etaVals)
  const etaMax = Math.max(...etaVals, 1)

  const toSvg = (xv: number, yv: number) => ({
    x: PAD.l + ((xv - xMin) / (xMax - xMin || 1)) * iw,
    y: PAD.t + ih - ((yv - yMin) / (yMax - yMin || 1)) * ih,
  })

  const etaColor = (eta: number): string => {
    const t = etaMax > etaMin ? (eta - etaMin) / (etaMax - etaMin) : 0.5
    const r = Math.round(220 * (1 - t) + 40 * t)
    const g = Math.round(53 * (1 - t) + 180 * t)
    const b = Math.round(69 * (1 - t) + 80 * t)
    return `rgb(${r},${g},${b})`
  }

  // Axis options for dropdowns
  const axisOptions: string[] = [
    ...variables.map(v => v.name),
    'efficiency',
    'npsh_r',
    'power',
  ]

  // ---- Hover state ----
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  return (
    <div style={{ marginBottom: 30 }}>
      <h3 style={{ color: 'var(--accent)', fontSize: 15, margin: '0 0 16px' }}>
        Design of Experiments (DoE)
      </h3>

      {/* Base operating point */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <FieldInput label="Vazão Q [m³/h]" value={fQ} onChange={setFQ} disabled={runState === 'running'} />
        <FieldInput label="Altura H [m]" value={fH} onChange={setFH} disabled={runState === 'running'} />
        <FieldInput label="Rotação [rpm]" value={fN} onChange={setFN} disabled={runState === 'running'} />
      </div>

      {/* Variable definitions */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Variáveis de projeto</span>
          <button
            className="btn-primary"
            onClick={addVariable}
            disabled={runState === 'running'}
            style={{ padding: '3px 10px', fontSize: 11 }}
          >
            + Adicionar
          </button>
        </div>

        <div style={{
          border: '1px solid var(--border-primary)',
          borderRadius: 6,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 32px',
            gap: 8,
            padding: '6px 10px',
            background: 'var(--bg-subtle)',
            fontSize: 10,
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}>
            <span>Nome</span>
            <span>Min</span>
            <span>Max</span>
            <span></span>
          </div>

          {variables.map((v, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 32px',
                gap: 8,
                padding: '4px 10px',
                borderTop: '1px solid var(--border-primary)',
                alignItems: 'center',
              }}
            >
              <input
                className="input"
                value={v.name}
                onChange={e => updateVariable(i, 'name', e.target.value)}
                disabled={runState === 'running'}
                style={{ padding: '3px 6px', fontSize: 11 }}
              />
              <input
                className="input"
                type="number"
                value={v.min}
                onChange={e => updateVariable(i, 'min', e.target.value)}
                disabled={runState === 'running'}
                style={{ padding: '3px 6px', fontSize: 11 }}
              />
              <input
                className="input"
                type="number"
                value={v.max}
                onChange={e => updateVariable(i, 'max', e.target.value)}
                disabled={runState === 'running'}
                style={{ padding: '3px 6px', fontSize: 11 }}
              />
              <button
                onClick={() => removeVariable(i)}
                disabled={runState === 'running' || variables.length <= 1}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-danger)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 0,
                }}
                title="Remover variável"
              >
                x
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* DoE settings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
            Método DoE
          </span>
          <select
            className="input"
            value={method}
            onChange={e => setMethod(e.target.value as DoEMethod)}
            disabled={runState === 'running'}
            style={{ padding: '5px 8px', fontSize: 12 }}
          >
            <option value="latin_hypercube">Latin Hypercube</option>
            <option value="full_factorial">Full Factorial</option>
            <option value="central_composite">Central Composite</option>
          </select>
        </label>

        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
            Amostras: {sampleCount}
          </span>
          <input
            type="range"
            min={10}
            max={200}
            value={sampleCount}
            onChange={e => setSampleCount(parseInt(e.target.value, 10))}
            disabled={runState === 'running'}
            style={{ width: '100%' }}
          />
        </label>

        <button
          className="btn-primary"
          onClick={handleRun}
          disabled={runState === 'running'}
          style={{ padding: '7px 16px', fontSize: 12 }}
        >
          {runState === 'running' ? '...' : 'Gerar DoE'}
        </button>
      </div>

      {/* Error */}
      {runState === 'error' && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(220,53,69,0.12)',
          borderRadius: 6,
          border: '1px solid rgba(220,53,69,0.3)',
          fontSize: 13,
          color: 'var(--accent-danger)',
          marginBottom: 16,
        }}>
          {errorMsg}
        </div>
      )}

      {/* Results section */}
      {runState === 'done' && results.length > 0 && (
        <div>
          {/* Scatter plot */}
          <div className="card" style={{ padding: '12px 12px 8px', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Eixo X:</span>
              <select
                className="input"
                value={xAxis}
                onChange={e => setXAxis(e.target.value)}
                style={{ padding: '3px 6px', fontSize: 11 }}
              >
                {axisOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>Eixo Y:</span>
              <select
                className="input"
                value={yAxis}
                onChange={e => setYAxis(e.target.value)}
                style={{ padding: '3px 6px', fontSize: 11 }}
              >
                {axisOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <svg width={SVG_W} height={SVG_H} style={{ display: 'block' }}>
              {/* Axes */}
              <line
                x1={PAD.l} y1={PAD.t}
                x2={PAD.l} y2={PAD.t + ih}
                stroke="var(--border-primary)" strokeWidth={1}
              />
              <line
                x1={PAD.l} y1={PAD.t + ih}
                x2={PAD.l + iw} y2={PAD.t + ih}
                stroke="var(--border-primary)" strokeWidth={1}
              />
              {/* Labels */}
              <text
                x={10}
                y={PAD.t + ih / 2}
                fontSize={9}
                fill="var(--text-muted)"
                textAnchor="middle"
                transform={`rotate(-90, 10, ${PAD.t + ih / 2})`}
              >
                {yAxis}
              </text>
              <text
                x={PAD.l + iw / 2}
                y={SVG_H - 6}
                fontSize={9}
                fill="var(--text-muted)"
                textAnchor="middle"
              >
                {xAxis}
              </text>

              {/* Points */}
              {results.map((pt, i) => {
                const xv = getVal(pt, xAxis)
                const yv = getVal(pt, yAxis)
                const eta = pt.responses.efficiency ?? 0
                const { x, y } = toSvg(xv, yv)
                const isHov = hoveredIdx === i
                return (
                  <g
                    key={i}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{ cursor: 'crosshair' }}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={isHov ? 6 : 4}
                      fill={etaColor(eta)}
                      stroke={isHov ? '#fff' : 'none'}
                      strokeWidth={1.5}
                      opacity={0.85}
                    />
                    {isHov && (
                      <text x={x + 8} y={y - 4} fontSize={9} fill="var(--text-primary)">
                        {xAxis}={xv.toFixed(3)} {yAxis}={yv.toFixed(3)}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>

            {/* Color legend */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>Eficiência:</span>
              <div style={{
                width: 80,
                height: 8,
                borderRadius: 4,
                background: 'linear-gradient(to right, rgb(220,53,69), rgb(200,140,60), rgb(40,180,80))',
              }} />
              <span>baixa</span>
              <span style={{ marginLeft: 'auto' }}>alta</span>
            </div>
          </div>

          {/* Results table */}
          <div className="card" style={{ padding: '8px', marginBottom: 14, maxHeight: 260, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>#</th>
                  {Object.keys(results[0].variables).map(k => (
                    <th key={k} style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>{k}</th>
                  ))}
                  {Object.keys(results[0].responses).map(k => (
                    <th key={k} style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((pt, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: '1px solid var(--border-primary)',
                      background: hoveredIdx === i ? 'rgba(0,160,223,0.08)' : 'transparent',
                    }}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    <td style={{ padding: '3px 8px', color: 'var(--text-muted)' }}>{i + 1}</td>
                    {Object.values(pt.variables).map((v, j) => (
                      <td key={j} style={{ padding: '3px 8px', textAlign: 'right' }}>
                        {typeof v === 'number' ? v.toFixed(4) : String(v)}
                      </td>
                    ))}
                    {Object.values(pt.responses).map((v, j) => (
                      <td key={j} style={{ padding: '3px 8px', textAlign: 'right', color: 'var(--accent)' }}>
                        {typeof v === 'number' ? v.toFixed(4) : String(v ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-primary"
              onClick={exportCSV}
              style={{ padding: '7px 16px', fontSize: 12 }}
            >
              Exportar CSV
            </button>
            <button
              className="btn-primary"
              onClick={handleTrain}
              disabled={trainState === 'training'}
              style={{
                padding: '7px 16px',
                fontSize: 12,
                background: trainState === 'done' ? 'var(--accent-success, #28a745)' : undefined,
              }}
            >
              {trainState === 'training'
                ? 'Treinando...'
                : trainState === 'done'
                  ? 'Surrogate Treinado'
                  : 'Treinar Surrogate'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {runState === 'idle' && results.length === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 160,
          color: 'var(--text-muted)',
          fontSize: 13,
          border: '1px dashed var(--border-primary)',
          borderRadius: 8,
        }}>
          Defina as variáveis e clique em Gerar DoE
        </div>
      )}
    </div>
  )
}
