/**
 * NodeSimulationCard — per-node predicted output with confidence bar.
 * Drop into: dashboard/src/components/SimulationMode/NodeSimulationCard.tsx
 */

import React, { useState } from 'react'

interface NodeSim {
  node_id:               string
  node_type:             string
  predicted_output:      Record<string, unknown>
  propagated_confidence: number
  confidence_basis:      string
  historical_run_count:  number
  risks:                 Array<{ level: string; message: string }>
  warnings:              string[]
  predicted_duration_ms: number
  simulation_note:       string
  confidence_label:      string
  confidence_color:      string
}

const BASIS_LABELS: Record<string, string> = {
  historical_high_volume:  '📊 High-volume history',
  historical_medium_volume:'📊 Medium history',
  historical_low_volume:   '📊 Low history',
  claude_api_knowledge:    '🤖 Claude knowledge',
  sandbox_execution:       '🏃 Sandbox executed',
  deterministic:           '✓ Deterministic',
  propagated_uncertainty:  '⬆ Propagated',
}

const TYPE_ICONS: Record<string, string> = {
  http:    '🌐',
  sql:     '🗄',
  llm:     '🧠',
  python:  '🐍',
  shell:   '💻',
  AGENT:   '🤖',
  webhook: '🪝',
}

export const NodeSimulationCard: React.FC<{ node: NodeSim }> = ({ node }) => {
  const [expanded, setExpanded] = useState(false)
  const pct = Math.round(node.propagated_confidence * 100)

  const hasRisks    = node.risks.length > 0
  const hasCritical = node.risks.some(r => r.level === 'critical')
  const borderColor = hasCritical ? '#ef4444' : hasRisks ? '#f59e0b' : '#1e293b'

  return (
    <div
      style={{
        background: '#0f172a',
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* Icon + name */}
        <span style={{ fontSize: 16 }}>{TYPE_ICONS[node.node_type] ?? '⚙'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
            {node.node_id}
            <span style={{
              marginLeft: 8, fontSize: 10, color: '#475569',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {node.node_type}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            {node.simulation_note}
          </div>
        </div>

        {/* History badge */}
        {node.historical_run_count > 0 && (
          <div style={{
            fontSize: 10, color: '#64748b',
            background: '#1e293b', borderRadius: 4,
            padding: '2px 6px', whiteSpace: 'nowrap',
          }}>
            {node.historical_run_count} runs
          </div>
        )}

        {/* Duration */}
        <div style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>
          ~{node.predicted_duration_ms}ms
        </div>

        {/* Confidence bar + % */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 80, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`,
              height: '100%',
              background: node.confidence_color,
              borderRadius: 3,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, color: node.confidence_color, fontWeight: 700, minWidth: 36 }}>
            {pct}%
          </span>
        </div>

        {/* Risk badges */}
        {hasCritical && (
          <span style={{ fontSize: 10, background: '#1c0a0a', color: '#ef4444', borderRadius: 4, padding: '2px 6px', border: '1px solid #ef4444' }}>
            CRITICAL
          </span>
        )}
        {!hasCritical && hasRisks && (
          <span style={{ fontSize: 10, background: '#1c1200', color: '#f59e0b', borderRadius: 4, padding: '2px 6px', border: '1px solid #f59e0b' }}>
            ⚠ WARN
          </span>
        )}

        <span style={{ fontSize: 11, color: '#475569' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Confidence basis */}
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#475569' }}>
          {BASIS_LABELS[node.confidence_basis] ?? node.confidence_basis}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #1e293b' }}>

          {/* Predicted output */}
          <div style={{ fontSize: 11, color: '#64748b', margin: '12px 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Predicted output
          </div>
          <pre style={{
            background: '#020617',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 11,
            color: '#86efac',
            overflow: 'auto',
            maxHeight: 180,
            margin: 0,
          }}>
            {JSON.stringify(node.predicted_output, null, 2)}
          </pre>

          {/* Warnings */}
          {node.warnings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {node.warnings.map((w, i) => (
                <div key={i} style={{
                  fontSize: 11, color: '#f59e0b',
                  background: '#1c1200',
                  borderRadius: 4,
                  padding: '4px 8px',
                  marginBottom: 4,
                }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {/* Risks for this node */}
          {node.risks.map((r, i) => (
            <div key={i} style={{
              fontSize: 11,
              color:   r.level === 'critical' ? '#ef4444' : '#f59e0b',
              background: r.level === 'critical' ? '#1c0a0a' : '#1c1200',
              borderRadius: 4,
              padding: '6px 8px',
              marginTop: 6,
            }}>
              <strong>{r.level.toUpperCase()}:</strong> {r.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default NodeSimulationCard
