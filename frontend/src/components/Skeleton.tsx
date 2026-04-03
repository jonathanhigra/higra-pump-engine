import React from 'react'

interface Props {
  width?: string
  height?: string
  variant?: 'text' | 'card' | 'chart' | 'circle'
}

const VARIANT_DEFAULTS: Record<string, { width: string; height: string; borderRadius: string }> = {
  text:   { width: '100%', height: '14px', borderRadius: '4px' },
  card:   { width: '100%', height: '120px', borderRadius: '8px' },
  chart:  { width: '100%', height: '300px', borderRadius: '8px' },
  circle: { width: '40px', height: '40px', borderRadius: '50%' },
}

export default function Skeleton({ width, height, variant = 'text' }: Props) {
  const defaults = VARIANT_DEFAULTS[variant]

  return (
    <div
      style={{
        width: width || defaults.width,
        height: height || defaults.height,
        borderRadius: defaults.borderRadius,
        background: 'linear-gradient(-90deg, var(--bg-surface) 0%, var(--bg-hover) 50%, var(--bg-surface) 100%)',
        backgroundSize: '400% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }}
    />
  )
}
