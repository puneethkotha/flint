import React from 'react'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { JobResponse } from '../../api/client'
import { useTheme } from '../../theme'

interface DataPoint { time: string; throughput: number; p95: number }

function buildMetrics(jobs: JobResponse[]): DataPoint[] {
  const buckets: Record<string, { count: number; durations: number[] }> = {}
  jobs.forEach(job => {
    if (!job.triggered_at) return
    const d = new Date(job.triggered_at)
    const key = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    if (!buckets[key]) buckets[key] = { count: 0, durations: [] }
    buckets[key].count++
    if (job.duration_ms) buckets[key].durations.push(job.duration_ms)
  })
  const result = Object.entries(buckets).slice(-12).map(([time, data]) => {
    const sorted = [...data.durations].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
    return { time, throughput: data.count, p95: Math.round(p95) }
  })
  if (result.length === 0) return [{ time: '-', throughput: 0, p95: 0 }]
  if (result.length === 1) return [...result, { ...result[0], time: '' }]
  return result
}

interface Props { jobs: JobResponse[] }

export default function MetricsCharts({ jobs }: Props) {
  const { colors } = useTheme()
  const data = buildMetrics(jobs)
  const running = jobs.filter(j => j.status === 'running').length

  const axisStyle = { fill: colors.textMuted, fontSize: 10 }
  const noLines = { axisLine: false, tickLine: false }
  const gridColor = '#1a1a1a'

  const tooltipStyle = {
    contentStyle: { background: colors.panelBg, border: `1px solid ${colors.panelBorder}`, borderRadius: 0, fontSize: 11, color: colors.textPrimary, boxShadow: 'none' },
    labelStyle: { color: colors.textMuted, fontSize: 10 },
    itemStyle: { color: colors.textSecondary, fontSize: 11 },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Charts only — stat cards are now above the jobs table */}

      {/* Charts */}
      <div className="flint-chart-grid">
        <div>
          <p style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, marginBottom: 12 }}>
            Throughput / min
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={gridColor} vertical={false} />
              <XAxis dataKey="time" tick={axisStyle} {...noLines} />
              <YAxis tick={axisStyle} {...noLines} width={24} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="throughput" name="runs" stroke="#2563eb" fill="url(#tGrad)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, marginBottom: 12 }}>
            p95 Latency (ms)
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={gridColor} vertical={false} />
              <XAxis dataKey="time" tick={axisStyle} {...noLines} />
              <YAxis tick={axisStyle} {...noLines} width={32} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="p95" name="p95ms" stroke='#555' strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {running > 0 && (
        <p style={{ fontSize: 11, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
          {running} job{running > 1 ? 's' : ''} running
        </p>
      )}
    </div>
  )
}
