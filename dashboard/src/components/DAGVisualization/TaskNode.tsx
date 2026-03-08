import React, { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { useTheme } from '../../theme'

const TYPE_COLOR: Record<string, string> = {
  http:    '#2563eb',
  shell:   '#7c3aed',
  python:  '#0891b2',
  webhook: '#d97706',
  sql:     '#059669',
  llm:     '#db2777',
}

const STATUS_CONFIG: Record<string, { dot: string; glow?: string }> = {
  pending:   { dot: '#9ca3af' },
  running:   { dot: '#f5f5f5', glow: '0 0 8px #ffffff33' },
  completed: { dot: '#22c55e' },
  failed:    { dot: '#ef4444' },
  skipped:   { dot: '#9ca3af' },
}

export interface TaskNodeData {
  label: string
  type: string
  status: string
}

function TaskNode({ data }: NodeProps<TaskNodeData>) {
  const { colors, theme } = useTheme()
  const isLight = theme === 'light'
  const s = STATUS_CONFIG[data.status] || STATUS_CONFIG.pending
  const typeColor = TYPE_COLOR[data.type] || '#6b7280'
  const isRunning = data.status === 'running'

  const borderColor = data.status === 'completed' ? (isLight ? '#bbf7d0' : '#1e3a1e')
    : data.status === 'failed' ? (isLight ? '#fecaca' : '#3a1e1e')
    : data.status === 'running' ? (isLight ? '#d1d5db' : '#555')
    : colors.panelBorder

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: colors.panelBg, border: `1px solid ${colors.handle}`, width: 7, height: 7 }}
      />
      <div style={{
        background: colors.panelBg,
        border: `1px solid ${borderColor}`,
        padding: '10px 14px',
        minWidth: 148, maxWidth: 210,
        animation: isRunning ? 'nodePulse 2s ease-in-out infinite' : 'none',
        transition: 'border-color 0.3s, background 0.2s',
        borderRadius: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isLight && data.status === 'running' ? '#374151' : s.dot,
            flexShrink: 0,
            boxShadow: !isLight ? s.glow : undefined,
          }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
            {data.label}
          </span>
        </div>
        <div style={{ paddingLeft: 14 }}>
          <span style={{
            display: 'inline-block', fontSize: 9, fontWeight: 600,
            fontFamily: 'ui-monospace, monospace',
            color: typeColor, background: typeColor + '15',
            padding: '2px 5px', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            {data.type}
          </span>
          {data.status !== 'pending' && (
            <span style={{
              fontSize: 10, marginLeft: 8,
              color: data.status === 'completed' ? '#22c55e'
                : data.status === 'failed' ? '#ef4444'
                : colors.textMuted,
            }}>
              {data.status}
            </span>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: colors.panelBg, border: `1px solid ${colors.handle}`, width: 7, height: 7 }}
      />
      <style>{`
        @keyframes nodePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </>
  )
}

export default memo(TaskNode)
