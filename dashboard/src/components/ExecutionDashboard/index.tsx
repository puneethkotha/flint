import React, { useState, useEffect, useRef } from 'react'
import { useJobs } from '../../hooks/useFlintAPI'
import JobTable from './JobTable'
import MetricsCharts from './MetricsCharts'
import DAGVisualization from '../DAGVisualization'
import { api, JobResponse } from '../../api/client'
import { useTheme } from '../../theme'

function ShimmerBar({ color }: { color: string }) {
  return (
    <div style={{ position: 'relative', height: 2, overflow: 'hidden', background: 'transparent' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '25%', height: '100%',
        background: `linear-gradient(90deg, transparent, ${color}44, transparent)`,
        animation: 'shimmer 1.4s ease-in-out infinite',
      }} />
    </div>
  )
}

interface HealthData {
  db_ms: number | null
  redis_ms: number | null
  status: string
}

function HeartbeatPanel() {
  const { colors } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [health, setHealth] = useState<HealthData | null>(null)
  const frameRef = useRef<number>(0)
  const tRef = useRef(0)

  // Fetch health every 10s
  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await window.fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/v1/health`)
        if (res.ok) {
          const d = await res.json()
          setHealth({
            db_ms: d.components?.db?.latency_ms ?? null,
            redis_ms: d.components?.redis?.latency_ms ?? null,
            status: d.status,
          })
        }
      } catch { /* offline */ }
    }
    fetch()
    const interval = setInterval(fetch, 10_000)
    return () => clearInterval(interval)
  }, [])

  // Animate sine wave
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // Amplitude pulses every 2s
      const pulse = Math.abs(Math.sin(tRef.current * Math.PI / 120))
      const amp = 12 + pulse * 10

      ctx.beginPath()
      ctx.strokeStyle = `rgba(245,158,11,${0.4 + pulse * 0.5})`
      ctx.lineWidth = 1.5
      ctx.shadowColor = '#F59E0B'
      ctx.shadowBlur = 4 + pulse * 6

      for (let x = 0; x <= W; x++) {
        const y = H / 2 + Math.sin((x / W) * Math.PI * 4 + tRef.current * 0.04) * amp
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

  const statRow = (label: string, value: string, ok: boolean) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'ui-monospace, monospace', minWidth: 40 }}>{label}</span>
      <span style={{ fontSize: 11, color: '#888', fontFamily: 'ui-monospace, monospace' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 28, padding: 32 }}>
      {/* Sine wave canvas */}
      <canvas
        ref={canvasRef}
        width={280}
        height={60}
        style={{ opacity: 0.9 }}
      />

      {/* f + flame dot */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{
          fontSize: 20, fontWeight: 600,
          color: colors.textPrimary,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '-0.02em',
        }}>f</span>
        <img
          src="/flame.png"
          alt=""
          style={{ width: 7, height: 7, objectFit: 'contain', opacity: 0.85 }}
        />
      </div>

      {/* Health stats */}
      {health ? (
        <div style={{
          border: `1px solid ${colors.panelBorder}`,
          padding: '12px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minWidth: 180,
        }}>
          <p style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
            Engine Status
          </p>
          {statRow('db', health.db_ms !== null ? `${Math.round(health.db_ms)}ms` : 'ok', health.db_ms !== null)}
          {statRow('redis', health.redis_ms !== null ? `${Math.round(health.redis_ms)}ms` : 'ok', health.redis_ms !== null)}
          {statRow('api', health.status === 'ok' ? 'live' : 'degraded', health.status === 'ok')}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
          checking engine...
        </div>
      )}
    </div>
  )
}

// Inline stat cards — moved here from MetricsCharts, shown ABOVE job table
function StatCards({ jobs }: { jobs: JobResponse[] }) {
  const { colors } = useTheme()
  const withDuration = jobs.filter(j => j.duration_ms)
  const avgDuration = withDuration.length > 0
    ? Math.round(withDuration.reduce((a, j) => a + (j.duration_ms ?? 0), 0) / withDuration.length)
    : 0

  const stats = [
    { label: 'Total Runs', value: jobs.length },
    { label: 'Completed', value: jobs.filter(j => j.status === 'completed').length },
    { label: 'Failed', value: jobs.filter(j => j.status === 'failed').length },
    { label: 'Avg Duration', value: avgDuration > 0 ? `${avgDuration}ms` : '—' },
  ]

  return (
    <div className="flint-stat-grid" style={{ flexShrink: 0 }}>
      {stats.map(({ label, value }) => (
        <div key={label} style={{
          background: colors.statCardBg,
          padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 4,
          transition: 'background 0.2s',
        }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: colors.textPrimary, letterSpacing: '-0.05em', lineHeight: 1 }}>
            {value}
          </div>
          <div style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ExecutionDashboard() {
  const { colors } = useTheme()
  const { jobs, loading } = useJobs(5000)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<JobResponse | null>(null)
  const [dagForJob, setDagForJob] = useState<Record<string, unknown> | null>(null)
  const [dagLoading, setDagLoading] = useState(false)
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({})
  const [workflowName, setWorkflowName] = useState<string | null>(null)

  const handleSelectJob = async (id: string) => {
    setSelectedJobId(id); setTaskStatuses({}); setDagForJob(null); setWorkflowName(null); setDagLoading(true)
    try {
      const job = await api.getJob(id)
      setSelectedJob(job)
      const statuses: Record<string, string> = {}
      job.task_executions.forEach(te => { statuses[te.task_id] = te.status })
      setTaskStatuses(statuses)
      const apiBase = import.meta.env.VITE_API_URL ?? ''
      const wfResp = await window.fetch(`${apiBase}/api/v1/workflows/${job.workflow_id}`)
      if (wfResp.ok) {
        const wf = await wfResp.json()
        setDagForJob(wf.dag_json); setWorkflowName(wf.name ?? null)
      }
    } catch { setDagForJob(null) }
    finally { setDagLoading(false) }
  }

  const panel: React.CSSProperties = {
    background: colors.panelBg,
    border: `1px solid ${colors.panelBorder}`,
    overflow: 'hidden',
    transition: 'background 0.2s, border-color 0.2s',
  }

  const sectionHeader: React.CSSProperties = {
    padding: '11px 16px',
    borderBottom: `1px solid ${colors.panelBorder}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0, height: 40,
  }

  const statusDotColor = selectedJob?.status === 'completed' ? '#22c55e'
    : selectedJob?.status === 'failed' ? '#ef4444'
    : selectedJob?.status === 'running' ? '#f5f5f5'
    : colors.textMuted

  return (
    <div className="flint-split">
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', minHeight: 0 }}>

        {/* ── Stat cards FIRST ── */}
        <div style={{ ...panel, flexShrink: 0 }}>
          <StatCards jobs={jobs} />
        </div>

        {/* ── Jobs table ── */}
        <div style={{ ...panel, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div style={sectionHeader}>
            <span style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, letterSpacing: '-0.01em' }}>Recent Jobs</span>
            {loading && <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>syncing</span>}
          </div>
          {loading && jobs.length === 0 && <ShimmerBar color="#2563eb" />}
          <JobTable jobs={jobs} selectedJobId={selectedJobId} onSelect={handleSelectJob} />
        </div>

        {/* ── Charts (throughput + p95 only, no stat cards) ── */}
        <div style={{ ...panel, padding: 20, flexShrink: 0 }}>
          <MetricsCharts jobs={jobs} />
        </div>
      </div>

      {/* Right column */}
      <div className="flint-panel-right" style={{ ...panel, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {dagLoading ? (
          <>
            <div style={sectionHeader}>
              <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>Loading execution graph...</span>
            </div>
            <ShimmerBar color="#2563eb" />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontSize: 12, color: colors.textMuted }}>Fetching DAG...</p>
            </div>
          </>
        ) : selectedJobId && dagForJob ? (
          <>
            <div style={sectionHeader}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary }}>{workflowName ?? 'Workflow'}</span>
                <span style={{ fontSize: 10, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                  {selectedJobId.slice(0, 8)}...{selectedJob?.duration_ms ? ` · ${selectedJob.duration_ms}ms` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusDotColor }} />
                <span style={{ fontSize: 11, color: colors.textMuted }}>{selectedJob?.status}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <DAGVisualization dag={dagForJob} jobId={selectedJobId} taskStatuses={taskStatuses} onTaskStatusUpdate={setTaskStatuses} />
            </div>
          </>
        ) : (
          <HeartbeatPanel />
        )}
      </div>
    </div>
  )
}
