/**
 * Phase 3a: Expandable reasoning trace for AGENT nodes.
 * Drop into: dashboard/src/components/AgentNode/AgentReasoningTrace.tsx
 *
 * Render inside the node detail panel when selected node type === 'AGENT'.
 */

import React, { useState } from 'react'

interface ToolCall {
  tool: string
  input: Record<string, unknown>
  result: unknown
  duration_ms: number
}

interface AgentReasoningTraceProps {
  trace: ToolCall[]
  totalTokens?: number
  agentDurationMs?: number
}

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Search',
  http_fetch: 'HTTP',
  python_exec: 'Python',
}

export const AgentReasoningTrace: React.FC<AgentReasoningTraceProps> = ({
  trace,
  totalTokens,
  agentDurationMs,
}) => {
  const [expanded, setExpanded] = useState(false)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  if (!trace || trace.length === 0) return null

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 8,
        marginTop: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header — click to toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#a78bfa',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          🧠 Agent reasoning trace ({trace.length} steps)
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          {expanded ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          {/* Stats row */}
          {(totalTokens || agentDurationMs) && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: '#64748b' }}>
              {totalTokens && <span>🪙 {totalTokens.toLocaleString()} tokens</span>}
              {agentDurationMs && <span>⏱ {agentDurationMs}ms total</span>}
            </div>
          )}

          {/* Steps */}
          {trace.map((step, i) => (
            <div
              key={i}
              style={{
                borderLeft: '2px solid #334155',
                paddingLeft: 12,
                marginBottom: 10,
              }}
            >
              <button
                onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 0,
                  color: '#cbd5e1',
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                <span>{TOOL_LABELS[step.tool] ?? 'Tool'}</span>
                <span style={{ color: '#a78bfa' }}>{step.tool}</span>
                <span style={{ color: '#475569', fontSize: 10 }}>({step.duration_ms}ms)</span>
                <span style={{ color: '#475569', fontSize: 10 }}>
                  {expandedStep === i ? '-' : '+'}
                </span>
              </button>

              {expandedStep === i && (
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  <div style={{ color: '#64748b', marginBottom: 4 }}>Input:</div>
                  <pre
                    style={{
                      background: '#1e293b',
                      borderRadius: 4,
                      padding: '6px 8px',
                      color: '#94a3b8',
                      fontSize: 10,
                      overflow: 'auto',
                      maxHeight: 120,
                      margin: '0 0 8px',
                    }}
                  >
                    {JSON.stringify(step.input, null, 2)}
                  </pre>
                  <div style={{ color: '#64748b', marginBottom: 4 }}>Result:</div>
                  <pre
                    style={{
                      background: '#1e293b',
                      borderRadius: 4,
                      padding: '6px 8px',
                      color: '#86efac',
                      fontSize: 10,
                      overflow: 'auto',
                      maxHeight: 120,
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(step.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AgentReasoningTrace
