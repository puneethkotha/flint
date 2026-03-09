/**
 * ConfidenceGauge — circular gauge showing overall simulation confidence.
 * Drop into: dashboard/src/components/SimulationMode/ConfidenceGauge.tsx
 */

import React from 'react'

interface Props {
  value:               number   // 0–1
  summary:             string
  calibrationAccuracy: number | null
}

export const ConfidenceGauge: React.FC<Props> = ({ value, summary, calibrationAccuracy }) => {
  const pct    = Math.round(value * 100)
  const radius = 36
  const circ   = 2 * Math.PI * radius
  const dash   = circ * value
  const color  = value >= 0.85 ? '#10b981' : value >= 0.65 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{
      background: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: 8,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flex: '1 1 200px',
    }}>
      {/* SVG gauge */}
      <svg width={88} height={88} viewBox="0 0 88 88">
        {/* Background ring */}
        <circle
          cx={44} cy={44} r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={8}
        />
        {/* Progress ring */}
        <circle
          cx={44} cy={44} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 44 44)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        {/* Center text */}
        <text x={44} y={44} textAnchor="middle" dominantBaseline="middle"
          fontSize={18} fontWeight={700} fill={color}>
          {pct}%
        </text>
        <text x={44} y={58} textAnchor="middle" fontSize={8} fill="#475569">
          confidence
        </text>
      </svg>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 6 }}>
          {summary}
        </div>
        {calibrationAccuracy != null && (
          <div style={{
            fontSize: 10,
            color: calibrationAccuracy >= 0.8 ? '#10b981' : '#f59e0b',
            background: calibrationAccuracy >= 0.8 ? '#022c22' : '#1c1200',
            borderRadius: 4,
            padding: '3px 7px',
            display: 'inline-block',
          }}>
            ✓ Historical accuracy: {(calibrationAccuracy * 100).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  )
}

export default ConfidenceGauge
