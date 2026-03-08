import React, { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'

const TYPE_COLOR: Record<string, string> = {
  http:    '#2563eb',
  shell:   '#7c3aed',
  python:  '#0891b2',
  webhook: '#d97706',
  sql:     '#059669',
  llm:     '#db2777',
}

const STATUS_CONFIG: Record<string, { border: string; dot: string; glow?: string }> = {
  pending:   { border: '#1e1e1e', dot: '#333' },
  running:   { border: '#555',   dot: '#f5f5f5', glow: '0 0 8px #ffffff33' },
  completed: { border: '#1e3a1e', dot: '#22c55e' },
  failed:    { border: '#3a1e1e', dot: '#ef4444' },
  skipped:   { border: '#1e1e1e', dot: '#333' },
}

export interface TaskNodeData {
  label: string
  type: string
  status: string
}

function TaskNode({ data }: NodeProps<TaskNodeData>) {
  const s = STATUS_CONFIG[data.status] || STATUS_CONFIG.pending
  const typeColor = TYPE_COLOR[data.type] || '#555'
  const isRunning = data.status === 'running'

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', width: 7, height: 7 }}
      />
      <div style={{
        background: '#0f0f0f',
        border: `1px solid ${s.border}`,
        padding: '10px 14px',
        minWidth: 148,
        maxWidth: 210,
        animation: isRunning ? 'nodePulse 2s ease-in-out infinite' : 'none',
        transition: 'border-color 0.3s',
        borderRadius: 2,
      }}>
        {/* Status dot + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: s.dot,
            flexShrink: 0,
            boxShadow: s.glow,
          }} />
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#e5e5e5',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}>
            {data.label}
          </span>
        </div>

        {/* Type badge */}
        <div style={{ paddingLeft: 14 }}>
          <span style={{
            display: 'inline-block',
            fontSize: 9,
            fontWeight: 600,
            fontFamily: 'ui-monospace, monospace',
            color: typeColor,
            background: typeColor + '15',
            padding: '2px 5px',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {data.type}
          </span>
          {data.status !== 'pending' && (
            <span style={{
              fontSize: 10,
              color: data.status === 'completed' ? '#22c55e'
                : data.status === 'failed' ? '#ef4444'
                : data.status === 'running' ? '#999'
                : '#555',
              marginLeft: 8,
            }}>
              {data.status}
            </span>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', width: 7, height: 7 }}
      />
      <style>{`
        @keyframes nodePulse {
          0%, 100% { border-color: #555; }
          50% { border-color: #888; }
        }
      `}</style>
    </>
  )
}

export default memo(TaskNode)
