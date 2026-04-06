import React, { useState, useRef, useCallback } from 'react'

/* ── Engineering terms database ───────────────────────────────────────── */
const TERMS: Record<string, string> = {
  'Nq': 'Velocidade específica — classifica o tipo de rotor. Nq<30: radial, 30-80: radial alto, 80-160: mixed-flow, >160: axial',
  'De Haller': 'Razão de difusão w2/w1 — deve ser >0.72 para evitar separação do escoamento',
  'sigma': 'Coeficiente de cavitação de Thoma — sigma = NPSHd/H. Quanto menor, mais suscetível à cavitação',
  '\u03C3': 'Coeficiente de cavitação de Thoma — sigma = NPSHd/H. Quanto menor, mais suscetível à cavitação',
  'NPSHr': 'Net Positive Suction Head requerido — pressão mínima na sucção para evitar cavitação [m]',
  'eta': 'Rendimento total — produto do rendimento hidráulico, volumétrico e mecânico',
  '\u03B7': 'Rendimento total — produto do rendimento hidráulico, volumétrico e mecânico',
  '\u03B7 total': 'Rendimento total — produto do rendimento hidráulico, volumétrico e mecânico',
  'beta1': 'Ângulo de entrada da pá — entre a direção tangencial e a velocidade relativa na entrada [°]',
  '\u03B21': 'Ângulo de entrada da pá — entre a direção tangencial e a velocidade relativa na entrada [°]',
  '\u03B2\u2081': 'Ângulo de entrada da pá — entre a direção tangencial e a velocidade relativa na entrada [°]',
  'beta2': 'Ângulo de saída da pá — controla a altura de Euler e o slip. Típico: 15-35° para bombas [°]',
  '\u03B22': 'Ângulo de saída da pá — controla a altura de Euler e o slip. Típico: 15-35° para bombas [°]',
  '\u03B2\u2082': 'Ângulo de saída da pá — controla a altura de Euler e o slip. Típico: 15-35° para bombas [°]',
  'D2': 'Diâmetro externo do rotor — principal dimensão geométrica, define u2 e o head [mm]',
  'D1': 'Diâmetro de entrada do rotor — afeta NPSHr e velocidade meridional na entrada [mm]',
  'b2': 'Largura de saída do rotor — define a área de passagem na saída [mm]',
  'u2': 'Velocidade periférica na saída — u2 = pi*D2*n/60. Limite prático ~50 m/s para água [m/s]',
  'slip': 'Fator de escorregamento — redução do cu2 real vs. ideal devido ao número finito de pás',
  'psi': 'Coeficiente de pressão — psi = gH/u2². Típico: 0.4-0.6 para bombas centrífugas',
  '\u03C8': 'Coeficiente de pressão — psi = gH/u2². Típico: 0.4-0.6 para bombas centrífugas',
  'phi': 'Coeficiente de vazão — phi = cm2/u2. Típico: 0.05-0.15',
  '\u03C6': 'Coeficiente de vazão — phi = cm2/u2. Típico: 0.05-0.15',
  'Potencia': 'Potência consumida pela bomba — P = rho*g*Q*H/eta [W]',
  'P': 'Potência consumida pela bomba — P = rho*g*Q*H/eta [W]',
}

interface Props {
  term: string
  children: React.ReactNode
}

export default function EngineeringTooltip({ term, children }: Props) {
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const description = TERMS[term]
  if (!description) return <>{children}</>

  const show = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    showTimer.current = setTimeout(() => setVisible(true), 100)
  }, [])

  const hide = useCallback(() => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null }
    hideTimer.current = setTimeout(() => setVisible(false), 200)
  }, [])

  return (
    <span
      style={{ position: 'relative', display: 'inline', cursor: 'help' }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <span style={{ borderBottom: '1px dashed var(--text-muted)' }}>
        {children}
      </span>
      {visible && (
        <span
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            borderRadius: 8,
            padding: '10px 14px',
            maxWidth: 300,
            minWidth: 180,
            fontSize: 12,
            boxShadow: 'var(--shadow-sm)',
            pointerEvents: 'auto',
            whiteSpace: 'normal',
            lineHeight: 1.5,
          }}
        >
          {/* Arrow / caret */}
          <span style={{
            position: 'absolute',
            bottom: -6,
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: 10,
            height: 10,
            background: 'var(--bg-elevated)',
            borderRight: '1px solid var(--border-primary)',
            borderBottom: '1px solid var(--border-primary)',
          }} />
          <span style={{ display: 'block', color: 'var(--accent)', fontWeight: 600, marginBottom: 4, fontSize: 11 }}>
            {term}
          </span>
          <span style={{ display: 'block', color: 'var(--text-secondary)' }}>
            {description}
          </span>
        </span>
      )}
    </span>
  )
}
