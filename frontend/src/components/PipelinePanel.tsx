/**
 * PipelinePanel — mostra progresso do pipeline via WebSocket.
 *
 * Uso: <PipelinePanel input={{ Q: 0.05, H: 30, n: 1750 }} />
 *
 * Ao montar, chama POST /pipeline/run e subscreve WS /ws/pipeline/{run_id}.
 * Mostra barra de progresso + estágio atual + resultado final.
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  startPipeline,
  subscribePipelineStatus,
  PipelineStatus,
  SizingV2Input,
} from '../services/api'

interface Props {
  input: SizingV2Input
  onComplete?: (result: Record<string, unknown>) => void
}

type PanelState = 'idle' | 'running' | 'completed' | 'failed'

export default function PipelinePanel({ input, onComplete }: Props) {
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [runId, setRunId] = useState<string | null>(null)
  const [status, setStatus] = useState<PipelineStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleStart = useCallback(async () => {
    setError(null)
    setPanelState('running')
    setStatus(null)

    try {
      const result = await startPipeline(input)
      setRunId(result.run_id)

      // For sync mode, pipeline already completed
      if (result.mode === 'sync' && result.eta !== undefined) {
        const syntheticStatus: PipelineStatus = {
          run_id: result.run_id,
          status: 'completed',
          progress: 100,
          result: {
            D2_mm: result.D2_mm,
            eta: result.eta,
            elapsed_ms: result.elapsed_ms,
          },
        }
        setStatus(syntheticStatus)
        setPanelState('completed')
        if (onComplete && syntheticStatus.result) onComplete(syntheticStatus.result)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar pipeline')
      setPanelState('failed')
    }
  }, [input, onComplete])

  // Subscribe to WebSocket once we have a run_id (async mode)
  useEffect(() => {
    if (!runId || panelState !== 'running') return

    const cleanup = subscribePipelineStatus(
      runId,
      (s) => setStatus(s),
      (s) => {
        setStatus(s)
        if (s.status === 'completed') {
          setPanelState('completed')
          if (onComplete && s.result) onComplete(s.result)
        } else {
          setPanelState('failed')
          setError(s.error || 'Pipeline falhou')
        }
      },
    )

    return cleanup
  }, [runId, panelState, onComplete])

  const progress = status?.progress ?? 0
  const stage = status?.stage ?? ''
  const elapsedS = status?.elapsed_s

  const stageLabel = stage
    ? stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : panelState === 'running' ? 'Iniciando...' : ''

  return (
    <div style={{
      border: '1px solid var(--border-primary)',
      borderRadius: 8,
      padding: 16,
      background: 'var(--card-bg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
          Pipeline de Design
        </span>
        {elapsedS !== undefined && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {elapsedS.toFixed(1)}s
          </span>
        )}
      </div>

      {/* Idle state — start button */}
      {panelState === 'idle' && (
        <button
          onClick={handleStart}
          className="btn-primary"
          style={{ padding: '8px 20px', fontSize: 13, alignSelf: 'flex-start' }}
        >
          Executar Pipeline
        </button>
      )}

      {/* Running state */}
      {panelState === 'running' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner />
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{stageLabel}</span>
          </div>
          <ProgressBar value={progress} />
          {status?.message && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{status.message}</span>
          )}
        </div>
      )}

      {/* Completed state */}
      {panelState === 'completed' && status?.result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#22c55e', fontSize: 16 }}>&#10003;</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Pipeline concluído
            </span>
          </div>
          <ProgressBar value={100} color="#22c55e" />
          <ResultGrid result={status.result} />
          <button
            onClick={() => { setPanelState('idle'); setRunId(null); setStatus(null) }}
            style={{
              alignSelf: 'flex-start', fontSize: 12, padding: '4px 12px',
              background: 'transparent', border: '1px solid var(--border-primary)',
              borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)',
            }}
          >
            Nova execução
          </button>
        </div>
      )}

      {/* Failed state */}
      {panelState === 'failed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#ef4444', fontSize: 16 }}>&#10007;</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#ef4444' }}>
              Falha no pipeline
            </span>
          </div>
          {error && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-word' }}>
              {error}
            </span>
          )}
          <button
            onClick={() => { setPanelState('idle'); setRunId(null); setStatus(null); setError(null) }}
            className="btn-primary"
            style={{ alignSelf: 'flex-start', fontSize: 12, padding: '6px 14px' }}
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14,
      border: '2px solid var(--border-primary)',
      borderTop: '2px solid var(--accent)',
      borderRadius: '50%',
      animation: 'hpe-spin 0.8s linear infinite',
      flexShrink: 0,
    }}>
      <style>{`@keyframes hpe-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function ProgressBar({ value, color }: { value: number; color?: string }) {
  return (
    <div style={{
      height: 6, borderRadius: 3,
      background: 'var(--bg-secondary)',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: `${Math.min(100, Math.max(0, value))}%`,
        background: color ?? 'var(--accent)',
        borderRadius: 3,
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}

function ResultGrid({ result }: { result: Record<string, unknown> }) {
  const entries = Object.entries(result).filter(([, v]) => v !== undefined && v !== null)
  const formatValue = (key: string, value: unknown): string => {
    if (typeof value === 'number') {
      if (key.toLowerCase().includes('eta')) return `${(value * 100).toFixed(1)}%`
      if (key.toLowerCase().includes('mm')) return `${value.toFixed(1)} mm`
      if (key.toLowerCase().includes('ms')) return `${value.toFixed(0)} ms`
      return value.toFixed(2)
    }
    return String(value)
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
      gap: 8,
    }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{
          background: 'var(--bg-secondary)',
          borderRadius: 6,
          padding: '6px 10px',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{key}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {formatValue(key, value)}
          </div>
        </div>
      ))}
    </div>
  )
}
