import React from 'react'
import type { SizingResult } from '../App'

interface Props {
  sizing: SizingResult
}

type Quality = 'green' | 'yellow' | 'red'

function evaluateQuality(sizing: SizingResult): { quality: Quality; label: string } {
  const eta = sizing.estimated_efficiency
  const npsh = sizing.estimated_npsh_r
  const deHaller = (sizing as any).diffusion_ratio ?? (sizing.velocity_triangles?.de_haller ?? 0.75)

  if (eta > 0.80 && npsh < 6 && deHaller > 0.72) {
    return { quality: 'green', label: 'Bom' }
  }
  if (eta > 0.70 && npsh < 10) {
    return { quality: 'yellow', label: 'Aceitavel' }
  }
  return { quality: 'red', label: 'Revisar' }
}

const QUALITY_COLORS: Record<Quality, string> = {
  green: '#22c55e',
  yellow: '#f59e0b',
  red: '#ef4444',
}

export default function DesignQualityBadge({ sizing }: Props) {
  const { quality, label } = evaluateQuality(sizing)
  const color = QUALITY_COLORS[quality]

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
      <span style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }} />
      {label}
    </div>
  )
}
