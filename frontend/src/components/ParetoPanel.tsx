/**
 * ParetoPanel -- Pareto frontier visualization with configurable X/Y objectives,
 * NSGA-II execution, scatter plot, results table, and design selection.
 */
import React, { useCallback, useState } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

interface ParetoDesign {
  variables: Record<string, number>
  objectives: Record<string, number>
  feasible?: boolean
}

type ObjectiveKey = 'efficiency' | 'npsh_r' | 'power' | 'd2'

const OBJECTIVE_LABELS: Record<ObjectiveKey, string> = {
  efficiency: 'Eficiência \u03b7',
  npsh_r: 'NPSHr',
  power: 'Potência',
  d2: 'D2',
}

const OBJECTIVE_UNITS: Record<ObjectiveKey, string> = {
  efficiency: '%',
  npsh_r: 'm',
  power: 'kW',
  d2: 'mm',
}

interface Props {
  defaultFlowRate?: number
  defaultHead?: number
  defaultRpm?: number
  onApplyDesign?: (design: ParetoDesign) => void
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getObjValue(design: ParetoDesign, key: ObjectiveKey): number {
  const raw = design.objectives[key] ?? design.variables[key] ?? 0
  if (key === 'efficiency') return raw * 100
  if (key === 'power') return raw / 1000
  if (key === 'd2') return raw * 1000
  return raw
}

function formatObj(val: number, key: ObjectiveKey): string {
  if (key === 'efficiency') return val.toFixed(1)
  if (key === 'npsh_r') return val.toFixed(2)
  if (key === 'power') return val.toFixed(2)
  if (key === 'd2') return val.toFixed(1)
  return val.toFixed(3)
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ParetoPanel({
  defaultFlowRate = 180,
  defaultHead = 30,
  defaultRpm = 1750,
  onApplyDesign,
}: Props) {
  // Form inputs
  const [fQ, setFQ] = useState(String(defaultFlowRate))
  const [fH, setFH] = useState(String(defaultHead))
  const [fN, setFN] = useState(String(defaultRpm))
  const [popSize, setPopSize] = useState(50)
  const [nGen, setNGen] = useState(30)
  const [xAxis, setXAxis] = useState<ObjectiveKey>('efficiency')
  const [yAxis, setYAxis] = useState<ObjectiveKey>('npsh_r')

  // Runtime state
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [designs, setDesigns] = useState<ParetoDesign[]>([])
  const [paretoIdxs, setParetoIdxs] = useState<Set<number>>(new Set())
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [sortCol, setSortCol] = useState<ObjectiveKey | 'rank'>('rank')
  const [sortAsc, setSortAsc] = useState(true)

  // ── SVG dimensions ──────────────────────────────────────────────────────
  const SVG_W = 480, SVG_H = 360
  const PAD = { l: 54, r: 20, t: 20, b: 42 }
  const iw = SVG_W - PAD.l - PAD.r
  const ih = SVG_H - PAD.t - PAD.b

  // ── Run optimization ────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    const q = parseFloat(fQ)
    const h = parseFloat(fH)
    const n = parseFloat(fN)
    if (!q || !h || !n) return

    setRunning(true)
    setError('')
    setDesigns([])
    setParetoIdxs(new Set())
    setSelectedIdx(null)

    try {
      const res = await fetch('/api/v1/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow_rate: q / 3600,
          head: h,
          rpm: n,
          method: 'nsga2',
          pop_size: popSize,
          n_gen: nGen,
          seed: 42,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const front: ParetoDesign[] = data.pareto_front ?? []
      setDesigns(front)
      // Identify Pareto-optimal designs (non-dominated on x/y axes)
      const idxs = identifyParetoFront(front, xAxis, yAxis)
      setParetoIdxs(idxs)
    } catch (e: any) {
      setError(e.message ?? 'Erro desconhecido')
    } finally {
      setRunning(false)
    }
  }, [fQ, fH, fN, popSize, nGen, xAxis, yAxis])

  // ── Pareto identification ───────────────────────────────────────────────
  function identifyParetoFront(ds: ParetoDesign[], kx: ObjectiveKey, ky: ObjectiveKey): Set<number> {
    // Simple non-dominated sort on two objectives (maximize both for Pareto display)
    const idxs = new Set<number>()
    for (let i = 0; i < ds.length; i++) {
      let dominated = false
      for (let j = 0; j < ds.length; j++) {
        if (i === j) continue
        const xi = getObjValue(ds[i], kx), xj = getObjValue(ds[j], kx)
        const yi = getObjValue(ds[i], ky), yj = getObjValue(ds[j], ky)
        // j dominates i if j is >= on both and > on at least one
        if (xj >= xi && yj >= yi && (xj > xi || yj > yi)) {
          dominated = true
          break
        }
      }
      if (!dominated) idxs.add(i)
    }
    return idxs
  }

  // ── Scatter plot mapping ────────────────────────────────────────────────
  const xVals = designs.map(d => getObjValue(d, xAxis))
  const yVals = designs.map(d => getObjValue(d, yAxis))
  const xMin = Math.min(...xVals, 0), xMax = Math.max(...xVals, 1)
  const yMin = Math.min(...yVals, 0), yMax = Math.max(...yVals, 1)
  const toSvg = (x: number, y: number) => ({
    sx: PAD.l + ((x - xMin) / (xMax - xMin || 1)) * iw,
    sy: PAD.t + ih - ((y - yMin) / (yMax - yMin || 1)) * ih,
  })

  // ── Sorted table data ──────────────────────────────────────────────────
  const sortedIndices = designs.map((_, i) => i).sort((a, b) => {
    let va: number, vb: number
    if (sortCol === 'rank') {
      va = paretoIdxs.has(a) ? 0 : 1
      vb = paretoIdxs.has(b) ? 0 : 1
    } else {
      va = getObjValue(designs[a], sortCol)
      vb = getObjValue(designs[b], sortCol)
    }
    return sortAsc ? va - vb : vb - va
  })

  const handleSort = (col: ObjectiveKey | 'rank') => {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  // ── Selected design detail ─────────────────────────────────────────────
  const sel = selectedIdx !== null ? designs[selectedIdx] : null

  return (
    <div style={{ marginBottom: 30 }}>
      <h3 style={{ color: 'var(--accent)', fontSize: 15, margin: '0 0 16px' }}>
        Fronteira de Pareto
      </h3>

      {/* Axis selectors + sliders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <FieldInput label="Vazão Q [m\u00b3/h]" value={fQ} onChange={setFQ} disabled={running} />
        <FieldInput label="Altura H [m]" value={fH} onChange={setFH} disabled={running} />
        <FieldInput label="Rotação [rpm]" value={fN} onChange={setFN} disabled={running} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Eixo X</span>
          <select className="input" value={xAxis} onChange={e => setXAxis(e.target.value as ObjectiveKey)}
            disabled={running} style={{ padding: '5px 8px', fontSize: 12 }}>
            {Object.entries(OBJECTIVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Eixo Y</span>
          <select className="input" value={yAxis} onChange={e => setYAxis(e.target.value as ObjectiveKey)}
            disabled={running} style={{ padding: '5px 8px', fontSize: 12 }}>
            {Object.entries(OBJECTIVE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
            População: {popSize}
          </span>
          <input type="range" min={20} max={200} step={10} value={popSize}
            onChange={e => setPopSize(+e.target.value)} disabled={running}
            style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </label>
        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
            Gerações: {nGen}
          </span>
          <input type="range" min={10} max={100} step={5} value={nGen}
            onChange={e => setNGen(+e.target.value)} disabled={running}
            style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </label>
        <button className="btn-primary" onClick={handleRun} disabled={running}
          style={{ padding: '7px 16px', fontSize: 12, whiteSpace: 'nowrap' }}>
          {running ? '...' : 'Executar NSGA-II'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(220,53,69,0.12)', borderRadius: 6, border: '1px solid rgba(220,53,69,0.3)', fontSize: 13, color: 'var(--accent-danger)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Scatter plot + detail panel */}
      {designs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start', marginBottom: 16 }}>
          <div className="card" style={{ padding: '12px 12px 8px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              {OBJECTIVE_LABELS[xAxis]} vs {OBJECTIVE_LABELS[yAxis]} -- {designs.length} projetos
            </div>
            <svg width={SVG_W} height={SVG_H} style={{ display: 'block' }}>
              {/* Axes */}
              <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} stroke="var(--border-primary)" strokeWidth={1} />
              <line x1={PAD.l} y1={PAD.t + ih} x2={PAD.l + iw} y2={PAD.t + ih} stroke="var(--border-primary)" strokeWidth={1} />
              {/* Y label */}
              <text x={12} y={PAD.t + ih / 2} fontSize={9} fill="var(--text-muted)" textAnchor="middle"
                transform={`rotate(-90, 12, ${PAD.t + ih / 2})`}>
                {OBJECTIVE_LABELS[yAxis]} ({OBJECTIVE_UNITS[yAxis]})
              </text>
              {/* X label */}
              <text x={PAD.l + iw / 2} y={SVG_H - 8} fontSize={9} fill="var(--text-muted)" textAnchor="middle">
                {OBJECTIVE_LABELS[xAxis]} ({OBJECTIVE_UNITS[xAxis]})
              </text>
              {/* Points */}
              {designs.map((d, i) => {
                const xv = getObjValue(d, xAxis)
                const yv = getObjValue(d, yAxis)
                const { sx, sy } = toSvg(xv, yv)
                const isPareto = paretoIdxs.has(i)
                const isSel = selectedIdx === i
                return (
                  <g key={i} onClick={() => setSelectedIdx(i)} style={{ cursor: 'pointer' }}>
                    <circle
                      cx={sx} cy={sy}
                      r={isSel ? 8 : isPareto ? 6 : 3.5}
                      fill={isSel ? '#00e5ff' : isPareto ? '#ff9800' : 'rgba(150,150,150,0.45)'}
                      stroke={isSel ? '#fff' : 'none'}
                      strokeWidth={1.5}
                    />
                  </g>
                )
              })}
            </svg>
            <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff9800', display: 'inline-block' }} />
                Pareto
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00e5ff', display: 'inline-block' }} />
                Selecionado
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(150,150,150,0.45)', display: 'inline-block' }} />
                Outros
              </span>
            </div>
          </div>

          {/* Side panel: selected design details */}
          {sel && (
            <div className="card" style={{ padding: '10px 14px', minWidth: 200 }}>
              <div style={{ fontSize: 11, color: '#00e5ff', fontWeight: 600, marginBottom: 8 }}>
                Projeto #{(selectedIdx ?? 0) + 1} {paretoIdxs.has(selectedIdx ?? -1) ? '(Pareto)' : ''}
              </div>
              <KV label={`\u03b7`} value={`${(getObjValue(sel, 'efficiency')).toFixed(1)}%`} />
              <KV label="NPSHr" value={`${(getObjValue(sel, 'npsh_r')).toFixed(2)} m`} />
              <KV label="Potência" value={`${(getObjValue(sel, 'power')).toFixed(2)} kW`} />
              <KV label="D2" value={`${(getObjValue(sel, 'd2')).toFixed(1)} mm`} />
              <KV label="Nq" value={`${(sel.objectives.nq ?? sel.variables.nq ?? 0).toFixed(1)}`} />
              {onApplyDesign && (
                <button className="btn-primary" onClick={() => onApplyDesign(sel)}
                  style={{ width: '100%', padding: '6px', fontSize: 11, marginTop: 10 }}>
                  Aplicar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Results table */}
      {designs.length > 0 && (
        <div className="card" style={{ padding: '10px 14px', maxHeight: 260, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <ThSort col="rank" label="Rank" sortCol={sortCol} sortAsc={sortAsc} onSort={handleSort} />
                <ThSort col="efficiency" label="\u03b7 (%)" sortCol={sortCol} sortAsc={sortAsc} onSort={handleSort} />
                <ThSort col="npsh_r" label="NPSHr (m)" sortCol={sortCol} sortAsc={sortAsc} onSort={handleSort} />
                <ThSort col="power" label="Potência (kW)" sortCol={sortCol} sortAsc={sortAsc} onSort={handleSort} />
                <ThSort col="d2" label="D2 (mm)" sortCol={sortCol} sortAsc={sortAsc} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedIndices.map(i => {
                const d = designs[i]
                const isPareto = paretoIdxs.has(i)
                const isSel = selectedIdx === i
                return (
                  <tr key={i} onClick={() => setSelectedIdx(i)}
                    style={{
                      cursor: 'pointer',
                      background: isSel ? 'rgba(0,229,255,0.1)' : isPareto ? 'rgba(255,152,0,0.08)' : 'transparent',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}>
                    <td style={{ padding: '4px 8px', color: isPareto ? '#ff9800' : 'var(--text-muted)', fontWeight: isPareto ? 600 : 400 }}>
                      {isPareto ? 'P' : '-'}
                    </td>
                    <td style={{ padding: '4px 8px', color: 'var(--text-primary)' }}>{formatObj(getObjValue(d, 'efficiency'), 'efficiency')}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--text-primary)' }}>{formatObj(getObjValue(d, 'npsh_r'), 'npsh_r')}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--text-primary)' }}>{formatObj(getObjValue(d, 'power'), 'power')}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--text-primary)' }}>{formatObj(getObjValue(d, 'd2'), 'd2')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {designs.length === 0 && !running && !error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Configure os parâmetros e clique em Executar NSGA-II
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

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

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function ThSort({ col, label, sortCol, sortAsc, onSort }: {
  col: ObjectiveKey | 'rank'; label: string;
  sortCol: string; sortAsc: boolean;
  onSort: (c: ObjectiveKey | 'rank') => void
}) {
  const active = sortCol === col
  return (
    <th onClick={() => onSort(col)} style={{
      padding: '6px 8px', textAlign: 'left', cursor: 'pointer',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      fontWeight: active ? 600 : 400, fontSize: 10, whiteSpace: 'nowrap',
      userSelect: 'none',
    }}>
      {label} {active ? (sortAsc ? '\u25b2' : '\u25bc') : ''}
    </th>
  )
}
