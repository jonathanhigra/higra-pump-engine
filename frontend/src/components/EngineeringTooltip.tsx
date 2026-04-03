import React, { useState, useRef, useCallback } from 'react'

/* ── Engineering terms database ───────────────────────────────────────── */
const TERMS: Record<string, string> = {
  'Nq': 'Velocidade especifica — classifica o tipo de rotor. Nq<30: radial, 30-80: radial alto, 80-160: mixed-flow, >160: axial',
  'De Haller': 'Razao de difusao w2/w1 — deve ser >0.72 para evitar separacao do escoamento',
  'sigma': 'Coeficiente de cavitacao de Thoma — sigma = NPSHd/H. Quanto menor, mais suscetivel a cavitacao',
  '\u03C3': 'Coeficiente de cavitacao de Thoma — sigma = NPSHd/H. Quanto menor, mais suscetivel a cavitacao',
  'NPSHr': 'Net Positive Suction Head requerido — pressao minima na succao para evitar cavitacao [m]',
  'eta': 'Rendimento total — produto do rendimento hidraulico, volumetrico e mecanico',
  '\u03B7': 'Rendimento total — produto do rendimento hidraulico, volumetrico e mecanico',
  '\u03B7 total': 'Rendimento total — produto do rendimento hidraulico, volumetrico e mecanico',
  'beta1': 'Angulo de entrada da pa — entre a direcao tangencial e a velocidade relativa na entrada [\u00B0]',
  '\u03B21': 'Angulo de entrada da pa — entre a direcao tangencial e a velocidade relativa na entrada [\u00B0]',
  '\u03B2\u2081': 'Angulo de entrada da pa — entre a direcao tangencial e a velocidade relativa na entrada [\u00B0]',
  'beta2': 'Angulo de saida da pa — controla a altura de Euler e o slip. Tipico: 15-35\u00B0 para bombas [\u00B0]',
  '\u03B22': 'Angulo de saida da pa — controla a altura de Euler e o slip. Tipico: 15-35\u00B0 para bombas [\u00B0]',
  '\u03B2\u2082': 'Angulo de saida da pa — controla a altura de Euler e o slip. Tipico: 15-35\u00B0 para bombas [\u00B0]',
  'D2': 'Diametro externo do rotor — principal dimensao geometrica, define u2 e o head [mm]',
  'D1': 'Diametro de entrada do rotor — afeta NPSHr e velocidade meridional na entrada [mm]',
  'b2': 'Largura de saida do rotor — define a area de passagem na saida [mm]',
  'u2': 'Velocidade periferica na saida — u2 = pi*D2*n/60. Limite pratico ~50 m/s para agua [m/s]',
  'slip': 'Fator de escorregamento — reducao do cu2 real vs. ideal devido ao numero finito de pas',
  'psi': 'Coeficiente de pressao — psi = gH/u2\u00B2. Tipico: 0.4-0.6 para bombas centrifugas',
  '\u03C8': 'Coeficiente de pressao — psi = gH/u2\u00B2. Tipico: 0.4-0.6 para bombas centrifugas',
  'phi': 'Coeficiente de vazao — phi = cm2/u2. Tipico: 0.05-0.15',
  '\u03C6': 'Coeficiente de vazao — phi = cm2/u2. Tipico: 0.05-0.15',
  'Potencia': 'Potencia consumida pela bomba — P = rho*g*Q*H/eta [W]',
  'P': 'Potencia consumida pela bomba — P = rho*g*Q*H/eta [W]',
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
