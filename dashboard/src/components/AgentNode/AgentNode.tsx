/**
 * Phase 3a: AGENT node — renders as a hexagon with animated border.
 * Drop into: dashboard/src/components/AgentNode/AgentNode.tsx
 *
 * Register in DAGVisualization:
 *   import AgentNode from '../AgentNode/AgentNode'
 *   const nodeTypes = { ..., AGENT: AgentNode }
 */

import React, { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'

interface AgentNodeData {
  label: string
  status?: 'pending' | 'running' | 'completed' | 'failed'
  config?: {
    prompt?: string
    max_iterations?: number
  }
  metadata?: {
    reasoning_trace?: Array<{
      tool: string
      input: Record<string, unknown>
      result: unknown
      duration_ms: number
    }>
    total_tokens?: number
    agent_duration_ms?: number
  }
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',
  running: '#f59e0b',
  completed: '#10b981',
  failed: '#ef4444',
}

export const AgentNode = memo(({ data, selected }: NodeProps<AgentNodeData>) => {
  const status = data.status || 'pending'
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.pending
  const isRunning = status === 'running'
  const traceCount = data.metadata?.reasoning_trace?.length ?? 0

  return (
    <div style={{ position: 'relative', width: 140, height: 120 }}>
      {/* Animated pulse ring when running */}
      {isRunning && (
        <div
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            border: `2px solid ${color}`,
            animation: 'agent-pulse 1.5s ease-in-out infinite',
            opacity: 0.6,
          }}
        />
      )}

      {/* Hexagon SVG background */}
      <svg
        width="140"
        height="120"
        viewBox="0 0 140 120"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <polygon
          points="70,4 134,34 134,86 70,116 6,86 6,34"
          fill="#1e1e2e"
          stroke={selected ? '#a78bfa' : color}
          strokeWidth={selected ? 2.5 : 1.5}
        />
        {/* Subtle gradient overlay */}
        <polygon
          points="70,4 134,34 134,86 70,116 6,86 6,34"
          fill="url(#agentGradient)"
          opacity={0.15}
        />
        <defs>
          <linearGradient id="agentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>

      {/* Node content */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px 12px',
          boxSizing: 'border-box',
        }}
      >
        {/* Robot emoji + label */}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>Agent</div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#e2e8f0',
            textAlign: 'center',
            lineHeight: 1.3,
            maxWidth: 90,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={data.label}
        >
          {data.label}
        </div>
        <div
          style={{
            fontSize: 9,
            color: color,
            marginTop: 4,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          AGENT
        </div>
        {traceCount > 0 && (
          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
            {traceCount} tool{traceCount !== 1 ? 's' : ''} called
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />

      {/* CSS animation */}
      <style>{`
        @keyframes agent-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.08); opacity: 0.2; }
        }
      `}</style>
    </div>
  )
})

AgentNode.displayName = 'AgentNode'
export default AgentNode
