import React, { useState, useEffect } from 'react'

interface Props {
  active: boolean
  onComplete: () => void
  onNavigate: (page: 'projects' | 'design', tab?: string) => void
}

interface Step {
  title: string
  description: string
  iconPath: string
}

const STEPS: Step[] = [
  {
    title: 'Menu lateral',
    description: 'Use o menu lateral para navegar entre as secoes do projeto. Cada secao agrupa funcionalidades relacionadas como Design, Geometria, Analise e Otimizacao.',
    iconPath: 'M4 6h16M4 12h16M4 18h16',
  },
  {
    title: 'Formulario de dimensionamento',
    description: 'Insira vazao (Q), altura manometrica (H) e rotacao (RPM) para dimensionar o rotor. Voce tambem pode selecionar o tipo de maquina e fluido.',
    iconPath: 'M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z',
  },
  {
    title: 'Executar calculo',
    description: 'Clique no botao "Executar" ou pressione F5 para calcular. O sistema realiza dimensionamento 1D com correlacoes de Stepanoff, Gulich e Pfleiderer.',
    iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    title: 'Resultados e metricas',
    description: 'Os resultados aparecem aqui com metricas-chave (Nq, eta, D2, NPSHr) e warnings de projeto. Clique nas secoes Geometria, Desempenho e Perdas para detalhes.',
    iconPath: 'M3 12h4l3-9 4 18 3-9h4',
  },
  {
    title: 'Abas de analise',
    description: 'Use as abas para explorar curvas de desempenho, visualizacao 3D, triangulos de velocidade, analise de perdas e otimizacao.',
    iconPath: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  },
  {
    title: 'Barra de status',
    description: 'A barra inferior mostra as metricas-chave do projeto atual em tempo real: Nq, rendimento, D2, NPSHr, numero de pas e potencia.',
    iconPath: 'M22 12h-4l-3 9-4-18-3 9H4',
  },
]

export default function GuidedTour({ active, onComplete }: Props) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (active) setStep(0)
  }, [active])

  /* Close on Escape */
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onComplete()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [active, onComplete])

  if (!active) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem('hpe_tour_completed', 'true')
      onComplete()
    } else {
      setStep(s => s + 1)
    }
  }

  const handleSkip = () => {
    localStorage.setItem('hpe_tour_completed', 'true')
    onComplete()
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 3000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 500,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--accent)',
        borderRadius: 16,
        boxShadow: '0 0 0 4px rgba(0,160,223,0.15), 0 20px 60px rgba(0,0,0,0.4)',
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}>
        {/* Step counter */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
          Passo {step + 1} de {STEPS.length}
        </div>

        {/* Icon */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: 'rgba(0,160,223,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={current.iconPath} />
          </svg>
        </div>

        {/* Title */}
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>
          {current.title}
        </div>

        {/* Description */}
        <div style={{
          fontSize: 14,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          lineHeight: 1.6,
          maxWidth: 400,
        }}>
          {current.description}
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 8, margin: '4px 0' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 20 : 8,
                height: 8,
                borderRadius: 4,
                background: i === step ? 'var(--accent)' : i < step ? 'rgba(0,160,223,0.4)' : 'var(--border-primary)',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          <button
            type="button"
            onClick={handleSkip}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 8,
              border: '1px solid var(--border-primary)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-family)',
            }}
          >
            Pular
          </button>
          <button
            type="button"
            onClick={handleNext}
            style={{
              flex: 2,
              padding: '10px 0',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-family)',
            }}
          >
            {isLast ? 'Concluir' : 'Proximo'}
          </button>
        </div>
      </div>
    </div>
  )
}
