/**
 * NodeSimulationCard — per-node predicted output with confidence bar.
 */

import React, { useState } from 'react'
import { useTheme } from '../../theme'

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
  historical_high_volume:  'High-volume history',
  historical_medium_volume:'Medium history',
  historical_low_volume:    'Low history',
  claude_api_knowledge:    'LLM knowledge',
  sandbox_execution:       'Sandbox executed',
  deterministic:           'Deterministic',
  propagated_uncertainty:  'Propagated',
}

export const NodeSimulationCard: React.FC<{ node: NodeSim }> = ({ node }) => {
  const { colors } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const pct = Math.round(node.propagated_confidence * 100)

  const hasRisks    = node.risks.length > 0
  const hasCritical = node.risks.some(r => r.level === 'critical')

  return (
    <div
      style={{
        background: colors.statCardBg,
        border: `1px solid ${colors.panelBorder}`,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
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
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.node_id}
            <span style={{
              marginLeft: 8, fontSize: 10, color: colors.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {node.node_type}
            </span>
          </div>
          <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2, lineHeight: 1.3 }}>
            {node.simulation_note}
          </div>
        </div>

        {node.historical_run_count > 0 && (
          <div style={{
            fontSize: 10, color: colors.textMuted,
            background: colors.rowAlt, borderRadius: 4,
            padding: '2px 6px', whiteSpace: 'nowrap',
          }}>
            {node.historical_run_count} runs
          </div>
        )}

        <div style={{ fontSize: 11, color: colors.textMuted, whiteSpace: 'nowrap' }}>
          ~{node.predicted_duration_ms}ms
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 80, height: 5, background: colors.divider, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`,
              height: '100%',
              background: colors.textMuted,
              borderRadius: 2,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, color: colors.textMuted, fontWeight: 600, minWidth: 36 }}>
            {pct}%
          </span>
        </div>

        {hasCritical && (
          <span style={{ fontSize: 10, background: colors.rowAlt, color: colors.textSecondary, borderRadius: 4, padding: '2px 6px', border: `1px solid ${colors.panelBorder}` }}>
            CRITICAL
          </span>
        )}
        {!hasCritical && hasRisks && (
          <span style={{ fontSize: 10, background: colors.rowAlt, color: colors.textMuted, borderRadius: 4, padding: '2px 6px', border: `1px solid ${colors.panelBorder}` }}>
            WARN
          </span>
        )}

        <span style={{ fontSize: 11, color: colors.textMuted }}>{expanded ? '−' : '+'}</span>
      </button>

      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: colors.textMuted }}>
          {BASIS_LABELS[node.confidence_basis] ?? node.confidence_basis}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${colors.panelBorder}` }}>
          <div style={{ fontSize: 11, color: colors.textMuted, margin: '12px 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Predicted output
          </div>
          <pre style={{
            background: colors.inputBg,
            borderRadius: 4,
            padding: '10px 12px',
            fontSize: 11,
            color: colors.textMuted,
            overflow: 'auto',
            maxHeight: 180,
            margin: 0,
          }}>
            {JSON.stringify(node.predicted_output, null, 2)}
          </pre>

          {node.warnings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {node.warnings.map((w, i) => (
                <div key={i} style={{
                  fontSize: 11, color: colors.textMuted,
                  background: colors.rowAlt,
                  borderRadius: 4,
                  padding: '4px 8px',
                  marginBottom: 4,
                }}>
                  {w}
                </div>
              ))}
            </div>
          )}

          {node.risks.map((r, i) => (
            <div key={i} style={{
              fontSize: 11,
              color: colors.textMuted,
              background: colors.rowAlt,
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
