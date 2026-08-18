import React, { memo, useEffect, useRef } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { useTheme } from '../../theme'

const TYPE_COLOR: Record<string, string> = {
  http: '#2563eb', shell: '#7c3aed', python: '#0891b2',
  webhook: '#d97706', sql: '#059669', llm: '#db2777', agent: '#F59E0B',
}

export type HealStatus = 'pending' | 'scanning' | 'vulnerable' | 'diagnosing' | 'patching' | 'healed'

export interface HealNodeData {
  label: string
  type: string
  status: HealStatus
  vulnCount?: number
  fixCount?: number
}

const STATUS_STYLE: Record<HealStatus, { border: string; dot: string; glow?: string; anim?: string }> = {
  pending:    { border: '#26262a', dot: '#444' },
  scanning:   { border: '#F59E0B', dot: '#F59E0B', anim: 'healAmber 1.4s ease-in-out infinite' },
  vulnerable: { border: '#ef4444', dot: '#ef4444', anim: 'healRed 1.1s ease-in-out infinite' },
  diagnosing: { border: '#f59e0b', dot: '#fbbf24', anim: 'healAmber 1.2s ease-in-out infinite' },
  patching:   { border: '#7c3aed', dot: '#a78bfa', anim: 'healViolet 1.0s ease-in-out infinite' },
  healed:     { border: '#10b981', dot: '#10b981' },
}

function HealNode({ data }: NodeProps<HealNodeData>) {
  const { colors } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const prev = useRef(data.status)
  const typeColor = TYPE_COLOR[data.type] || '#6b7280'
  const s = STATUS_STYLE[data.status] ?? STATUS_STYLE.pending
  // Pending is neutral chrome (not a status hue) — let it adapt to the theme.
  const borderColor = data.status === 'pending' ? colors.panelBorder : s.border
  const dotColor = data.status === 'pending' ? colors.textMuted : s.dot

  // Green pop when a node becomes healed.
  useEffect(() => {
    if (data.status === 'healed' && prev.current !== 'healed' && ref.current) {
      ref.current.animate([
        { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(16,185,129,0)' },
        { transform: 'scale(1.06)', boxShadow: '0 0 16px 4px rgba(16,185,129,0.5)' },
        { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(16,185,129,0)' },
      ], { duration: 500, easing: 'ease-out' })
    }
    prev.current = data.status
  }, [data.status])

  const label =
    data.status === 'vulnerable' && data.vulnCount ? `${data.vulnCount} risk${data.vulnCount > 1 ? 's' : ''}`
    : data.status === 'diagnosing' ? 'diagnosing'
    : data.status === 'patching' ? 'patching'
    : data.status === 'healed' ? 'healed'
    : data.status === 'scanning' ? 'scanning'
    : ''

  return (
    <>
      <style>{`
        @keyframes healRed { 0%,100%{box-shadow:0 0 4px 1px rgba(239,68,68,.35);border-color:#ef4444} 50%{box-shadow:0 0 12px 4px rgba(239,68,68,.7);border-color:#f87171} }
        @keyframes healViolet { 0%,100%{box-shadow:0 0 5px 1px rgba(124,58,237,.4);border-color:#7c3aed} 50%{box-shadow:0 0 14px 4px rgba(124,58,237,.8);border-color:#a78bfa} }
        @keyframes healAmber { 0%,100%{box-shadow:0 0 4px 1px rgba(245,158,11,.35);border-color:#F59E0B} 50%{box-shadow:0 0 12px 3px rgba(245,158,11,.7);border-color:#FCD34D} }
        @keyframes healDot { 0%,100%{opacity:1} 50%{opacity:.35} }
      `}</style>

      <Handle type="target" position={Position.Left}
        style={{ background: colors.panelBg, border: `1px solid ${colors.handle}`, width: 7, height: 7 }} />

      <div ref={ref} style={{
        background: colors.panelBg,
        border: `1px solid ${borderColor}`,
        padding: '10px 14px', minWidth: 150, maxWidth: 210, borderRadius: 4,
        transition: 'border-color 0.3s, background 0.2s',
        animation: s.anim ?? 'none',
        opacity: data.status === 'pending' ? 0.55 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0,
            animation: (data.status !== 'pending' && data.status !== 'healed') ? 'healDot 1.2s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontSize: 12, fontWeight: 500, color: colors.textSecondary,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{data.label}</span>
        </div>
        <div style={{ paddingLeft: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 600, fontFamily: 'ui-monospace, monospace',
            color: typeColor, background: typeColor + '15', padding: '2px 5px',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>{data.type}</span>
          {label && (
            <span style={{
              fontSize: 10, fontWeight: 500,
              color: s.dot,
              fontFamily: 'ui-monospace, monospace',
            }}>{label}</span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right}
        style={{ background: colors.panelBg, border: `1px solid ${colors.handle}`, width: 7, height: 7 }} />
    </>
  )
}

export default memo(HealNode)
