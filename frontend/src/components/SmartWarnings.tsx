import React, { useState } from 'react'
import type { SizingResult } from '../App'

interface Props {
  warnings: string[]
  sizing: SizingResult
  onNavigate?: (tab: string) => void
}

type Severity = 'info' | 'warning' | 'critical'

interface WarningCard {
  text: string
  severity: Severity
  suggestion: string
  relatedTab?: string
}

const SEVERITY_CONFIG: Record<Severity, { bg: string; border: string; color: string; iconColor: string; label: string }> = {
  info: {
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.3)',
    color: '#3b82f6',
    iconColor: '#3b82f6',
    label: 'info',
  },
  warning: {
    bg: 'rgba(255,213,79,0.08)',
    border: 'rgba(255,213,79,0.3)',
    color: '#f59e0b',
    iconColor: '#f59e0b',
    label: 'alerta',
  },
  critical: {
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.3)',
    color: '#ef4444',
    iconColor: '#ef4444',
    label: 'critico',
  },
}

const HUMAN_MAP: [RegExp, string][] = [
  [/euler head.*above/i, 'A pá está gerando mais pressão do que necessário. Margem de segurança, mas aumenta o consumo.'],
  [/choke/i, 'Velocidade na garganta muito alta — risco de bloqueio. Aumente a área de passagem.'],
  [/npsh/i, 'Pressão na sucção é baixa — risco de cavitação. Reduza RPM ou aumente diâmetro de entrada.'],
  [/de haller/i, 'Desaceleração excessiva do fluido na pá — risco de separação do escoamento.'],
  [/throat/i, 'Garganta do canal muito estreita para a vazão de projeto.'],
  [/excess margin/i, 'Margem de head excessiva — a bomba está superdimensionada para esta aplicação.'],
]

function humanize(warning: string): string | null {
  for (const [pattern, human] of HUMAN_MAP) {
    if (pattern.test(warning)) return human
  }
  return null
}

function classifySeverity(text: string): Severity {
  const lower = text.toLowerCase()
  if (/exceed|fail|unsafe|above limit|excede/.test(lower)) return 'critical'
  if (/choke|high|risk|risco|alto/.test(lower)) return 'warning'
  if (/margin|excess|margem|excesso/.test(lower)) return 'info'
  return 'warning'
}

function getSuggestion(text: string, sizing?: SizingResult): string {
  const lower = text.toLowerCase()
  if (/euler.*head.*excess|euler.*excesso|euler.*margem/i.test(lower)) {
    if (sizing?.beta2) {
      const sugBeta2 = (sizing.beta2 * 0.9).toFixed(1)
      return `Considere reduzir B2 ou o número de pás. Reduza \u03B22 para ${sugBeta2}\u00B0`
    }
    return 'Considere reduzir B2 ou o número de pás'
  }
  if (/choke|bloqueio|engasgamento/i.test(lower))
    return 'Aumente a área de passagem (b2 ou D1)'
  if (/npsh/i.test(lower)) {
    if (sizing) {
      // Extract RPM from velocity triangles or use a heuristic
      const currentRpm = (sizing.velocity_triangles as any)?.rpm ?? 0
      if (currentRpm > 0) {
        const sugRpm = Math.round(currentRpm * 0.85)
        return `Reduza a rotação ou aumente D1. Tente n = ${sugRpm} rpm`
      }
    }
    return 'Reduza a rotação ou aumente D1'
  }
  if (/de haller|haller|difus/i.test(lower))
    return 'Reduza a difusão -- considere mais pás ou menor B2'
  if (/slip|escorregamento|deslizamento/i.test(lower))
    return 'Revise o número de pás (Z) ou o ângulo B2'
  if (/cavit/i.test(lower)) {
    if (sizing) {
      const currentRpm = (sizing.velocity_triangles as any)?.rpm ?? 0
      if (currentRpm > 0) {
        const sugRpm = Math.round(currentRpm * 0.85)
        return `Reduza a rotação ou aumente a pressão de sucção. Tente n = ${sugRpm} rpm`
      }
    }
    return 'Reduza a rotação ou aumente a pressão de sucção'
  }
  if (/efficien|efici/i.test(lower)) {
    if (sizing?.blade_count) {
      const sugZ = sizing.blade_count + 1
      return `Aumente Z para ${sugZ} pás`
    }
    return 'Revise o número de pás ou ângulos'
  }
  return 'Revise os parâmetros de entrada'
}

function getRelatedTab(text: string): string | undefined {
  const lower = text.toLowerCase()
  if (/npsh|cavit/i.test(lower)) return 'results'
  if (/de haller|difus|velocity|velocidade/i.test(lower)) return 'velocity'
  if (/loss|perda/i.test(lower)) return 'losses'
  if (/stress|tensao/i.test(lower)) return 'stress'
  return undefined
}

function SeverityIcon({ severity, size = 16 }: { severity: Severity; size?: number }) {
  const color = SEVERITY_CONFIG[severity].iconColor
  if (severity === 'info') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    )
  }
  if (severity === 'warning') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86l-8.6 14.88A1 1 0 002.56 20h16.88a1 1 0 00.87-1.26l-8.6-14.88a1 1 0 00-1.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  }
  // critical
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

function processWarnings(warnings: string[], sizing?: SizingResult): WarningCard[] {
  return warnings
    .map(text => ({
      text,
      severity: classifySeverity(text),
      suggestion: getSuggestion(text, sizing),
      relatedTab: getRelatedTab(text),
    }))
    .sort((a, b) => {
      const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
      return order[a.severity] - order[b.severity]
    })
}

export function warningCounts(warnings: string[]): { info: number; warning: number; critical: number; total: number } {
  const cards = warnings.map(classifySeverity)
  return {
    info: cards.filter(s => s === 'info').length,
    warning: cards.filter(s => s === 'warning').length,
    critical: cards.filter(s => s === 'critical').length,
    total: warnings.length,
  }
}

export default function SmartWarnings({ warnings, sizing, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (!warnings || warnings.length === 0) return null

  const cards = processWarnings(warnings, sizing)
  const counts = warningCounts(warnings)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Compact header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: expanded ? '6px 6px 0 0' : 6,
          border: '1px solid var(--border-primary)',
          borderBottom: expanded ? '1px solid var(--border-primary)' : undefined,
          background: 'var(--card-bg)', cursor: 'pointer',
          fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
          width: '100%', textAlign: 'left',
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86l-8.6 14.88A1 1 0 002.56 20h16.88a1 1 0 00.87-1.26l-8.6-14.88a1 1 0 00-1.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>AVISOS</span>

        {/* Count badges */}
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          {counts.critical > 0 && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 10,
              background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700,
            }}>{counts.critical} critico{counts.critical > 1 ? 's' : ''}</span>
          )}
          {counts.warning > 0 && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 10,
              background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700,
            }}>{counts.warning} alerta{counts.warning > 1 ? 's' : ''}</span>
          )}
          {counts.info > 0 && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 10,
              background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontWeight: 700,
            }}>{counts.info} info</span>
          )}
        </div>

        <svg
          width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ marginLeft: 'auto', transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded card list */}
      {expanded && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 0,
          border: '1px solid var(--border-primary)',
          borderTop: 'none',
          borderRadius: '0 0 6px 6px',
          overflow: 'hidden',
        }}>
          {cards.map((card, i) => {
            const cfg = SEVERITY_CONFIG[card.severity]
            return (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: 12,
                background: cfg.bg,
                borderLeft: `3px solid ${cfg.color}`,
                borderBottom: i < cards.length - 1 ? `1px solid ${cfg.border}` : 'none',
              }}>
                <div style={{ flexShrink: 0, marginTop: 1 }}>
                  <SeverityIcon severity={card.severity} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 4 }}>
                    {card.text}
                  </div>
                  {humanize(card.text) && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.4 }}>
                      {humanize(card.text)}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {card.suggestion}
                  </div>
                  {card.relatedTab && onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate(card.relatedTab!)}
                      style={{
                        marginTop: 6, padding: 0, background: 'none', border: 'none',
                        color: cfg.color, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        fontFamily: 'var(--font-family)',
                      }}
                    >
                      Ver análise →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
