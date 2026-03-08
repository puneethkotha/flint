import React, { useState } from 'react'
import { useJobs } from '../../hooks/useFlintAPI'
import JobTable from './JobTable'
import MetricsCharts from './MetricsCharts'
import DAGVisualization from '../DAGVisualization'
import { api } from '../../api/client'
import { JobResponse } from '../../api/client'

function ShimmerBar() {
  return (
    <div style={{ position: 'relative', height: 2, overflow: 'hidden', background: '#1a1a1a' }}>
      <div style={{
        position: 'absolute',
        top: 0, left: 0,
        width: '25%', height: '100%',
        background: 'linear-gradient(90deg, transparent, #2563eb44, transparent)',
        animation: 'shimmer 1.4s ease-in-out infinite',
      }} />
    </div>
  )
}

export default function ExecutionDashboard() {
  const { jobs, loading } = useJobs(5000)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<JobResponse | null>(null)
  const [dagForJob, setDagForJob] = useState<Record<string, unknown> | null>(null)
  const [dagLoading, setDagLoading] = useState(false)
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({})
  const [workflowName, setWorkflowName] = useState<string | null>(null)

  const handleSelectJob = async (id: string) => {
    setSelectedJobId(id)
    setTaskStatuses({})
    setDagForJob(null)
    setWorkflowName(null)
    setDagLoading(true)
    try {
      const job = await api.getJob(id)
      setSelectedJob(job)
      const statuses: Record<string, string> = {}
      job.task_executions.forEach(te => { statuses[te.task_id] = te.status })
      setTaskStatuses(statuses)

      const apiBase = import.meta.env.VITE_API_URL ?? ''
      const wfResp = await fetch(`${apiBase}/api/v1/workflows/${job.workflow_id}`)
      if (wfResp.ok) {
        const wf = await wfResp.json()
        setDagForJob(wf.dag_json)
        setWorkflowName(wf.name ?? null)
      }
    } catch {
      setDagForJob(null)
    } finally {
      setDagLoading(false)
    }
  }

  const panel: React.CSSProperties = {
    background: '#0f0f0f',
    border: '1px solid #1a1a1a',
    overflow: 'hidden',
  }

  const sectionHeader: React.CSSProperties = {
    padding: '11px 16px',
    borderBottom: '1px solid #1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    height: 40,
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: 'calc(100vh - 88px)' }}>

      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>

        {/* Jobs table */}
        <div style={{ ...panel, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div style={sectionHeader}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#d1d5db', letterSpacing: '-0.01em' }}>
              Recent Jobs
            </span>
            {loading && (
              <span style={{ fontSize: 10, color: '#444', fontFamily: 'ui-monospace, monospace' }}>
                syncing
              </span>
            )}
          </div>
          {loading && jobs.length === 0 && <ShimmerBar />}
          <JobTable jobs={jobs} selectedJobId={selectedJobId} onSelect={handleSelectJob} />
        </div>

        {/* Metrics */}
        <div style={{ ...panel, padding: 20, flexShrink: 0 }}>
          <MetricsCharts jobs={jobs} />
        </div>
      </div>

      {/* Right column — DAG for selected job */}
      <div style={{ ...panel, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {dagLoading ? (
          <>
            <div style={sectionHeader}>
              <span style={{ fontSize: 11, color: '#444', fontFamily: 'ui-monospace, monospace' }}>
                Loading execution graph...
              </span>
            </div>
            <ShimmerBar />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontSize: 12, color: '#333' }}>Fetching DAG...</p>
            </div>
          </>
        ) : selectedJobId && dagForJob ? (
          <>
            <div style={sectionHeader}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#d1d5db' }}>
                  {workflowName ?? 'Workflow'}
                </span>
                <span style={{ fontSize: 10, color: '#444', fontFamily: 'ui-monospace, monospace' }}>
                  {selectedJobId.slice(0, 8)}...
                  {selectedJob?.duration_ms ? ` · ${selectedJob.duration_ms}ms` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 6, height: 6,
                  borderRadius: '50%',
                  background: selectedJob?.status === 'completed' ? '#22c55e'
                    : selectedJob?.status === 'failed' ? '#ef4444'
                    : selectedJob?.status === 'running' ? '#f5f5f5'
                    : '#555',
                }} />
                <span style={{ fontSize: 11, color: '#555' }}>{selectedJob?.status}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <DAGVisualization
                dag={dagForJob}
                jobId={selectedJobId}
                taskStatuses={taskStatuses}
                onTaskStatusUpdate={setTaskStatuses}
              />
            </div>
          </>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            flexDirection: 'column',
            gap: 12,
          }}>
            <div style={{
              border: '1px dashed #1e1e1e',
              padding: '40px 56px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ width: 28, height: 18, border: '1px solid #222' }} />
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#333', fontWeight: 500 }}>
                Select a job to view execution graph
              </p>
              <p style={{ fontSize: 11, color: '#2a2a2a', textAlign: 'center' }}>
                Click any row in the table
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
