import React from 'react'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { JobResponse } from '../../api/client'

interface DataPoint {
  time: string
  throughput: number
  p95: number
}

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

  const result = Object.entries(buckets)
    .slice(-12)
    .map(([time, data]) => {
      const sorted = [...data.durations].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
      return { time, throughput: data.count, p95: Math.round(p95) }
    })

  // Ensure at least 2 points so charts don't render broken
  if (result.length === 0) return [{ time: '00:00', throughput: 0, p95: 0 }]
  if (result.length === 1) return [...result, { ...result[0], time: '' }]
  return result
}

const tooltipStyle = {
  contentStyle: {
    background: '#111111',
    border: '1px solid #1e1e1e',
    borderRadius: 6,
    fontSize: 11,
    color: '#f5f5f5',
    boxShadow: 'none',
  },
  labelStyle: { color: '#6b7280', fontSize: 11 },
  itemStyle: { color: '#f5f5f5', fontSize: 11 },
}

const axisStyle = { fill: '#6b7280', fontSize: 10 }
const axisLine = { axisLine: false, tickLine: false }

interface Props {
  jobs: JobResponse[]
}

export default function MetricsCharts({ jobs }: Props) {
  const data = buildMetrics(jobs)
  const avgDuration = jobs.filter(j => j.duration_ms).length > 0
    ? Math.round(
        jobs.filter(j => j.duration_ms).reduce((a, j) => a + (j.duration_ms ?? 0), 0) /
        jobs.filter(j => j.duration_ms).length
      )
    : 0

  const total = jobs.length
  const completed = jobs.filter(j => j.status === 'completed').length
  const failed = jobs.filter(j => j.status === 'failed').length

  const chartLabel: React.CSSProperties = {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
    fontWeight: 500,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* One-line stats */}
      <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
        {total} total
        <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
        {completed} completed
        <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
        {failed} failed
        <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
        {avgDuration}ms avg
      </p>

      {/* Throughput */}
      <div>
        <p style={chartLabel}>Throughput</p>
        <ResponsiveContainer width="100%" height={90}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={axisStyle} {...axisLine} />
            <YAxis tick={axisStyle} {...axisLine} width={28} />
            <Tooltip {...tooltipStyle} />
            <Area
              type="monotone"
              dataKey="throughput"
              stroke="#2563eb"
              fill="url(#tGrad)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* p95 Latency */}
      <div>
        <p style={chartLabel}>p95 Latency (ms)</p>
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={data}>
            <XAxis dataKey="time" tick={axisStyle} {...axisLine} />
            <YAxis tick={axisStyle} {...axisLine} width={36} />
            <Tooltip {...tooltipStyle} />
            <Line
              type="monotone"
              dataKey="p95"
              stroke="#6b7280"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
