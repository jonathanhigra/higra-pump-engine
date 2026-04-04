/**
 * ReportPreviewModal — Full-screen modal showing the HTML report preview
 * before printing. User can review and then click "Imprimir PDF" to trigger print.
 */
import React, { useRef, useEffect } from 'react'

interface Props {
  html: string
  onClose: () => void
}

export default function ReportPreviewModal({ html, onClose }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(html)
    doc.close()
  }, [html])

  const handlePrint = () => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
  }

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2200,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '90vw', maxWidth: 900, height: '90vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-elevated)',
          borderRadius: 12,
          border: '1px solid var(--border-primary)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top bar with buttons */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--bg-surface)',
        }}>
          <button
            onClick={handlePrint}
            style={{
              padding: '7px 16px', borderRadius: 6,
              background: 'var(--accent)', color: '#fff',
              border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            Imprimir PDF
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 6,
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-primary)',
              cursor: 'pointer', fontSize: 13,
            }}
          >
            Fechar
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
            Esc para fechar
          </span>
        </div>

        {/* Report preview iframe */}
        <iframe
          ref={iframeRef}
          title="Report Preview"
          style={{
            flex: 1, border: 'none',
            background: '#fff',
            width: '100%',
          }}
        />
      </div>
    </div>
  )
}
