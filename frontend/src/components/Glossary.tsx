import React, { useState, useMemo } from 'react'

const GLOSSARY: { term: string; definition: string; unit?: string }[] = [
  { term: 'Nq', definition: 'Velocidade específica -- classifica o tipo de rotor. Nq<30: radial, 30-80: radial alto, 80-160: mixed-flow, >160: axial.' },
  { term: 'NPSHr', definition: 'Net Positive Suction Head requerido -- pressão mínima na sucção para evitar cavitação.', unit: 'm' },
  { term: 'eta', definition: 'Rendimento total -- produto do rendimento hidráulico, volumétrico e mecânico.', unit: '%' },
  { term: 'beta1', definition: 'Ângulo de entrada da pá -- entre direção tangencial e velocidade relativa na entrada.', unit: 'graus' },
  { term: 'beta2', definition: 'Ângulo de saída da pá -- controla a altura de Euler e o escorregamento.', unit: 'graus' },
  { term: 'D2', definition: 'Diâmetro externo do rotor -- principal dimensão, define velocidade periférica u2.', unit: 'mm' },
  { term: 'b2', definition: 'Largura de saída do rotor -- define área de passagem na saída.', unit: 'mm' },
  { term: 'De Haller', definition: 'Razão w2/w1 -- deve ser >0.72 para evitar separação do escoamento.' },
  { term: 'Slip', definition: 'Fator de escorregamento -- redução do cu2 real vs ideal devido ao número finito de pás.' },
  { term: 'NPSH', definition: 'Net Positive Suction Head -- energia por unidade de peso acima da pressão de vapor.' },
  { term: 'Cavitação', definition: 'Formação e colapso de bolhas de vapor. Causa ruído, vibração e erosão.' },
  { term: 'Wrap angle', definition: 'Ângulo de envolvimento da pá -- extensão angular do bordo de ataque ao bordo de fuga.' },
  { term: 'Voluta', definition: 'Carcaça espiral que coleta o fluido da saída do rotor e o direciona para a tubulação.' },
  { term: 'BEP', definition: 'Best Efficiency Point -- ponto de operação com máxima eficiência.' },
  { term: 'Euler', definition: 'Equação de Euler para turbomáquinas: H_euler = (u2*cu2 - u1*cu1) / g' },
  { term: 'Sigma', definition: 'Coeficiente de cavitação de Thoma -- razão NPSHr/H.' },
  { term: 'u2', definition: 'Velocidade periférica na saída do rotor -- u2 = pi*D2*n/60.', unit: 'm/s' },
  { term: 'cu2', definition: 'Componente tangencial da velocidade absoluta na saída.', unit: 'm/s' },
  { term: 'cm2', definition: 'Componente meridional da velocidade na saída.', unit: 'm/s' },
  { term: 'w2', definition: 'Velocidade relativa na saída do rotor.', unit: 'm/s' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function Glossary({ open, onClose }: Props) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return GLOSSARY
    const s = search.toLowerCase()
    return GLOSSARY.filter(g =>
      g.term.toLowerCase().includes(s) || g.definition.toLowerCase().includes(s)
    )
  }, [search])

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)',
        borderRadius: 12, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: 16 }}>Glossario de Turbomaquinas</h3>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18,
            }}>x</button>
          </div>
          <input
            type="text"
            placeholder="Buscar termo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '8px 12px', background: 'var(--bg-input)',
              border: '1px solid var(--border-primary)', borderRadius: 6,
              color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              fontFamily: 'var(--font-family)',
            }}
          />
        </div>
        <div style={{ overflow: 'auto', padding: '12px 20px', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              Nenhum termo encontrado.
            </div>
          )}
          {filtered.map(g => (
            <div key={g.term} style={{
              padding: '10px 0', borderBottom: '1px solid var(--border-subtle, var(--border-primary))',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>{g.term}</span>
                {g.unit && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 10,
                    background: 'rgba(0,160,223,0.12)', color: 'var(--accent)',
                  }}>{g.unit}</span>
                )}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5 }}>{g.definition}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
