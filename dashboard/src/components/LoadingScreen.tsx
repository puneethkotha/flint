/**
 * LoadingScreen — full-screen splash shown on first load only.
 * Logo in the middle, pulsing, subheading below.
 */

import React, { useState, useEffect } from 'react'

const SESSION_KEY = 'flint-splash-shown'
const DURATION_MS = 2500
const FADE_MS = 300

const LOGO_SRC = '/flint-logo.png'

export const LoadingScreen: React.FC<{
  onComplete: () => void
}> = ({ onComplete }) => {
  const [opacity, setOpacity] = useState(1)
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setOpacity(0), DURATION_MS)
    const unmountTimer = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, '1')
      setMounted(false)
      onComplete()
    }, DURATION_MS + FADE_MS)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(unmountTimer)
    }
  }, [onComplete])

  if (!mounted) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#080808',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        opacity,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    >
      <style>{`
        @keyframes flint-logo-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        .flint-splash-logo {
          animation: flint-logo-pulse 2s ease-in-out infinite;
        }
      `}</style>

      <div className="flint-splash-logo" style={{ marginBottom: 16 }}>
        <img src={LOGO_SRC} alt="Flint" width={140} height={140} style={{ display: 'block' }} />
      </div>

      <div style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 18,
        fontWeight: 500,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: '0.15em',
      }}>
        flint
      </div>
    </div>
  )
}

/** Check if splash should be shown (first load only) */
export function shouldShowSplash(): boolean {
  return !sessionStorage.getItem(SESSION_KEY)
}

export default LoadingScreen
