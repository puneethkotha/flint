import React, { memo, useEffect, useRef } from 'react'
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

export interface TaskNodeData {
  label: string
  type: string
  status: string
}

function TaskNode({ data }: NodeProps<TaskNodeData>) {
  const { colors } = useTheme()
  const nodeRef = useRef<HTMLDivElement>(null)
  const prevStatus = useRef(data.status)
  const typeColor = TYPE_COLOR[data.type] || '#6b7280'

  // Completed: green scale pulse on status change
  useEffect(() => {
    if (data.status === 'completed' && prevStatus.current !== 'completed') {
      const el = nodeRef.current
      if (!el) return
      el.animate([
        { transform: 'scale(1)', boxShadow: '0 0 0 0 #22c55e00' },
        { transform: 'scale(1.05)', boxShadow: '0 0 12px 3px #22c55e55' },
        { transform: 'scale(1)', boxShadow: '0 0 0 0 #22c55e00' },
      ], { duration: 400, easing: 'ease-out' })
    }
    prevStatus.current = data.status
  }, [data.status])

  const borderColor =
    data.status === 'completed' ? '#166534'
    : data.status === 'failed'  ? '#7f1d1d'
    : data.status === 'running' ? '#F59E0B'
    : colors.panelBorder

  const dotColor =
    data.status === 'completed' ? '#22c55e'
    : data.status === 'failed'  ? '#ef4444'
    : data.status === 'running' ? '#F59E0B'
    : '#444'

  return (
    <>
      <style>{`
        @keyframes amberGlow {
          0%, 100% { box-shadow: 0 0 4px 1px #F59E0B44; border-color: #F59E0B; }
          50%       { box-shadow: 0 0 10px 3px #F59E0B88; border-color: #FCD34D; }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>

      <Handle
        type="target" position={Position.Left}
        style={{ background: colors.panelBg, border: `1px solid ${colors.handle}`, width: 7, height: 7 }}
      />

      <div
        ref={nodeRef}
        style={{
          background: colors.panelBg,
          border: `1px solid ${borderColor}`,
          padding: '10px 14px',
          minWidth: 148, maxWidth: 210,
          borderRadius: 2,
          transition: 'border-color 0.3s, background 0.2s',
          animation: data.status === 'running' ? 'amberGlow 2s ease-in-out infinite' : 'none',
        }}
      >
        {/* Status dot + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: dotColor, flexShrink: 0,
            animation: data.status === 'running' ? 'dotPulse 1.2s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontSize: 12, fontWeight: 500, color: colors.textSecondary,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}>
            {data.label}
          </span>
        </div>

        {/* Type badge */}
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
                : data.status === 'running' ? '#F59E0B'
                : colors.textMuted,
            }}>
              {data.status}
            </span>
          )}
        </div>
      </div>

      <Handle
        type="source" position={Position.Right}
        style={{ background: colors.panelBg, border: `1px solid ${colors.handle}`, width: 7, height: 7 }}
      />
    </>
  )
}

export default memo(TaskNode)
