import React, { useEffect } from 'react'

const HELP: Record<string, { title: string; text: string }> = {
  results: { title: 'Dimensionamento', text: 'Insira Q, H e n para dimensionar o rotor. Os resultados mostram geometria, desempenho e perdas.' },
  '3d': { title: 'Rotor 3D', text: 'Arraste para girar, scroll para zoom. Use os controles para explodir, clipar, colorir e exportar.' },
  curves: { title: 'Curvas H-Q', text: 'Mostra desempenho em diferentes vazoes: altura, eficiencia, potencia e NPSH.' },
  velocity: { title: 'Velocidades', text: 'Triangulos de velocidade inlet/outlet com componentes absolutas, relativas e perifericas.' },
  losses: { title: 'Perdas', text: 'Distribuicao de perdas hidraulicas: perfil, parede, vazamento, disco e voluta.' },
  optimize: { title: 'Otimizacao', text: 'NSGA-II multi-objetivo para eta, NPSHr e potencia. Configure populacao e geracoes.' },
  stress: { title: 'Tensoes', text: 'Analise estrutural simplificada do rotor com tensao centrifuga e flexao.' },
  pressure: { title: 'Pressao', text: 'Distribuicao de pressao ao longo da pa (lado de pressao e succao).' },
  assistant: { title: 'Assistente', text: 'Chat com IA para tirar duvidas sobre o projeto e receber sugestoes.' },
  templates: { title: 'Templates', text: 'Selecione um template pre-configurado para iniciar rapidamente.' },
}

interface Props {
  open: boolean
  onClose: () => void
  currentTab: string
}

export default function ContextualHelp({ open, onClose, currentTab }: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const help = HELP[currentTab] || { title: 'Ajuda', text: 'Pressione F1 em qualquer aba para ver ajuda contextual.' }

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 300, zIndex: 2200,
        background: 'var(--bg-elevated)',
        borderLeft: '1px solid var(--border-primary)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.2s ease-out',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom: '1px solid var(--border-primary)',
      }}>
        <h3 style={{ margin: 0, fontSize: 15, color: 'var(--accent)' }}>{help.title}</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 18, lineHeight: 1,
          }}
        >
          x
        </button>
      </div>
      <div style={{ padding: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {help.text}
      </div>
      <div style={{ padding: '12px 20px', fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', marginTop: 'auto' }}>
        Pressione <kbd style={{ padding: '1px 4px', background: 'var(--bg-surface)', borderRadius: 3, border: '1px solid var(--border-primary)', fontSize: 10 }}>F1</kbd> para abrir/fechar |{' '}
        <kbd style={{ padding: '1px 4px', background: 'var(--bg-surface)', borderRadius: 3, border: '1px solid var(--border-primary)', fontSize: 10 }}>Esc</kbd> para fechar
      </div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
