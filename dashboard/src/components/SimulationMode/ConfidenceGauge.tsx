/**
 * ConfidenceGauge — circular gauge showing overall simulation confidence.
 */

import React from 'react'
import { useTheme } from '../../theme'

interface Props {
  value:               number   // 0–1
  summary:             string
  calibrationAccuracy: number | null
}

export const ConfidenceGauge: React.FC<Props> = ({ value, summary, calibrationAccuracy }) => {
  const { colors } = useTheme()
  const pct    = Math.round(value * 100)
  const radius = 36
  const circ   = 2 * Math.PI * radius
  const dash   = circ * value

  return (
    <div style={{
      background: colors.statCardBg,
      border: `1px solid ${colors.panelBorder}`,
      borderRadius: 4,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      flex: '1 1 200px',
      minWidth: 0,
    }}>
      <div style={{ flexShrink: 0 }}>
        <svg width={64} height={64} viewBox="0 0 88 88">
          <circle cx={44} cy={44} r={radius} fill="none" stroke={colors.divider} strokeWidth={8} />
          <circle
            cx={44} cy={44} r={radius}
            fill="none"
            stroke={colors.textMuted}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            transform="rotate(-90 44 44)"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
          <text x={44} y={44} textAnchor="middle" dominantBaseline="middle"
            fontSize={16} fontWeight={600} fill={colors.textSecondary}>
            {pct}%
          </text>
        </svg>
        <div style={{ fontSize: 9, color: colors.textMuted, textAlign: 'center', marginTop: 2 }}>
          confidence
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{
          fontSize: 12,
          color: colors.textMuted,
          lineHeight: 1.4,
          marginBottom: 6,
          overflowWrap: 'break-word',
          wordBreak: 'normal',
        }}>
          {summary}
        </div>
        {calibrationAccuracy != null && (
          <div style={{
            fontSize: 10,
            color: colors.textMuted,
            background: colors.rowAlt,
            borderRadius: 4,
            padding: '3px 7px',
            display: 'inline-block',
          }}>
            Historical accuracy: {(calibrationAccuracy * 100).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  )
}

export default ConfidenceGauge
