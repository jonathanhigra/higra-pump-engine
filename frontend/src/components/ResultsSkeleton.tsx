import React, { useState } from 'react'
import Skeleton from './Skeleton'

const FUN_FACTS = [
  'A bomba centrifuga foi inventada em 1689 por Denis Papin.',
  'Bombas consomem 20% da energia eletrica industrial mundial.',
  'A velocidade especifica Nq foi introduzida por Camerer em 1914.',
  'Uma bomba operando fora do BEP pode ter vida util reduzida pela metade.',
  'A maior estacao de bombeamento move 540 m\u00B3/s em Kinderdijk, Holanda.',
  'Francis turbines podem alcancar rendimento acima de 95%.',
  'O conceito de NPSH foi formalizado por Thoma em 1925.',
  'Rotores fechados tem melhor rendimento que abertos em geral.',
]

/**
 * Skeleton placeholder that mimics the ResultsView layout.
 * Shown while the sizing computation is running.
 */
export default function ResultsSkeleton() {
  const [fact] = useState(() => FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Hero strip — 3 metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <Skeleton variant="card" height="80px" />
        <Skeleton variant="card" height="80px" />
        <Skeleton variant="card" height="80px" />
      </div>

      {/* Text lines — title + rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
        <Skeleton variant="text" width="40%" height="16px" />
        <Skeleton variant="text" width="100%" />
        <Skeleton variant="text" width="85%" />
      </div>

      {/* Two card skeletons — gauge + status area */}
      <Skeleton variant="card" />
      <Skeleton variant="card" />

      {/* Chart skeleton — performance chart area */}
      <Skeleton variant="chart" />

      {/* Fun fact */}
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 16, fontStyle: 'italic' }}>
        {fact}
      </div>
    </div>
  )
}
