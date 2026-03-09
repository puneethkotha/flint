/**
 * Toggle — switch with color fade transition.
 * Use for all toggles; background color fades smoothly when toggled.
 */

import React from 'react'
import { useTheme } from '../theme'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  onColor?: string
  offColor?: string
  size?: { width: number; height: number; knob: number }
  ariaLabel?: string
}

export default function Toggle({
  checked,
  onChange,
  onColor = '#F59E0B',
  offColor,
  size = { width: 44, height: 24, knob: 20 },
  ariaLabel,
}: Props) {
  const { colors } = useTheme()
  const off = offColor ?? colors.panelBorder
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: size.width,
        height: size.height,
        borderRadius: size.height / 2,
        border: 'none',
        background: checked ? onColor : off,
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.2s ease',
      }}
      aria-label={ariaLabel ?? (checked ? 'Disable' : 'Enable')}
    >
      <div
        style={{
          position: 'absolute',
          top: (size.height - size.knob) / 2,
          left: checked ? size.width - size.knob - (size.height - size.knob) / 2 : (size.height - size.knob) / 2,
          width: size.knob,
          height: size.knob,
          borderRadius: '50%',
          background: colors.pageBg,
          transition: 'left 0.15s ease',
        }}
      />
    </button>
  )
}
