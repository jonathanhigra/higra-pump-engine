import React, { useState } from 'react'

const SECTION_GUIDES: Record<string, { title: string; text: string; tip: string }> = {
  results: {
    title: 'Dimensionamento 1D',
    text: 'Insira vazão, altura e rotação para calcular as dimensões do rotor, eficiência e NPSHr.',
    tip: 'Comece com Q=100 m³/h, H=32m, n=1750rpm para uma bomba industrial típica.',
  },
  '3d': {
    title: 'Visualização 3D',
    text: 'Veja o rotor em 3D. Arraste para girar, scroll para zoom, clique numa pá para detalhes.',
    tip: 'Use os botões Frontal/Lateral/Topo para vistas predefinidas.',
  },
  curves: {
    title: 'Curvas de Desempenho',
    text: 'Gráficos H x Q e eta x Q mostrando o desempenho em diferentes vazões.',
    tip: 'O ponto de projeto (BEP) é marcado no gráfico.',
  },
  losses: {
    title: 'Análise de Perdas',
    text: 'Distribuição das perdas hidráulicas: perfil, tip leakage, disco, recirculação.',
    tip: 'As perdas de perfil dominam em bombas de baixo Nq.',
  },
  optimize: {
    title: 'Otimização Multi-Objetivo',
    text: 'Usa NSGA-II para encontrar o melhor compromisso entre eficiência, NPSHr e robustez.',
    tip: 'Use os presets para uma otimização rápida.',
  },
  velocity: {
    title: 'Triângulos de Velocidade',
    text: 'Visualize as componentes de velocidade na entrada e saída do rotor.',
    tip: 'A componente tangencial cu2 define a altura de Euler.',
  },
  stress: {
    title: 'Análise de Tensões',
    text: 'Estimativa de tensões mecânicas no rotor por força centrífuga e pressão.',
    tip: 'Verifique se a tensão máxima está abaixo do limite do material.',
  },
  pressure: {
    title: 'Distribuição de Pressão',
    text: 'Pressão nos lados de pressão (PS) e sucção (SS) da pá.',
    tip: 'Diferença PS-SS indica o carregamento da pá.',
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
