/**
 * OptimizePanel — Real-time multi-objective optimization via WebSocket (#25).
 *
 * Shows live progress (generation counter, eta_max, n_pareto) while NSGA-II
 * runs on the backend, then renders the Pareto front as a scatter plot
 * (η% vs NPSHr) when done.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

interface ParetoPoint {
  variables: Record<string, number>
  objectives: { efficiency?: number; npsh_r?: number }
  feasible?: boolean
}

interface ProgressMsg {
  type: 'started' | 'progress' | 'done' | 'error'
  gen?: number
  n_gen?: number
  n_pareto?: number
  eta_max?: number
  npsh_min?: number
  elapsed_s?: number
  total_evals?: number
  pareto_front?: ParetoPoint[]
  best_efficiency?: ParetoPoint | null
  best_npsh?: ParetoPoint | null
  n_evaluations?: number
  pop_size?: number
  message?: string
}

type RunState = 'idle' | 'running' | 'done' | 'error'

interface Props {
  defaultFlowRate?: number
  defaultHead?: number
  defaultRpm?: number
}

export default function OptimizePanel({ defaultFlowRate = 180, defaultHead = 30, defaultRpm = 1750 }: Props) {
  // Form state
  const [fQ, setFQ] = useState(String(defaultFlowRate))
  const [fH, setFH] = useState(String(defaultHead))
  const [fN, setFN] = useState(String(defaultRpm))
  const [method, setMethod] = useState<'nsga2' | 'bayesian'>('nsga2')
  const [popSize, setPopSize] = useState('20')
  const [nGen, setNGen] = useState('30')

  // Runtime state
  const [runState, setRunState] = useState<RunState>('idle')
  const [progress, setProgress] = useState<ProgressMsg | null>(null)
  const [totalGen, setTotalGen] = useState(30)
  const [paretoFront, setParetoFront] = useState<ParetoPoint[]>([])
  const [bestEff, setBestEff] = useState<ParetoPoint | null>(null)
  const [bestNpsh, setBestNpsh] = useState<ParetoPoint | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    setFQ(String(defaultFlowRate))
    setFH(String(defaultHead))
    setFN(String(defaultRpm))
  }, [defaultFlowRate, defaultHead, defaultRpm])

  const handleStop = useCallback(() => {
    wsRef.current?.close()
    setRunState('idle')
  }, [])

  const handleRun = useCallback(() => {
    const q = parseFloat(fQ)
    const h = parseFloat(fH)
    const n = parseFloat(fN)
    const ps = parseInt(popSize, 10)
    const ng = parseInt(nGen, 10)
    if (!q || !h || !n || isNaN(ps) || isNaN(ng)) return

    setRunState('running')
    setParetoFront([])
    setBestEff(null)
    setBestNpsh(null)
    setProgress(null)
    setErrorMsg('')
    setTotalGen(ng)

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.host
    const ws = new WebSocket(`${proto}://${host}/ws/optimize`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({
        flow_rate: q / 3600,
        head: h,
        rpm: n,
        method,
        pop_size: ps,
        n_gen: ng,
        seed: 42,
      }))
    }

    ws.onmessage = (evt) => {
      const msg: ProgressMsg = JSON.parse(evt.data)
      if (msg.type === 'progress') {
        setProgress(msg)
      } else if (msg.type === 'done') {
        setParetoFront(msg.pareto_front ?? [])
        setBestEff(msg.best_efficiency ?? null)
        setBestNpsh(msg.best_npsh ?? null)
        setElapsed(msg.elapsed_s ?? 0)
        setRunState('done')
      } else if (msg.type === 'error') {
        setErrorMsg(msg.message ?? 'Erro desconhecido')
        setRunState('error')
      }
    }

    ws.onerror = () => {
      setErrorMsg('Falha na conexão WebSocket')
      setRunState('error')
    }

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null
    }
  }, [fQ, fH, fN, method, popSize, nGen])

  // ── Pareto scatter dimensions ─────────────────────────────────────────────
  const SVG_W = 380, SVG_H = 220
  const PAD = { l: 48, r: 16, t: 16, b: 38 }
  const iw = SVG_W - PAD.l - PAD.r
  const ih = SVG_H - PAD.t - PAD.b

  const etaVals = paretoFront.map(p => (p.objectives.efficiency ?? 0) * 100)
  const npshVals = paretoFront.map(p => p.objectives.npsh_r ?? 0)
  const etaMin = Math.min(...etaVals, 0), etaMax = Math.max(...etaVals, 100)
  const npshMin = Math.min(...npshVals, 0), npshMax = Math.max(...npshVals, 10)

  const toSvg = (eta: number, npsh: number) => ({
    x: PAD.l + ((eta - etaMin) / (etaMax - etaMin || 1)) * iw,
    y: PAD.t + ih - ((npsh - npshMin) / (npshMax - npshMin || 1)) * ih,
  })

  return (
    <div style={{ marginBottom: 30 }}>
      <h3 style={{ color: 'var(--accent)', fontSize: 15, margin: '0 0 16px' }}>
        Otimização Multi-Objetivo
      </h3>

      {/* ── Form ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <FieldInput label="Vazão Q [m³/h]" value={fQ} onChange={setFQ} disabled={runState === 'running'} />
        <FieldInput label="Altura H [m]" value={fH} onChange={setFH} disabled={runState === 'running'} />
        <FieldInput label="Rotação [rpm]" value={fN} onChange={setFN} disabled={runState === 'running'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
        <label style={{ display: 'block' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Método</span>
          <select
            className="input"
            value={method}
            onChange={e => setMethod(e.target.value as 'nsga2' | 'bayesian')}
            disabled={runState === 'running'}
            style={{ padding: '5px 8px', fontSize: 12 }}
          >
            <option value="nsga2">NSGA-II (Pareto)</option>
            <option value="bayesian">Bayesiano</option>
          </select>
        </label>
        <FieldInput label="Tamanho pop." value={popSize} onChange={setPopSize} disabled={runState === 'running'} type="number" />
        <FieldInput label="Gerações" value={nGen} onChange={setNGen} disabled={runState === 'running'} type="number" />
        <div style={{ display: 'flex', gap: 8 }}>
          {runState === 'running' ? (
            <button className="btn-primary" onClick={handleStop} style={{ padding: '7px 16px', fontSize: 12, background: 'var(--accent-danger)' }}>
              ■ Parar
            </button>
          ) : (
            <button className="btn-primary" onClick={handleRun} style={{ padding: '7px 16px', fontSize: 12 }}>
              ▶ Otimizar
            </button>
          )}
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {runState === 'running' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>
              Geração {progress?.gen ?? 0} / {totalGen}
              {progress?.n_pareto != null && <span style={{ marginLeft: 10 }}>· {progress.n_pareto} soluções Pareto</span>}
              {progress?.eta_max != null && <span style={{ marginLeft: 10 }}>· η_max = {(progress.eta_max * 100).toFixed(1)}%</span>}
            </span>
            <span>{progress?.elapsed_s?.toFixed(1) ?? '0.0'} s</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 3,
                background: 'var(--accent)',
                width: `${((progress?.gen ?? 0) / totalGen) * 100}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {runState === 'error' && (
        <div style={{ padding: '10px 14px', background: 'rgba(220,53,69,0.12)', borderRadius: 6, border: '1px solid rgba(220,53,69,0.3)', fontSize: 13, color: 'var(--accent-danger)', marginBottom: 16 }}>
          ⚠ {errorMsg}
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {runState === 'done' && paretoFront.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>

          {/* Pareto scatter */}
          <div className="card" style={{ padding: '12px 12px 8px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Frente de Pareto — η × NPSHr ({paretoFront.length} soluções, {elapsed.toFixed(1)} s)
            </div>
            <svg width={SVG_W} height={SVG_H} style={{ display: 'block' }}>
              {/* Axes */}
              <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} stroke="var(--border-primary)" strokeWidth={1} />
              <line x1={PAD.l} y1={PAD.t + ih} x2={PAD.l + iw} y2={PAD.t + ih} stroke="var(--border-primary)" strokeWidth={1} />
              {/* Y label */}
              <text x={10} y={PAD.t + ih / 2} fontSize={9} fill="var(--text-muted)" textAnchor="middle"
                transform={`rotate(-90, 10, ${PAD.t + ih / 2})`}>NPSHr (m)</text>
              {/* X label */}
              <text x={PAD.l + iw / 2} y={SVG_H - 6} fontSize={9} fill="var(--text-muted)" textAnchor="middle">η (%)</text>
              {/* Points */}
              {paretoFront.map((pt, i) => {
                const eta = (pt.objectives.efficiency ?? 0) * 100
                const npsh = pt.objectives.npsh_r ?? 0
                const { x, y } = toSvg(eta, npsh)
                const isBestE = bestEff?.objectives.efficiency === pt.objectives.efficiency
                const isBestN = bestNpsh?.objectives.npsh_r === pt.objectives.npsh_r
                const isHov = hoveredIdx === i
                return (
                  <g key={i}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{ cursor: 'crosshair' }}
                  >
                    <circle
                      cx={x} cy={y} r={isBestE || isBestN ? 7 : (isHov ? 6 : 4)}
                      fill={isBestE ? 'var(--accent)' : isBestN ? '#7B1FA2' : 'rgba(0,160,223,0.55)'}
                      stroke={isHov ? '#fff' : 'none'}
                      strokeWidth={1.5}
                    />
                    {isHov && (
                      <text x={x + 8} y={y - 4} fontSize={9} fill="var(--text-primary)">
                        η={eta.toFixed(1)}% NPSHr={npsh.toFixed(2)}m
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
            <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                Melhor η
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7B1FA2', display: 'inline-block' }} />
                Menor NPSHr
              </span>
            </div>
          </div>

          {/* Best designs summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bestEff && (
              <div className="card" style={{ padding: '10px 14px', minWidth: 180 }}>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>
                  ★ Melhor Eficiência
                </div>
                <KV label="η" value={`${((bestEff.objectives.efficiency ?? 0) * 100).toFixed(1)}%`} />
                <KV label="NPSHr" value={`${(bestEff.objectives.npsh_r ?? 0).toFixed(2)} m`} />
                {Object.entries(bestEff.variables).slice(0, 4).map(([k, v]) => (
                  <KV key={k} label={k} value={typeof v === 'number' ? v.toFixed(3) : String(v)} />
                ))}
              </div>
            )}
            {bestNpsh && (
              <div className="card" style={{ padding: '10px 14px', minWidth: 180 }}>
                <div style={{ fontSize: 11, color: '#7B1FA2', fontWeight: 600, marginBottom: 6 }}>
                  ★ Menor NPSHr
                </div>
                <KV label="η" value={`${((bestNpsh.objectives.efficiency ?? 0) * 100).toFixed(1)}%`} />
                <KV label="NPSHr" value={`${(bestNpsh.objectives.npsh_r ?? 0).toFixed(2)} m`} />
                {Object.entries(bestNpsh.variables).slice(0, 4).map(([k, v]) => (
                  <KV key={k} label={k} value={typeof v === 'number' ? v.toFixed(3) : String(v)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {runState === 'idle' && paretoFront.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border-primary)', borderRadius: 8 }}>
          Configure os parâmetros e clique em Otimizar
        </div>
      )}
    </div>
  )
}

function FieldInput({ label, value, onChange, disabled, type = 'number' }:
  { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; type?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{label}</span>
      <input
        className="input"
        type={type}
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
