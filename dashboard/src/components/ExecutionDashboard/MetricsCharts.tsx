import React, { useEffect, useState } from 'react'
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

function buildMetricsFromJobs(jobs: JobResponse[]): DataPoint[] {
  // Build time series from job data
  const buckets: Record<string, { count: number; durations: number[] }> = {}

  jobs.forEach(job => {
    if (!job.triggered_at) return
    const d = new Date(job.triggered_at)
    const key = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    if (!buckets[key]) buckets[key] = { count: 0, durations: [] }
    buckets[key].count++
    if (job.duration_ms) buckets[key].durations.push(job.duration_ms)
  })

  return Object.entries(buckets)
    .slice(-12)
    .map(([time, data]) => {
      const sorted = [...data.durations].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
      return { time, throughput: data.count, p95: Math.round(p95) }
    })
}

interface Props {
  jobs: JobResponse[]
}

export default function MetricsCharts({ jobs }: Props) {
  const data = buildMetricsFromJobs(jobs)
  const totalCompleted = jobs.filter(j => j.status === 'completed').length
  const totalFailed = jobs.filter(j => j.status === 'failed').length
  const avgDuration = jobs.filter(j => j.duration_ms).reduce((acc, j) => acc + (j.duration_ms ?? 0), 0) / Math.max(jobs.filter(j => j.duration_ms).length, 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[
          { label: 'Total Jobs', value: jobs.length, color: '#fff' },
          { label: 'Completed', value: totalCompleted, color: '#22c55e' },
          { label: 'Failed', value: totalFailed, color: '#ef4444' },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#0f0f0f', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Throughput chart */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#555', fontWeight: 500 }}>
          THROUGHPUT (jobs / minute)
        </p>
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="throughputGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: '#888' }}
            />
            <Area type="monotone" dataKey="throughput" stroke="#3b82f6" fill="url(#throughputGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* p95 latency chart */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#555', fontWeight: 500 }}>
          p95 LATENCY (ms)
        </p>
        <ResponsiveContainer width="100%" height={100}>
          <LineChart data={data}>
            <XAxis dataKey="time" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: '#888' }}
            />
            <Line type="monotone" dataKey="p95" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
