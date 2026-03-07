import React, { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'

const TYPE_ICONS: Record<string, string> = {
  http: '🌐',
  shell: '💻',
  python: '🐍',
  webhook: '🪝',
  sql: '🗄️',
  llm: '🤖',
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending:   { bg: '#1a1a1a', border: '#444', text: '#888' },
  running:   { bg: '#0a1a3a', border: '#3b82f6', text: '#60a5fa' },
  completed: { bg: '#0a1a0a', border: '#22c55e', text: '#86efac' },
  failed:    { bg: '#1a0a0a', border: '#ef4444', text: '#fca5a5' },
  skipped:   { bg: '#1a1a1a', border: '#666', text: '#666' },
}

export interface TaskNodeData {
  label: string
  type: string
  status: string
}

function TaskNode({ data }: NodeProps<TaskNodeData>) {
  const colors = STATUS_COLORS[data.status] || STATUS_COLORS.pending
  const icon = TYPE_ICONS[data.type] || '⚙️'
  const isRunning = data.status === 'running'

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: '#444' }} />
      <div
        style={{
          background: colors.bg,
          border: `2px solid ${colors.border}`,
          borderRadius: 10,
          padding: '10px 16px',
          minWidth: 150,
          maxWidth: 200,
          boxShadow: isRunning ? `0 0 16px ${colors.border}55` : 'none',
          animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : 'none',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: colors.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {data.label}
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
              {data.type} · {data.status}
            </div>
          </div>
          {data.status === 'completed' && <span style={{ color: '#22c55e', fontSize: 12 }}>✓</span>}
          {data.status === 'failed' && <span style={{ color: '#ef4444', fontSize: 12 }}>✗</span>}
          {data.status === 'running' && (
            <span style={{ color: '#3b82f6', fontSize: 12, animation: 'spin 1s linear infinite' }}>⟳</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#444' }} />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

export default memo(TaskNode)
