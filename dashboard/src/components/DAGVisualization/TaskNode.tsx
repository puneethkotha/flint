import React, { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'

const TYPE_LABEL: Record<string, string> = {
  http: 'http',
  shell: 'shell',
  python: 'python',
  webhook: 'webhook',
  sql: 'sql',
  llm: 'llm',
}

const STATUS_STYLE: Record<string, { border: string; labelColor: string; dot: string }> = {
  pending:   { border: '#1e1e1e', labelColor: '#6b7280', dot: '#3a3a3a' },
  running:   { border: '#2563eb', labelColor: '#93c5fd', dot: '#2563eb' },
  completed: { border: '#166534', labelColor: '#86efac', dot: '#22c55e' },
  failed:    { border: '#7f1d1d', labelColor: '#fca5a5', dot: '#ef4444' },
  skipped:   { border: '#1e1e1e', labelColor: '#6b7280', dot: '#3a3a3a' },
}

export interface TaskNodeData {
  label: string
  type: string
  status: string
}

function TaskNode({ data }: NodeProps<TaskNodeData>) {
  const s = STATUS_STYLE[data.status] || STATUS_STYLE.pending
  const isRunning = data.status === 'running'

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#2a2a2a', border: '1px solid #1e1e1e', width: 8, height: 8 }}
      />
      <div
        style={{
          background: '#111111',
          border: `1px solid ${s.border}`,
          borderRadius: 6,
          padding: '10px 14px',
          minWidth: 140,
          maxWidth: 200,
          animation: isRunning ? 'nodePulse 2s ease-in-out infinite' : 'none',
          transition: 'border-color 0.3s',
        }}
      >
        {/* Top row: dot + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: s.dot,
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#f5f5f5',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {data.label}
          </span>
        </div>

        {/* Bottom row: type badge */}
        <div style={{ paddingLeft: 14 }}>
          <span style={{
            fontSize: 10,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {TYPE_LABEL[data.type] || data.type}
            {data.status !== 'pending' && (
              <span style={{ color: s.labelColor, marginLeft: 6 }}>{data.status}</span>
            )}
          </span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#2a2a2a', border: '1px solid #1e1e1e', width: 8, height: 8 }}
      />
      <style>{`
        @keyframes nodePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
      `}</style>
    </>
  )
}

export default memo(TaskNode)
