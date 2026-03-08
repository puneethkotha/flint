import React, { useEffect, useRef, useState } from 'react'
import { useTheme } from '../theme'

interface Props {
  onDone: () => void
}

// Sample N evenly-spaced points along a canvas Path2D-style curve
// We define the flame outline as a series of bezier segments
// and sample them parametrically
function sampleFlame(cx: number, cy: number, scale: number, N: number): [number, number][] {
  // Flame outline defined as cubic bezier segments [p0, c1, c2, p1]
  // Coordinates relative to center, scale 1 = original size (~100px tall)
  const segments: [number, number, number, number, number, number, number, number][] = [
    // Outer flame — top tip down right side
    [0, -1.00,   0.38,-0.60,  0.62,-0.20,  0.55, 0.10],
    [0.55, 0.10, 0.52, 0.35,  0.38, 0.48,  0.22, 0.42],
    // Right lower inner loop
    [0.22, 0.42, 0.36, 0.30,  0.34, 0.12,  0.16, 0.12],
    [0.16, 0.12, 0.06, 0.12,  0.02, 0.22,  0.06, 0.32],
    // Bottom center crossing
    [0.06, 0.32, 0.10, 0.42,  0.05, 0.52, -0.05, 0.52],
    [-0.05, 0.52,-0.10, 0.52, -0.10, 0.42, -0.06, 0.32],
    // Left lower inner loop
    [-0.06, 0.32,-0.02, 0.22, -0.06, 0.12, -0.16, 0.12],
    [-0.16, 0.12,-0.34, 0.12, -0.36, 0.30, -0.22, 0.42],
    // Left outer down-up
    [-0.22, 0.42,-0.38, 0.48, -0.52, 0.35, -0.55, 0.10],
    [-0.55, 0.10,-0.62,-0.20, -0.38,-0.60,  0.00,-1.00],
  ]

  const points: [number, number][] = []
  const perSeg = Math.ceil(N / segments.length)

  for (const [x0, y0, cx1, cy1, cx2, cy2, x1, y1] of segments) {
    for (let i = 0; i < perSeg; i++) {
      const t = i / perSeg
      const mt = 1 - t
      const bx = mt*mt*mt*x0 + 3*mt*mt*t*cx1 + 3*mt*t*t*cx2 + t*t*t*x1
      const by = mt*mt*mt*y0 + 3*mt*mt*t*cy1 + 3*mt*t*t*cy2 + t*t*t*y1
      points.push([cx + bx * scale, cy + by * scale])
    }
  }

  return points.slice(0, N)
}

// Lerp helper
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
// Ease in-out cubic
function easeInOut(t: number) { return t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2 }

export default function Intro({ onDone }: Props) {
  const { colors, theme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<number>(0)
  const stateRef = useRef({
    t: 0,                 // frame counter
    phase: 'wave' as 'wave' | 'morph' | 'form' | 'glow',
    phaseStart: 0,
    particles: [] as { wx: number; wy: number; fx: number; fy: number }[],
    flamePoints: [] as [number, number][],
    formProgress: 0,
  })

  const [textVisible, setTextVisible] = useState(false)
  const [fading, setFading] = useState(false)

  const isLight = theme === 'light'
  const AMBER = '#F59E0B'
  const BG = colors.pageBg

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2 + 10

    const N = 80
    const flamePoints = sampleFlame(cx, cy, 90, N)
    const s = stateRef.current
    s.flamePoints = flamePoints

    // Init particles as wave positions
    s.particles = flamePoints.map((_, i) => {
      const wx = (i / N) * W
      const wy = H / 2 + Math.sin((i / N) * Math.PI * 4) * 20
      return { wx, wy, fx: flamePoints[i][0], fy: flamePoints[i][1] }
    })

    // Phase timing (frames at 60fps):
    const WAVE_FRAMES  = 60   // 1.0s
    const MORPH_FRAMES = 70   // 1.15s
    const FORM_FRAMES  = 55   // 0.9s
    const GLOW_FRAMES  = 50   // 0.8s

    const draw = () => {
      s.t++
      ctx.clearRect(0, 0, W, H)

      // Determine phase
      const elapsed = s.t - s.phaseStart
      if (s.phase === 'wave' && elapsed > WAVE_FRAMES) {
        s.phase = 'morph'; s.phaseStart = s.t
      } else if (s.phase === 'morph' && elapsed > MORPH_FRAMES) {
        s.phase = 'form'; s.phaseStart = s.t
      } else if (s.phase === 'form' && elapsed > FORM_FRAMES) {
        s.phase = 'glow'; s.phaseStart = s.t
        setTextVisible(true)
      } else if (s.phase === 'glow' && elapsed > GLOW_FRAMES) {
        setFading(true)
        setTimeout(onDone, 500)
        cancelAnimationFrame(frameRef.current)
        return
      }

      const pElapsed = s.t - s.phaseStart

      // ─── WAVE phase ───────────────────────────────────────────
      if (s.phase === 'wave') {
        const alpha = Math.min(1, pElapsed / 20)
        for (let row = -1; row <= 1; row++) {
          ctx.beginPath()
          ctx.strokeStyle = `rgba(245,158,11,${alpha * (0.4 - Math.abs(row) * 0.15)})`
          ctx.lineWidth = row === 0 ? 2 : 1.2
          ctx.shadowColor = AMBER
          ctx.shadowBlur = row === 0 ? 8 : 3
          for (let x = 0; x <= W; x++) {
            const y = H / 2 + row * 22 +
              Math.sin((x / W) * Math.PI * 5 + s.t * 0.06) * (row === 0 ? 18 : 10)
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
        ctx.shadowBlur = 0
      }

      // ─── MORPH phase ──────────────────────────────────────────
      if (s.phase === 'morph') {
        const prog = easeInOut(Math.min(1, pElapsed / MORPH_FRAMES))

        ctx.shadowColor = AMBER
        ctx.shadowBlur = 6 + prog * 10

        // Each particle moves from wave position to flame position
        const pts = s.particles.map((p, i) => {
          const waveX = (i / N) * W
          const waveY = H / 2 + Math.sin((waveX / W) * Math.PI * 5 + (s.t - pElapsed) * 0.06) * 18
          const x = lerp(waveX, p.fx, prog)
          const y = lerp(waveY, p.fy, prog)
          return [x, y] as [number, number]
        })

        // Draw as connected path
        ctx.beginPath()
        ctx.strokeStyle = `rgba(245,158,11,${0.6 + prog * 0.4})`
        ctx.lineWidth = 1.5
        pts.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.stroke()

        // Scatter dots at each point
        pts.forEach(([x, y], i) => {
          if (i % 4 !== 0) return
          ctx.beginPath()
          ctx.arc(x, y, 1.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(245,158,11,${0.5 + prog * 0.5})`
          ctx.fill()
        })
        ctx.shadowBlur = 0
      }

      // ─── FORM phase ───────────────────────────────────────────
      if (s.phase === 'form') {
        const prog = easeInOut(Math.min(1, pElapsed / FORM_FRAMES))
        const pts = s.flamePoints

        // Progressive reveal: draw first prog*N points
        const reveal = Math.floor(prog * N)

        ctx.shadowColor = AMBER
        ctx.shadowBlur = 12

        // Filled flame (fades in with progress)
        if (prog > 0.4) {
          ctx.beginPath()
          pts.forEach(([x, y], i) => {
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          })
          ctx.closePath()
          ctx.fillStyle = `rgba(245,158,11,${(prog - 0.4) / 0.6 * 0.12})`
          ctx.fill()
        }

        // Stroke outline progressively
        ctx.beginPath()
        pts.slice(0, reveal).forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.strokeStyle = `rgba(245,158,11,${0.7 + prog * 0.3})`
        ctx.lineWidth = 2
        ctx.stroke()

        // Leading dot
        if (reveal > 0 && reveal < N) {
          const [lx, ly] = pts[reveal - 1]
          ctx.beginPath()
          ctx.arc(lx, ly, 3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,220,100,0.9)`
          ctx.fill()
        }
        ctx.shadowBlur = 0
      }

      // ─── GLOW phase ───────────────────────────────────────────
      if (s.phase === 'glow') {
        const prog = Math.min(1, pElapsed / GLOW_FRAMES)
        const pulse = Math.abs(Math.sin(pElapsed * 0.08))
        const pts = s.flamePoints

        // Filled flame
        ctx.beginPath()
        pts.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.fillStyle = `rgba(245,158,11,${0.12 + pulse * 0.08})`
        ctx.fill()

        // Outer glow layers
        for (let g = 3; g >= 1; g--) {
          ctx.shadowColor = AMBER
          ctx.shadowBlur = 6 * g + pulse * 10
          ctx.beginPath()
          pts.forEach(([x, y], i) => {
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          })
          ctx.closePath()
          ctx.strokeStyle = `rgba(245,158,11,${(0.3 / g) + pulse * 0.1})`
          ctx.lineWidth = 2
          ctx.stroke()
        }
        ctx.shadowBlur = 0
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
        gap: 24,
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.5s ease',
        zIndex: 9999,
      }}
    >
      <canvas
        ref={canvasRef}
        width={320}
        height={260}
      />

      <div style={{
        textAlign: 'center',
        opacity: textVisible ? 1 : 0,
        transform: textVisible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
        marginTop: -8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            fontFamily: 'ui-monospace, "Cascadia Code", monospace',
            fontWeight: 700, fontSize: 28,
            color: colors.textPrimary,
            letterSpacing: '-0.04em',
          }}>flint</span>
        </div>
        <p style={{ fontSize: 13, color: colors.textMuted, letterSpacing: '0.01em' }}>
          Describe any workflow in plain English.
        </p>
      </div>

      <p style={{
        position: 'absolute', bottom: 28,
        fontSize: 11, color: colors.textMuted,
        opacity: textVisible ? 0.4 : 0,
        transition: 'opacity 0.4s ease',
        fontFamily: 'ui-monospace, monospace',
      }}>
        click to skip
      </p>
    </div>
  )
}
