import React from 'react'

/**
 * Flint brand mark — a struck-flint facet in an amber tile. Crisp SVG (sharp at
 * any size, theme-independent) replacing the old PNG logo. Use `size` to scale.
 */
export function FlintMark({ size = 36, radius }: { size?: number; radius?: number }) {
  const r = radius ?? size * 0.28
  const uid = `flintg-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FCD34D" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx={r} fill={`url(#${uid})`} />
      {/* struck-flint facet, engraved in warm ink */}
      <path d="M20 8 L31 20 L20 32 L9 20 Z" stroke="#2a1a03" strokeWidth="2" strokeLinejoin="round" opacity="0.92" />
      <path d="M20 14 L26 20 L20 26 L14 20 Z" fill="#2a1a03" opacity="0.92" />
    </svg>
  )
}

export default FlintMark
