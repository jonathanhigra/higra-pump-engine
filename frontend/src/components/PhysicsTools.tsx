/**
 * PhysicsTools — calculadoras interativas para os endpoints /api/v1/physics/*
 *
 * #36 SlipFactorComparison — Wiesner vs Stodola vs Stanitz lado a lado
 * #37 AffinityLawsTool — calc Q/H/P scaled
 * #38 LossCorrelationsPanel — disk friction + vol η + mech η
 * #39 MultiDomainBuilder — UI rotor+voluta caso
 * #40 TransientConfigUI — BPF/Nyquist visual
 */
import React, { useState, useCallback } from 'react'

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-primary)',
  borderRadius: 8,
  padding: 16,
  background: 'var(--card-bg)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4,
}

// ===========================================================================
// #36 Slip Factor Comparison
// ===========================================================================

export function SlipFactorComparison() {
  const [nBlades, setNBlades] = useState(6)
  const [beta2, setBeta2] = useState(22)
  const [d1d2, setD1d2] = useState(0.5)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const compute = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/v1/physics/slip_factor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n_blades: nBlades, beta2_deg: beta2, d1_d2_ratio: d1d2 }),
      })
      setResult(await r.json())
    } finally { setLoading(false) }
  }, [nBlades, beta2, d1d2])

  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Slip Factor — 3 modelos</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>N pás</label>
          <input type="number" min="2" max="20" value={nBlades}
                 onChange={e => setNBlades(parseInt(e.target.value) || 6)}
                 className="input" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>β₂ (°)</label>
          <input type="number" min="5" max="89" value={beta2}
                 onChange={e => setBeta2(parseFloat(e.target.value) || 22)}
                 className="input" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>D₁/D₂</label>
          <input type="number" min="0.1" max="0.99" step="0.05" value={d1d2}
                 onChange={e => setD1d2(parseFloat(e.target.value) || 0.5)}
                 className="input" style={{ width: '100%' }} />
        </div>
      </div>
      <button className="btn-primary" onClick={compute} disabled={loading}
              style={{ fontSize: 12, padding: '6px 14px' }}>
        {loading ? 'Calculando…' : 'Calcular'}
      </button>

      {result && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {(['wiesner', 'stodola', 'stanitz'] as const).map(m => (
            <div key={m} style={{
              background: result.recommended === m ? 'rgba(34,197,94,0.1)' : 'var(--bg-secondary)',
              border: result.recommended === m ? '1px solid #22c55e' : '1px solid transparent',
              borderRadius: 6, padding: '8px 12px',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{m}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {result[m]?.toFixed(4)}
              </div>
              {result.recommended === m && (
                <div style={{ fontSize: 9, color: '#22c55e', marginTop: 2 }}>recomendado</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// #37 Affinity Laws Tool
// ===========================================================================

export function AffinityLawsTool() {
  const [Q, setQ] = useState(0.05)
  const [H, setH] = useState(30)
  const [P, setP] = useState(15000)
  const [eta, setEta] = useState(0.80)
  const [n0, setN0] = useState(1750)
  const [n1, setN1] = useState(2900)
  const [reCorr, setReCorr] = useState(true)
  const [result, setResult] = useState<any>(null)

  const compute = useCallback(async () => {
    const r = await fetch('/api/v1/physics/affinity_scaling', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Q_old: Q, H_old: H, P_old: P, eta_old: eta,
        n_old: n0, n_new: n1, apply_re_correction: reCorr,
      }),
    })
    setResult(await r.json())
  }, [Q, H, P, eta, n0, n1, reCorr])

  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Affinity Laws — Scaling</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { l: 'Q (m³/s)', v: Q, set: setQ, step: '0.001' },
          { l: 'H (m)', v: H, set: setH, step: '0.5' },
          { l: 'P (W)', v: P, set: setP, step: '100' },
          { l: 'η', v: eta, set: setEta, step: '0.01' },
          { l: 'n₀ (rpm)', v: n0, set: setN0, step: '50' },
          { l: 'n₁ (rpm)', v: n1, set: setN1, step: '50' },
        ].map(f => (
          <div key={f.l}>
            <label style={labelStyle}>{f.l}</label>
            <input type="number" value={f.v} step={f.step}
                   onChange={e => f.set(parseFloat(e.target.value) || 0)}
                   className="input" style={{ width: '100%', fontSize: 12 }} />
          </div>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 12 }}>
        <input type="checkbox" checked={reCorr} onChange={e => setReCorr(e.target.checked)} />
        Aplicar correção de Reynolds (Moody)
      </label>
      <button className="btn-primary" onClick={compute} style={{ fontSize: 12, padding: '6px 14px' }}>
        Aplicar Affinity Laws
      </button>

      {result && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <Metric label="Q novo" value={`${result.Q_new_m3s} m³/s`} />
          <Metric label="H novo" value={`${result.H_new_m} m`} />
          <Metric label="P novo" value={`${(result.P_new_W / 1000).toFixed(2)} kW`} />
          <Metric label="η novo" value={result.eta_new.toFixed(4)} />
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// #38 Loss Correlations Panel (disk friction + volumetric + mechanical)
// ===========================================================================

export function LossCorrelationsPanel() {
  const [d2, setD2] = useState(0.30)
  const [rpm, setRpm] = useState(1750)
  const [Q, setQ] = useState(0.05)
  const [H, setH] = useState(30)
  const [P, setP] = useState(15000)
  const [results, setResults] = useState<any>(null)

  const compute = useCallback(async () => {
    const [df, ve, me] = await Promise.all([
      fetch('/api/v1/physics/disk_friction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ d2, rpm }),
      }).then(r => r.json()),
      fetch('/api/v1/physics/volumetric_efficiency', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Q, H, d_seal: d2 * 0.5 }),
      }).then(r => r.json()),
      fetch('/api/v1/physics/mechanical_efficiency', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ P_hydraulic: P, rpm }),
      }).then(r => r.json()),
    ])
    setResults({ df, ve, me })
  }, [d2, rpm, Q, H, P])

  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
        Perdas paralelas — Disk friction + η_v + η_m
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { l: 'D₂ (m)', v: d2, set: setD2, step: '0.01' },
          { l: 'rpm', v: rpm, set: setRpm, step: '50' },
          { l: 'Q (m³/s)', v: Q, set: setQ, step: '0.001' },
          { l: 'H (m)', v: H, set: setH, step: '0.5' },
          { l: 'P (W)', v: P, set: setP, step: '100' },
        ].map(f => (
          <div key={f.l}>
            <label style={labelStyle}>{f.l}</label>
            <input type="number" value={f.v} step={f.step}
                   onChange={e => f.set(parseFloat(e.target.value) || 0)}
                   className="input" style={{ width: '100%', fontSize: 12 }} />
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={compute} style={{ fontSize: 12, padding: '6px 14px' }}>
        Calcular tudo
      </button>

      {results && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Disk friction (Daily-Nece)</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              {(results.df.power_loss_W / 1000).toFixed(2)} kW
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {results.df.regime} · Re={results.df.re_disk.toExponential(1)}
            </div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>η volumétrica</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              {(results.ve.eta_v * 100).toFixed(2)}%
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              vazamento {(results.ve.leakage_fraction * 100).toFixed(2)}%
            </div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>η mecânica</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              {(results.me.eta_m * 100).toFixed(2)}%
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              perda {(results.me.total_mech_loss_W / 1000).toFixed(2)} kW
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// #39 Multi-Domain Builder
// ===========================================================================

export function MultiDomainBuilder() {
  const [Q, setQ] = useState(0.05)
  const [H, setH] = useState(30)
  const [rpm, setRpm] = useState(1750)
  const [turbulence, setTurbulence] = useState('kOmegaSST')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const build = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/v1/cfd/advanced/multi_domain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_rate: Q, head: H, rpm, turbulence_model: turbulence }),
      })
      setResult(await r.json())
    } finally { setLoading(false) }
  }, [Q, H, rpm, turbulence])

  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
        Multi-Domain Builder (rotor + voluta cyclicAMI)
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Q (m³/s)</label>
          <input type="number" value={Q} step="0.001"
                 onChange={e => setQ(parseFloat(e.target.value) || 0)}
                 className="input" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>H (m)</label>
          <input type="number" value={H} step="0.5"
                 onChange={e => setH(parseFloat(e.target.value) || 0)}
                 className="input" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>rpm</label>
          <input type="number" value={rpm} step="50"
                 onChange={e => setRpm(parseInt(e.target.value) || 0)}
                 className="input" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>Turbulência</label>
          <select value={turbulence} onChange={e => setTurbulence(e.target.value)}
                  className="input" style={{ width: '100%' }}>
            <option value="kOmegaSST">k-ω SST</option>
            <option value="kEpsilon">k-ε</option>
            <option value="kOmegaSSTLM">k-ω SSTLM (γ-Reθ)</option>
          </select>
        </div>
      </div>
      <button className="btn-primary" onClick={build} disabled={loading}
              style={{ fontSize: 12, padding: '6px 14px' }}>
        {loading ? 'Construindo…' : 'Montar caso multi-domínio'}
      </button>

      {result && result.created && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-primary)' }}>
          ✓ Caso montado em <code>{result.case_dir}</code><br />
          Patches AMI: {Object.entries(result.interface_patches || {}).map(([k, v]) => `${k}↔${v}`).join(', ')}
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// #40 Transient Config UI
// ===========================================================================

export function TransientConfigUI() {
  const [Q, setQ] = useState(0.05)
  const [H, setH] = useState(30)
  const [rpm, setRpm] = useState(1750)
  const [endTime, setEndTime] = useState(0.2)
  const [writeInterval, setWriteInterval] = useState(0.002)
  const [result, setResult] = useState<any>(null)

  // Compute Nyquist visual
  const bladeCount = 6   // assumption
  const bpf = bladeCount * rpm / 60
  const fs = 1 / writeInterval
  const nyquistOk = fs > 2 * bpf
  const nRevs = endTime * rpm / 60

  const build = useCallback(async () => {
    const r = await fetch('/api/v1/cfd/advanced/transient', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flow_rate: Q, head: H, rpm,
        end_time: endTime, write_interval: writeInterval,
      }),
    })
    setResult(await r.json())
  }, [Q, H, rpm, endTime, writeInterval])

  return (
    <div style={cardStyle}>
      <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
        Transient Config — pimpleFoam Sliding Mesh
      </h4>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { l: 'Q (m³/s)', v: Q, set: setQ, step: '0.001' },
          { l: 'H (m)', v: H, set: setH, step: '0.5' },
          { l: 'rpm', v: rpm, set: setRpm, step: '50' },
          { l: 't_end (s)', v: endTime, set: setEndTime, step: '0.05' },
          { l: 'Δt write (s)', v: writeInterval, set: setWriteInterval, step: '0.0005' },
        ].map(f => (
          <div key={f.l}>
            <label style={labelStyle}>{f.l}</label>
            <input type="number" value={f.v} step={f.step}
                   onChange={e => f.set(parseFloat(e.target.value) || 0)}
                   className="input" style={{ width: '100%', fontSize: 12 }} />
          </div>
        ))}
      </div>

      {/* Nyquist visual */}
      <div style={{
        background: nyquistOk ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        border: `1px solid ${nyquistOk ? '#22c55e' : '#ef4444'}`,
        borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span>BPF: <b>{bpf.toFixed(1)} Hz</b></span>
          <span>fs (sampling): <b>{fs.toFixed(1)} Hz</b></span>
          <span>n revs: <b>{nRevs.toFixed(1)}</b></span>
        </div>
        <div style={{ color: nyquistOk ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
          {nyquistOk ? '✓ Nyquist OK (fs > 2·BPF)' : `✗ Nyquist VIOLADO — diminua Δt write para < ${(1 / (2 * bpf)).toFixed(5)} s`}
        </div>
      </div>

      <button className="btn-primary" onClick={build}
              style={{ fontSize: 12, padding: '6px 14px' }}>
        Montar caso transiente
      </button>

      {result && (
        <div style={{ marginTop: 12, fontSize: 12 }}>
          ✓ Caso transiente em <code>{result.case_dir}</code>
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// Helpers
// ===========================================================================

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', padding: 8, borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
