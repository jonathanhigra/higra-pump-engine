import React, { useState } from 'react'

const SECTION_GUIDES: Record<string, { title: string; text: string; tip: string }> = {
  results: {
    title: 'Dimensionamento 1D',
    text: 'Insira vazao, altura e rotacao para calcular as dimensoes do rotor, eficiencia e NPSHr.',
    tip: 'Comece com Q=100 m3/h, H=32m, n=1750rpm para uma bomba industrial tipica.',
  },
  '3d': {
    title: 'Visualizacao 3D',
    text: 'Veja o rotor em 3D. Arraste para girar, scroll para zoom, clique numa pa para detalhes.',
    tip: 'Use os botoes Frontal/Lateral/Topo para vistas predefinidas.',
  },
  curves: {
    title: 'Curvas de Desempenho',
    text: 'Graficos H x Q e eta x Q mostrando o desempenho em diferentes vazoes.',
    tip: 'O ponto de projeto (BEP) e marcado no grafico.',
  },
  losses: {
    title: 'Analise de Perdas',
    text: 'Distribuicao das perdas hidraulicas: perfil, tip leakage, disco, recirculacao.',
    tip: 'As perdas de perfil dominam em bombas de baixo Nq.',
  },
  optimize: {
    title: 'Otimizacao Multi-Objetivo',
    text: 'Usa NSGA-II para encontrar o melhor compromisso entre eficiencia, NPSHr e robustez.',
    tip: 'Use os presets para uma otimizacao rapida.',
  },
  velocity: {
    title: 'Triangulos de Velocidade',
    text: 'Visualize as componentes de velocidade na entrada e saida do rotor.',
    tip: 'A componente tangencial cu2 define a altura de Euler.',
  },
  stress: {
    title: 'Analise de Tensoes',
    text: 'Estimativa de tensoes mecanicas no rotor por forca centrifuga e pressao.',
    tip: 'Verifique se a tensao maxima esta abaixo do limite do material.',
  },
  pressure: {
    title: 'Distribuicao de Pressao',
    text: 'Pressao nos lados de pressao (PS) e succao (SS) da pa.',
    tip: 'Diferenca PS-SS indica o carregamento da pa.',
  },
}

export default function SectionGuide({ tab }: { tab: string }) {
  const guide = SECTION_GUIDES[tab]
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(`hpe_guide_${tab}`) === '1'
  )
  if (!guide || dismissed) return null
  const dismiss = () => { setDismissed(true); localStorage.setItem(`hpe_guide_${tab}`, '1') }

  return (
    <div style={{
      fontSize: 11, color: 'var(--text-muted)', marginBottom: 8,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ color: 'var(--accent)' }}>&#128161;</span>
      <span>{guide.tip}</span>
      <button onClick={dismiss} style={{
        background: 'none', border: 'none', color: 'var(--text-muted)',
        cursor: 'pointer', fontSize: 12, marginLeft: 'auto', padding: 0,
      }}>&times;</button>
    </div>
  )
}
