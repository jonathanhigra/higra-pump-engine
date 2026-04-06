import React, { useState } from 'react'
import ReportPreviewModal from './ReportPreviewModal'
import type { SizingResult, CurvePoint } from '../App'

interface Props {
  sizing: SizingResult
  opPoint: { flowRate: number; head: number; rpm: number }
  curves: CurvePoint[]
  projectName?: string
}

function buildReportHTML(sizing: SizingResult, opPoint: Props['opPoint'], curves: CurvePoint[], projectName: string): string {
  const now = new Date()
  const dateStr = now.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const eta = (sizing.estimated_efficiency * 100).toFixed(1)
  const power = (sizing.estimated_power / 1000).toFixed(2)

  const warningsHTML = sizing.warnings && sizing.warnings.length > 0
    ? sizing.warnings.map(w => `<li>${w}</li>`).join('\n            ')
    : '<li>Nenhum aviso</li>'

  // Build a mini ASCII-style table for curve data (top 5 points around BEP)
  let curveSection = ''
  if (curves.length > 0) {
    const step = Math.max(1, Math.floor(curves.length / 7))
    const sampled = curves.filter((_, i) => i % step === 0).slice(0, 7)
    const rows = sampled.map(c =>
      `<tr>
        <td>${(c.flow_rate * 3600).toFixed(1)}</td>
        <td>${c.head.toFixed(2)}</td>
        <td>${(c.efficiency * 100).toFixed(1)}</td>
        <td>${(c.power / 1000).toFixed(2)}</td>
        <td>${c.npsh_required.toFixed(2)}</td>
      </tr>`
    ).join('\n')

    curveSection = `
      <h2>Curva de Desempenho (pontos selecionados)</h2>
      <table>
        <thead>
          <tr>
            <th>Q [m&sup3;/h]</th>
            <th>H [m]</th>
            <th>&eta; [%]</th>
            <th>P [kW]</th>
            <th>NPSHr [m]</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>HPE - Relatorio de Projeto</title>
  <style>
    @page { margin: 20mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Georgia", "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      padding: 0;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #00457c;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 18pt;
      font-weight: 700;
      color: #00457c;
      letter-spacing: 2px;
      margin-bottom: 4px;
    }
    .header .subtitle {
      font-size: 10pt;
      color: #666;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      font-size: 10pt;
      color: #444;
      margin-bottom: 24px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 12px;
    }
    .meta span { display: inline-block; }
    h2 {
      font-size: 13pt;
      color: #00457c;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
      margin: 24px 0 12px;
    }
    .op-point {
      background: #f4f7fa;
      border: 1px solid #d0d8e0;
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 20px;
      font-size: 11pt;
    }
    .op-point b { color: #00457c; }
    .results-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 32px;
    }
    .results-grid .row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px dotted #ddd;
    }
    .results-grid .row .label { color: #555; }
    .results-grid .row .value { font-weight: 700; color: #1a1a1a; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
      margin-top: 8px;
    }
    th {
      background: #f0f4f8;
      border: 1px solid #ccc;
      padding: 6px 10px;
      text-align: left;
      font-weight: 600;
      color: #333;
    }
    td {
      border: 1px solid #ddd;
      padding: 5px 10px;
    }
    .warnings {
      background: #fff8e1;
      border: 1px solid #ffe082;
      border-radius: 4px;
      padding: 12px 16px;
      margin-top: 8px;
    }
    .warnings ul { padding-left: 20px; }
    .warnings li { margin-bottom: 4px; font-size: 10pt; color: #6d4c00; }
    .footer {
      margin-top: 40px;
      border-top: 1px solid #ccc;
      padding-top: 12px;
      text-align: center;
      font-size: 9pt;
      color: #888;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>HIGRA PUMP ENGINE</h1>
    <div class="subtitle">Relatorio de Projeto</div>
  </div>

  <div class="meta">
    <span><b>Projeto:</b> ${projectName}</span>
    <span><b>Data:</b> ${dateStr} ${timeStr}</span>
  </div>

  <div class="op-point">
    <b>Ponto de operação:</b>
    Q = ${opPoint.flowRate} m&sup3;/h &nbsp;&middot;&nbsp;
    H = ${opPoint.head} m &nbsp;&middot;&nbsp;
    n = ${opPoint.rpm} rpm
  </div>

  <h2>Resultados do Dimensionamento</h2>
  <div class="results-grid">
    <div class="row"><span class="label">Velocidade específica Nq</span><span class="value">${sizing.specific_speed_nq.toFixed(1)}</span></div>
    <div class="row"><span class="label">Tipo de rotor</span><span class="value">${sizing.impeller_type || '---'}</span></div>
    <div class="row"><span class="label">Diâmetro externo D2</span><span class="value">${(sizing.impeller_d2 * 1000).toFixed(1)} mm</span></div>
    <div class="row"><span class="label">Diâmetro de entrada D1</span><span class="value">${(sizing.impeller_d1 * 1000).toFixed(1)} mm</span></div>
    <div class="row"><span class="label">Largura de saída b2</span><span class="value">${(sizing.impeller_b2 * 1000).toFixed(1)} mm</span></div>
    <div class="row"><span class="label">Número de pás</span><span class="value">${sizing.blade_count}</span></div>
    <div class="row"><span class="label">Ângulo de entrada B1</span><span class="value">${sizing.beta1?.toFixed(1) ?? '---'}&deg;</span></div>
    <div class="row"><span class="label">Ângulo de saída B2</span><span class="value">${sizing.beta2?.toFixed(1) ?? '---'}&deg;</span></div>
  </div>

  <h2>Desempenho</h2>
  <div class="results-grid">
    <div class="row"><span class="label">Rendimento total &eta;</span><span class="value">${eta}%</span></div>
    <div class="row"><span class="label">Potência estimada</span><span class="value">${power} kW</span></div>
    <div class="row"><span class="label">NPSHr</span><span class="value">${sizing.estimated_npsh_r?.toFixed(2) ?? '---'} m</span></div>
    <div class="row"><span class="label">Fator de escorregamento &sigma;</span><span class="value">${sizing.sigma?.toFixed(4) ?? '---'}</span></div>
  </div>

  ${curveSection}

  <h2>Avisos</h2>
  <div class="warnings">
    <ul>
      ${warningsHTML}
    </ul>
  </div>

  <!-- QR Code placeholder -->
  <!-- TODO: integrate qrcode library for real QR generation -->
  <div style="text-align: center; margin-top: 32px;">
    <div style="display: inline-block; width: 80px; height: 80px; border: 2px solid #333; border-radius: 4px; position: relative;">
      <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 18pt; font-weight: 700; color: #333;">QR</span>
    </div>
    <div style="font-size: 9pt; color: #666; margin-top: 6px;">
      Escaneie para ver este projeto online
    </div>
    <div style="font-size: 8pt; color: #999; margin-top: 2px; word-break: break-all;">
      ${typeof window !== 'undefined' ? window.location.origin : ''}/project/${projectName ? encodeURIComponent(projectName) : 'current'}
    </div>
  </div>

  <div class="footer">
    Gerado por HPE v0.1.0 &mdash; HIGRA Industrial Ltda.
  </div>
</body>
</html>`
}

export default function ReportButton({ sizing, opPoint, curves, projectName }: Props) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  const handleGenerate = () => {
    const name = projectName || 'Projeto HPE'
    const html = buildReportHTML(sizing, opPoint, curves, name)
    setPreviewHtml(html)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleGenerate}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
          border: '1px solid var(--border-primary)', borderRadius: 6, background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: 12, fontWeight: 500,
          transition: 'all 0.15s', width: '100%',
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        Gerar Relatorio PDF
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>.pdf</span>
      </button>
      {previewHtml && (
        <ReportPreviewModal html={previewHtml} onClose={() => setPreviewHtml(null)} />
      )}
    </>
  )
}
