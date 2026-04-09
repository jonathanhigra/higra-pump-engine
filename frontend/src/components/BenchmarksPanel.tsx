/**
 * BenchmarksPanel — validação do HPE contra benchmarks experimentais.
 *
 * Lista benchmarks disponíveis (SHF, ERCOFTAC TC6, TUD radial) e executa
 * validação via POST /api/v1/cfd/advanced/benchmarks/run mostrando
 * MAPE de head/η por caso + status PASS/FAIL.
 */
import React, { useState, useEffect, useCallback } from 'react'

interface Benchmark {
  name: string
  type: string
  description: string
  reference: string
  rpm: number
  D2_m: number
  b2_m: number
  n_blades: number
  n_points: number
  bep?: { Q_m3s: number; H_m: number; eta: number; P_W: number }
}

interface ValidationResult {
  benchmark: string
  n_points: number
  mape_head_pct: number
  mape_efficiency_pct: number
  mape_power_pct: number
  passed: boolean
  tolerance_head_pct: number
  tolerance_efficiency_pct: number
}

type PanelState = 'idle' | 'loading' | 'running' | 'completed' | 'failed'

export default function BenchmarksPanel() {
  const [panelState, setPanelState] = useState<PanelState>('loading')
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([])
  const [results, setResults] = useState<ValidationResult[]>([])
  const [error, setError] = useState<string | null>(null)

  // Load benchmarks list on mount
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch('/api/v1/cfd/advanced/benchmarks')
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.json()
        setBenchmarks(data.benchmarks || [])
        setPanelState('idle')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro')
        setPanelState('failed')
      }
    })()
  }, [])

  const handleRun = useCallback(async () => {
    setPanelState('running')
    setError(null)
    try {
      const resp = await fetch('/api/v1/cfd/advanced/benchmarks/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'meanline' }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`)
      const data = await resp.json()
      setResults(data.results || [])
      setPanelState('completed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao validar')
      setPanelState('failed')
    }
  }, [])

  const allPassed = results.length > 0 && results.every(r => r.passed)
  const nPassed = results.filter(r => r.passed).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header card */}
      <div style={cardStyle}>
        <h4 style={headingStyle}>Benchmarks de Validação</h4>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Compara predições HPE (meanline) contra dados experimentais publicados.
          Tolerâncias: MAPE H &lt; 8%, MAPE η &lt; 6%.
        </p>

        {panelState === 'loading' && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carregando benchmarks…</div>
        )}

        {panelState !== 'loading' && benchmarks.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            {benchmarks.map(b => (
              <div key={b.name} style={{
                background: 'var(--bg-secondary)', borderRadius: 6, padding: '10px 12px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                  {b.name.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {b.description}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  n={b.rpm} rpm · D₂={(b.D2_m * 1000).toFixed(0)} mm · Z={b.n_blades} · {b.n_points} pts
                </div>
              </div>
            ))}
          </div>
        )}

        {(panelState === 'idle' || panelState === 'completed' || panelState === 'failed') && (
          <button
            className="btn-primary"
            onClick={handleRun}
            disabled={benchmarks.length === 0}
            style={{ fontSize: 13, padding: '8px 20px' }}
          >
            {panelState === 'completed' ? 'Rodar novamente' : 'Validar contra todos'}
          </button>
        )}

        {panelState === 'running' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Validando {benchmarks.length} benchmarks…
            </span>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>{error}</div>
        )}
      </div>

      {/* Results */}
      {panelState === 'completed' && results.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: allPassed ? '#22c55e' : '#f59e0b',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700,
            }}>
              {allPassed ? '✓' : '!'}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {nPassed} / {results.length} passaram
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Validação HPE vs experimental
              </div>
            </div>
          </div>

          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                {['Benchmark', 'N pts', 'MAPE H (%)', 'MAPE η (%)', 'MAPE P (%)', 'Status'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left',
                                       color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--text-primary)' }}>
                    {r.benchmark.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '6px 8px' }}>{r.n_points}</td>
                  <td style={{ padding: '6px 8px',
                               color: r.mape_head_pct <= r.tolerance_head_pct ? '#22c55e' : '#ef4444' }}>
                    {r.mape_head_pct.toFixed(2)}
                  </td>
                  <td style={{ padding: '6px 8px',
                               color: r.mape_efficiency_pct <= r.tolerance_efficiency_pct ? '#22c55e' : '#ef4444' }}>
                    {r.mape_efficiency_pct.toFixed(2)}
                  </td>
                  <td style={{ padding: '6px 8px' }}>{r.mape_power_pct.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px',
                               color: r.passed ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                    {r.passed ? 'PASS' : 'FAIL'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14,
      border: '2px solid var(--border-primary)',
      borderTop: '2px solid var(--accent)',
      borderRadius: '50%',
      animation: 'bm-spin 0.8s linear infinite',
      flexShrink: 0,
    }}>
      <style>{`@keyframes bm-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

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
