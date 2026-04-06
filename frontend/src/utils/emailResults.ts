export function emailResults(sizing: any, opPoint: any, projectName?: string) {
  const subject = encodeURIComponent(`HPE -- ${projectName || 'Projeto'} -- Nq=${sizing.specific_speed_nq.toFixed(1)}`)
  const body = encodeURIComponent(
    `Resultados do Dimensionamento -- HPE\n` +
    `${'='.repeat(40)}\n\n` +
    `Projeto: ${projectName || 'Projeto Rapido'}\n\n` +
    `Ponto de Operacao:\n` +
    `  Q = ${opPoint.flowRate} m3/h\n` +
    `  H = ${opPoint.head} m\n` +
    `  n = ${opPoint.rpm} rpm\n\n` +
    `Resultados:\n` +
    `  Nq = ${sizing.specific_speed_nq.toFixed(1)}\n` +
    `  D2 = ${(sizing.impeller_d2 * 1000).toFixed(0)} mm\n` +
    `  Z  = ${sizing.blade_count} pás\n` +
    `  η  = ${(sizing.estimated_efficiency * 100).toFixed(1)}%\n` +
    `  NPSHr = ${sizing.estimated_npsh_r.toFixed(1)} m\n` +
    `  Potência = ${(sizing.estimated_power / 1000).toFixed(1)} kW\n\n` +
    `Gerado por HPE -- HIGRA Pump Engine`
  )
  window.open(`mailto:?subject=${subject}&body=${body}`)
}
