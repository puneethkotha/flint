import React, { useEffect, useRef, useState } from 'react'
import { useTheme } from '../theme'

interface Props {
  onDone: () => void
}

export default function Intro({ onDone }: Props) {
  const { colors } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const [fading, setFading] = useState(false)

  const AMBER = '#F59E0B'
  const BG = colors.pageBg

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    let frame = 0
    const TOTAL = 160 // ~2.7s then fade

    const draw = () => {
      frame++
      ctx.clearRect(0, 0, W, H)

      const fadeIn = Math.min(1, frame / 20)
      const fadeOut = frame > TOTAL ? Math.max(0, 1 - (frame - TOTAL) / 30) : 1
      const alpha = fadeIn * fadeOut

      // Amplitude pulses gently
      const pulse = Math.abs(Math.sin(frame * Math.PI / 120))
      const amp = 18 + pulse * 10

      ctx.beginPath()
      ctx.shadowColor = AMBER
      ctx.shadowBlur = 6 + pulse * 8
      ctx.strokeStyle = `rgba(245,158,11,${alpha * 0.9})`
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      for (let x = 0; x <= W; x++) {
        const y = H / 2 + Math.sin((x / W) * Math.PI * 3.5 + frame * 0.045) * amp
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      if (frame > TOTAL + 30) {
        setFading(true)
        setTimeout(onDone, 400)
        cancelAnimationFrame(frameRef.current)
        return
      }

      frameRef.current = requestAnimationFrame(draw)
    }

    frameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  return (
    <div
      onClick={onDone}
      style={{
        position: 'fixed', inset: 0,
        background: BG,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.4s ease',
        zIndex: 9999,
        cursor: 'pointer',
      }}
    >
      <canvas ref={canvasRef} width={400} height={120} />
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 24, fontWeight: 600, color: colors.textPrimary, letterSpacing: '-0.03em', marginBottom: 4 }}>
          flint
        </p>
        <p style={{ fontSize: 13, color: colors.textMuted }}>
          Describe any workflow in plain English.
        </p>
      </div>
    </div>
  )
}
