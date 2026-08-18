import React, { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../theme'

interface Props {
  /** Target score 0-100. The ring animates toward this value. */
  value: number
  grade?: string
  size?: number
  label?: string
}

function scoreColor(v: number): string {
  if (v >= 90) return '#10b981'  // emerald
  if (v >= 75) return '#22c55e'
  if (v >= 60) return '#F59E0B'  // amber
  if (v >= 40) return '#f97316'
  return '#ef4444'               // red
}

/** Circular gauge that tweens from its previous value to `value`. */
export const ReliabilityRing: React.FC<Props> = ({ value, grade, size = 132, label }) => {
  const { colors } = useTheme()
  const [display, setDisplay] = useState(value)
  const rafRef = useRef<number | null>(null)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    const to = value
    const start = performance.now()
    const dur = 900
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(Math.round(from + (to - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value])

  const stroke = 9
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, display)) / 100
  const color = scoreColor(display)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.panelBorder} strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
            style={{ transition: 'stroke 0.4s' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: size * 0.30, fontWeight: 700, color, lineHeight: 1, fontFamily: 'ui-monospace, monospace' }}>
            {display}
          </span>
          {grade && (
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, marginTop: 2 }}>
              grade {grade}
            </span>
          )}
        </div>
      </div>
      {label && <span style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>}
    </div>
  )
}

export default ReliabilityRing
