/**
 * OptimizationPresets — Quick-start preset buttons for common optimization goals.
 * Each preset pre-fills the optimization form and auto-starts the run.
 */
import React, { useState } from 'react'

interface Props {
  defaultFlowRate: number
  defaultHead: number
  defaultRpm: number
}

interface Preset {
  id: string
  label: string
  icon: string
  description: string
  params: {
    method: 'nsga2' | 'bayesian'
    pop_size: number
    n_gen: number
    objectives: Record<string, string>
    constraints?: Record<string, number>
  }
}

const PRESETS: Preset[] = [
  {
    id: 'max_efficiency',
    label: 'Máxima Eficiência',
    icon: '\u26A1',
    description: 'Maximizar rendimento hidráulico',
    params: {
      method: 'nsga2',
      pop_size: 20,
      n_gen: 30,
      objectives: { efficiency: 'maximize' },
    },
  },
  {
    id: 'min_npsh',
    label: 'Mínimo NPSHr',
    icon: '\uD83D\uDCA7',
    description: 'Minimizar NPSHr para evitar cavitação',
    params: {
      method: 'nsga2',
      pop_size: 20,
      n_gen: 30,
      objectives: { npsh_r: 'minimize' },
    },
  },
  {
    id: 'min_size',
    label: 'Menor Tamanho',
    icon: '\uD83D\uDCCF',
    description: 'Minimizar D2 com eta > 70%',
    params: {
      method: 'nsga2',
      pop_size: 20,
      n_gen: 30,
      objectives: { d2: 'minimize' },
      constraints: { eta_min: 0.70 },
    },
  },
]

export default function OptimizationPresets({ defaultFlowRate, defaultHead, defaultRpm }: Props) {
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePreset = async (preset: Preset) => {
    setRunning(preset.id)
    setError(null)
    try {
      const res = await fetch('/api/v1/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow_rate: defaultFlowRate / 3600,
          head: defaultHead,
          rpm: defaultRpm,
          method: preset.params.method,
          pop_size: preset.params.pop_size,
          n_gen: preset.params.n_gen,
          objectives: preset.params.objectives,
          constraints: preset.params.constraints || {},
          seed: 42,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (e: any) {
      setError(`Falha: ${e.message}`)
    } finally {
      setRunning(null)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 8, letterSpacing: '0.04em' }}>
        PRESETS DE OTIMIZACAO
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => handlePreset(preset)}
            disabled={running !== null}
            title={preset.description}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 20,
              border: '1px solid var(--border-primary)',
              background: running === preset.id ? 'rgba(0,160,223,0.15)' : 'var(--bg-surface)',
              color: running === preset.id ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: running !== null ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 500,
              transition: 'all 0.15s',
              opacity: running !== null && running !== preset.id ? 0.5 : 1,
            }}
          >
            <span style={{ fontSize: 14 }}>{preset.icon}</span>
            {running === preset.id ? 'Executando...' : preset.label}
          </button>
        ))}
      </div>
      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{error}</div>
      )}
    </div>
  )
}
