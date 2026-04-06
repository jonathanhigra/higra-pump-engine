import React from 'react'
import type { SizingResult } from '../App'

interface Props {
  sizing: SizingResult
}

type Quality = 'good' | 'ok' | 'bad'

function evaluateQuality(sizing: SizingResult): { quality: Quality; label: string } {
  const eta = sizing.estimated_efficiency
  const npsh = sizing.estimated_npsh_r
  const deHaller = (sizing as any).diffusion_ratio ?? (sizing.velocity_triangles?.de_haller ?? 0.75)

  if (eta > 0.80 && npsh < 6 && deHaller > 0.72) {
    return { quality: 'good', label: 'Bom' }
  }
  if (eta > 0.70 && npsh < 10) {
    return { quality: 'ok', label: 'Aceitavel' }
  }
  return { quality: 'bad', label: 'Revisar' }
}

/* Colorblind-friendly: blue/orange/red + shape icons (#8) */
const QUALITY_ICONS: Record<Quality, string> = { good: '\u2713', ok: '\u26A0', bad: '\u2717' }
const QUALITY_COLORS_CB: Record<Quality, string> = { good: '#2563eb', ok: '#d97706', bad: '#dc2626' }

export default function DesignQualityBadge({ sizing }: Props) {
  const { quality, label } = evaluateQuality(sizing)
  const color = QUALITY_COLORS_CB[quality]
  const icon = QUALITY_ICONS[quality]

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 10px',
      borderRadius: 20,
      border: `1px solid ${color}40`,
      background: `${color}12`,
      fontSize: 11,
      fontWeight: 600,
      color,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 12, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
      {label}
    </div>
  )
}
