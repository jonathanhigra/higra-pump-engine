import React, { useState, useEffect } from 'react'

interface Props {
  onRunSizing: (q: number, h: number, n: number) => void
  onNavigate: (page: 'projects' | 'design', tab?: string) => void
  onComplete: () => void
}

const DRAGON_PARAMS = { q: 180, h: 30, n: 1750 }

export default function QuickStartWizard({ onRunSizing, onNavigate, onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [sizingDone, setSizingDone] = useState(false)
  const [visible, setVisible] = useState(true)

  // Check localStorage — only show on first visit
  useEffect(() => {
    if (localStorage.getItem('hpe_quickstart_done')) {
      setVisible(false)
    }
  }, [])

  if (!visible) return null

  const finish = () => {
    localStorage.setItem('hpe_quickstart_done', 'true')
    onComplete()
    setVisible(false)
  }

  const handleSkip = () => {
    finish()
  }

  const steps = [
    {
      title: 'Vamos projetar uma bomba centrifuga?',
      description: 'Em 30 segundos voce tera um rotor dimensionado com geometria 3D, curvas de desempenho e analise de perdas.',
      action: 'Iniciar',
      onAction: () => setStep(1),
      icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    },
    {
      title: 'Ponto de operacao — Bomba Tipica',
      description: `Q = ${DRAGON_PARAMS.q} m\u00B3/h, H = ${DRAGON_PARAMS.h} m, n = ${DRAGON_PARAMS.n} rpm. Estes parametros geram uma bomba centrifuga radial classica (Nq \u2248 26).`,
      action: 'Calcular Agora',
      onAction: () => {
        onRunSizing(DRAGON_PARAMS.q, DRAGON_PARAMS.h, DRAGON_PARAMS.n)
        setSizingDone(true)
        setStep(2)
      },
      icon: 'M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z',
    },
    {
      title: sizingDone ? 'Pronto! O rotor ficou assim:' : 'Calculando...',
      description: sizingDone
        ? 'Nq \u2248 26 (radial) \u2014 Rotor com ~7 pas, D2 \u2248 310mm, \u03B7 \u2248 82%. Explore os resultados nas abas.'
        : 'Aguarde o dimensionamento ser concluido...',
      action: 'Ver Resultados',
      onAction: () => setStep(3),
      icon: 'M3 12h4l3-9 4 18 3-9h4',
    },
    {
      title: 'Agora explore!',
      description: 'Use as abas para geometria, analise e otimizacao.',
      action: 'Concluir',
      onAction: finish,
      icon: 'M22 11.08V12a10 10 0 11-5.93-9.14',
      cards: [
        { label: 'Geometria 3D', tab: '3d', icon: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z' },
        { label: 'Curvas H-Q', tab: 'curves', icon: 'M3 12h4l3-9 4 18 3-9h4' },
        { label: 'Analise Perdas', tab: 'losses', icon: 'M22 12h-4l-3 9-4-18-3 9H4' },
        { label: 'Otimizacao', tab: 'optimize', icon: 'M12 20V10M18 20V4M6 20v-4' },
      ],
    },
  ]

  const current = steps[step]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--accent)',
        borderRadius: 16,
        boxShadow: '0 0 0 4px rgba(0,160,223,0.15), 0 20px 60px rgba(0,0,0,0.4)',
        padding: 32,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
      }}>
        {/* Step counter */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
          Passo {step + 1} de {steps.length}
        </div>

        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'rgba(0,160,223,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={current.icon} />
          </svg>
        </div>

        {/* Title */}
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>
          {current.title}
        </div>

        {/* Description */}
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6, maxWidth: 400 }}>
          {current.description}
        </div>

        {/* Explore cards (step 4 only) */}
        {current.cards && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
            {current.cards.map(c => (
              <button key={c.tab} type="button"
                onClick={() => { onNavigate('design', c.tab); finish() }}
                style={{
                  padding: '12px 8px', borderRadius: 8,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-surface)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-primary)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={c.icon} />
                </svg>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{c.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 8, margin: '4px 0' }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 20 : 8, height: 8, borderRadius: 4,
              background: i === step ? 'var(--accent)' : i < step ? 'rgba(0,160,223,0.4)' : 'var(--border-primary)',
              transition: 'all 0.2s',
            }} />
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          <button type="button" onClick={handleSkip}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8,
              border: '1px solid var(--border-primary)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-family)',
            }}>
            Pular
          </button>
          <button type="button" onClick={current.onAction}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 8,
              border: 'none', background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-family)',
            }}>
            {current.action}
          </button>
        </div>
      </div>
    </div>
  )
}
