import React, { useState, useEffect, useRef } from 'react'
import { useTheme } from '../theme'

interface Props {
  onDone: () => void
}

export default function Intro({ onDone }: Props) {
  const { colors } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const tRef = useRef(0)
  const [phase, setPhase] = useState<'wave' | 'text' | 'tagline' | 'fade'>('wave')
  const [textVisible, setTextVisible] = useState(false)
  const [taglineVisible, setTaglineVisible] = useState(false)
  const [fading, setFading] = useState(false)

  // Sequence: wave shows immediately, text fades in at 600ms, tagline at 1300ms, fade out at 2400ms
  useEffect(() => {
    const t1 = setTimeout(() => { setTextVisible(true); setPhase('text') }, 500)
    const t2 = setTimeout(() => { setTaglineVisible(true); setPhase('tagline') }, 1100)
    const t3 = setTimeout(() => { setFading(true); setPhase('fade') }, 2400)
    const t4 = setTimeout(() => { onDone() }, 2900)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [onDone])

  // Sine wave animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      const pulse = Math.abs(Math.sin(tRef.current * Math.PI / 90))
      const amp = 14 + pulse * 12

      ctx.beginPath()
      ctx.strokeStyle = `rgba(245,158,11,${0.5 + pulse * 0.45})`
      ctx.lineWidth = 1.8
      ctx.shadowColor = '#F59E0B'
      ctx.shadowBlur = 6 + pulse * 10

      for (let x = 0; x <= W; x++) {
        const y = H / 2 + Math.sin((x / W) * Math.PI * 3.5 + tRef.current * 0.05) * amp
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
      tRef.current++
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
        background: colors.pageBg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.5s ease',
        zIndex: 9999,
        cursor: 'default',
      }}
    >
      {/* Wave */}
      <canvas
        ref={canvasRef}
        width={320}
        height={70}
        style={{
          opacity: 1,
          transition: 'opacity 0.4s',
        }}
      />

      {/* Brand + ready text */}
      <div
        style={{
          textAlign: 'center',
          opacity: textVisible ? 1 : 0,
          transform: textVisible ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ color: '#F59E0B', fontSize: 28, lineHeight: 1 }}>⚡</span>
          <span style={{
            fontFamily: 'ui-monospace, "Cascadia Code", monospace',
            fontWeight: 700,
            fontSize: 32,
            color: colors.textPrimary,
            letterSpacing: '-0.04em',
          }}>
            flint
          </span>
        </div>
        <p style={{
          fontSize: 18,
          fontWeight: 400,
          color: colors.textPrimary,
          letterSpacing: '-0.01em',
        }}>
          is ready.
        </p>
      </div>

      {/* Tagline */}
      <p
        style={{
          fontSize: 13,
          color: colors.textMuted,
          letterSpacing: '0.01em',
          opacity: taglineVisible ? 1 : 0,
          transform: taglineVisible ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          fontWeight: 400,
        }}
      >
        Describe any workflow in plain English.
      </p>

      {/* Skip hint */}
      <p
        style={{
          position: 'absolute',
          bottom: 32,
          fontSize: 11,
          color: colors.textMuted,
          opacity: taglineVisible ? 0.5 : 0,
          transition: 'opacity 0.4s ease',
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        click anywhere to skip
      </p>
    </div>
  )
}
