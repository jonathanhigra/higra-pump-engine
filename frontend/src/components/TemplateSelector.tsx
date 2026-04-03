import React, { useState, useMemo } from 'react'

// ── Template data ────────────────────────────────────────────────────────────

interface Template {
  key: string
  name: string
  description: string
  machine_type: string
  fluid: string
  flow_rate_m3h: number
  head_m: number
  rpm: number
  expected_nq: number
  expected_eta: number
  expected_z?: number
  n_stages?: number
}

const TEMPLATES: Template[] = [
  {
    key: 'centrifugal_pump_low_nq',
    name: 'Bomba Centrífuga Baixo Nq (Nq=18)',
    description: 'Bomba de alta pressão, baixa vazão — típica de água de alimentação de caldeira',
    flow_rate_m3h: 50, head_m: 80, rpm: 3550,
    machine_type: 'centrifugal_pump', fluid: 'water',
    expected_nq: 18, expected_eta: 0.78, expected_z: 7,
  },
  {
    key: 'centrifugal_pump_medium_nq',
    name: 'Bomba Centrífuga Médio Nq (Nq=30)',
    description: 'Bomba industrial padrão — água de processo',
    flow_rate_m3h: 100, head_m: 32, rpm: 1750,
    machine_type: 'centrifugal_pump', fluid: 'water',
    expected_nq: 30, expected_eta: 0.82, expected_z: 6,
  },
  {
    key: 'centrifugal_pump_high_nq',
    name: 'Bomba Centrífuga Alto Nq (Nq=80)',
    description: 'Bomba de grande vazão — irrigação, drenagem',
    flow_rate_m3h: 1000, head_m: 20, rpm: 1750,
    machine_type: 'centrifugal_pump', fluid: 'water',
    expected_nq: 80, expected_eta: 0.87, expected_z: 5,
  },
  {
    key: 'mixed_flow_pump',
    name: 'Bomba Mixed-Flow (Nq=120)',
    description: 'Bomba mista — estação elevatória de esgoto',
    flow_rate_m3h: 3000, head_m: 12, rpm: 980,
    machine_type: 'centrifugal_pump', fluid: 'water',
    expected_nq: 120, expected_eta: 0.88, expected_z: 4,
  },
  {
    key: 'francis_turbine_medium',
    name: 'Turbina Francis Média Queda',
    description: 'Turbina Francis PCH — queda 50m, 2MW',
    flow_rate_m3h: 5000, head_m: 50, rpm: 600,
    machine_type: 'francis_turbine', fluid: 'water',
    expected_nq: 65, expected_eta: 0.91, expected_z: 13,
  },
  {
    key: 'francis_turbine_high_head',
    name: 'Turbina Francis Alta Queda',
    description: 'Turbina Francis grande porte — queda 200m',
    flow_rate_m3h: 20000, head_m: 200, rpm: 375,
    machine_type: 'francis_turbine', fluid: 'water',
    expected_nq: 40, expected_eta: 0.93, expected_z: 15,
  },
  {
    key: 'radial_turbine_orc',
    name: 'Turbina Radial ORC (R134a)',
    description: 'Turbina radial para ciclo ORC — recuperação de calor',
    flow_rate_m3h: 10, head_m: 25, rpm: 12000,
    machine_type: 'radial_turbine', fluid: 'R134A',
    expected_nq: 45, expected_eta: 0.82, expected_z: 12,
  },
  {
    key: 'axial_fan_industrial',
    name: 'Ventilador Axial Industrial',
    description: 'Ventilador de exaustão — fábrica, AVAC',
    flow_rate_m3h: 50000, head_m: 0.15, rpm: 1450,
    machine_type: 'axial_fan', fluid: 'air',
    expected_nq: 200, expected_eta: 0.78, expected_z: 8,
  },
  {
    key: 'centrifugal_compressor',
    name: 'Compressor Centrífugo (Ar)',
    description: 'Compressor de ar industrial — pressão 3:1',
    flow_rate_m3h: 5000, head_m: 8000, rpm: 15000,
    machine_type: 'centrifugal_pump', fluid: 'air',
    expected_nq: 25, expected_eta: 0.80, expected_z: 17,
  },
  {
    key: 'sirocco_fan_hvac',
    name: 'Ventilador Sirocco AVAC',
    description: 'Ventilador FC para ar condicionado',
    flow_rate_m3h: 3000, head_m: 0.05, rpm: 800,
    machine_type: 'sirocco_fan', fluid: 'air',
    expected_nq: 300, expected_eta: 0.55, expected_z: 36,
  },
  {
    key: 'multistage_boiler_feed',
    name: 'Bomba Multistágio Alimentação Caldeira',
    description: '5 estágios, alta pressão — 200 bar',
    flow_rate_m3h: 80, head_m: 500, rpm: 3550,
    machine_type: 'centrifugal_pump', fluid: 'water',
    expected_nq: 22, expected_eta: 0.75, n_stages: 5,
  },
  {
    key: 'pump_turbine_reversible',
    name: 'Pump-Turbine Reversível',
    description: 'Armazenamento por bombeamento — ciclo pump/turbine',
    flow_rate_m3h: 15000, head_m: 300, rpm: 428,
    machine_type: 'francis_turbine', fluid: 'water',
    expected_nq: 35, expected_eta: 0.90, expected_z: 7,
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

type MachineCategory = 'pump' | 'turbine' | 'fan' | 'compressor'

function getCategory(t: Template): MachineCategory {
  const mt = t.machine_type
  if (mt.includes('turbine')) return 'turbine'
  if (mt.includes('fan') || mt === 'sirocco_fan') return 'fan'
  if (t.fluid === 'air' && mt === 'centrifugal_pump') return 'compressor'
  return 'pump'
}

const CATEGORY_COLORS: Record<MachineCategory, string> = {
  pump: '#3b82f6',       // blue
  turbine: '#22c55e',    // green
  fan: '#a855f7',        // purple
  compressor: '#f97316', // orange
}

const CATEGORY_ICON_PATHS: Record<MachineCategory, string> = {
  pump: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',       // clock/pump
  turbine: 'M13 10V3L4 14h7v7l9-11h-7z',          // lightning
  fan: 'M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1011 16H22m-8-6a2 2 0 012-2h8m-12 4a2 2 0 00-2 2H2',        // wind
  compressor: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', // hexagon
}

const CATEGORY_LABELS: Record<MachineCategory, string> = {
  pump: 'Bomba',
  turbine: 'Turbina',
  fan: 'Ventilador',
  compressor: 'Compressor',
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  onSelect: (params: { flow_rate: number; head: number; rpm: number; machine_type: string }) => void
  loading?: boolean
}

export default function TemplateSelector({ onSelect, loading }: Props) {
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return TEMPLATES
    const q = search.toLowerCase()
    return TEMPLATES.filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.machine_type.toLowerCase().includes(q) ||
        t.fluid.toLowerCase().includes(q) ||
        CATEGORY_LABELS[getCategory(t)].toLowerCase().includes(q)
    )
  }, [search])

  const handleClick = (t: Template) => {
    setSelectedKey(t.key)
    onSelect({
      flow_rate: t.flow_rate_m3h,  // m³/h — handleRunSizing converts internally
      head: t.head_m,
      rpm: t.rpm,
      machine_type: t.machine_type,
    })
  }

  return (
    <div style={{
      background: 'var(--bg-card, #1e1e2e)',
      borderRadius: 8,
      padding: 16,
      border: '1px solid var(--border-primary, #333)',
    }}>
      <h3 style={{
        color: 'var(--accent, #60a5fa)',
        margin: '0 0 12px',
        fontSize: 14,
        fontWeight: 600,
      }}>
        Exemplos de Projeto
      </h3>

      {/* Search / filter bar */}
      <input
        type="text"
        placeholder="Filtrar templates..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 12px',
          marginBottom: 12,
          background: 'var(--bg-surface, #2a2a3e)',
          border: '1px solid var(--border-primary, #444)',
          borderRadius: 6,
          color: 'var(--text-primary, #e0e0e0)',
          fontSize: 13,
          outline: 'none',
        }}
      />

      {/* Template grid — 3 columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}>
        {filtered.map(t => {
          const cat = getCategory(t)
          const color = CATEGORY_COLORS[cat]
          const iconPath = CATEGORY_ICON_PATHS[cat]
          const isSelected = selectedKey === t.key

          return (
            <button
              key={t.key}
              onClick={() => handleClick(t)}
              style={{
                background: isSelected
                  ? color
                  : 'var(--bg-surface, #2a2a3e)',
                border: `1px solid ${isSelected ? color : 'var(--border-primary, #444)'}`,
                borderRadius: 6,
                padding: '10px 8px',
                cursor: 'pointer',
                color: isSelected ? '#fff' : 'var(--text-primary, #e0e0e0)',
                textAlign: 'left',
                transition: 'all 0.15s',
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={iconPath} />
                </svg>
              </div>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.3,
                marginBottom: 4,
              }}>
                {t.name}
              </div>
              <div style={{
                fontSize: 10,
                color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-muted, #888)',
                lineHeight: 1.3,
                marginBottom: 6,
              }}>
                {t.description}
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: isSelected ? 'rgba(255,255,255,0.9)' : 'var(--text-secondary, #aaa)',
              }}>
                <span>Nq {t.expected_nq}</span>
                <span>{'\u03B7'} {(t.expected_eta * 100).toFixed(0)}%</span>
              </div>
              <div style={{
                fontSize: 9,
                color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-muted, #666)',
                marginTop: 2,
              }}>
                {t.flow_rate_m3h} m{'\u00B3'}/h | {t.head_m} m | {t.rpm} rpm
              </div>
              {/* CTA hint */}
              <div style={{
                marginTop: 6,
                fontSize: 10,
                fontWeight: 600,
                color: isSelected ? '#fff' : color,
                opacity: isSelected ? 1 : 0.7,
              }}>
                {isSelected && loading ? 'Calculando...' : isSelected ? 'Carregado — ver resultados' : 'Clique para carregar'}
              </div>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{
          textAlign: 'center',
          color: 'var(--text-muted, #666)',
          padding: '24px 0',
          fontSize: 13,
        }}>
          Nenhum template encontrado para &quot;{search}&quot;
        </div>
      )}
    </div>
  )
}
