import React, { useState } from 'react'
import { useJobs } from '../../hooks/useFlintAPI'
import JobTable from './JobTable'
import MetricsCharts from './MetricsCharts'
import DAGVisualization from '../DAGVisualization'
import { api } from '../../api/client'

export default function ExecutionDashboard() {
  const { jobs, loading } = useJobs(5000)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [dagForJob, setDagForJob] = useState<Record<string, unknown> | null>(null)
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({})

  const handleSelectJob = async (id: string) => {
    setSelectedJobId(id)
    setTaskStatuses({})
    setDagForJob(null)
    try {
      const job = await api.getJob(id)
      const statuses: Record<string, string> = {}
      job.task_executions.forEach(te => { statuses[te.task_id] = te.status })
      setTaskStatuses(statuses)

      const wfResp = await fetch(`/api/v1/workflows/${job.workflow_id}`)
      if (wfResp.ok) {
        const wf = await wfResp.json()
        setDagForJob(wf.dag_json)
      }
    } catch {
      setDagForJob(null)
    }
  }

  const panel: React.CSSProperties = {
    background: '#111111',
    borderRadius: 8,
    border: '1px solid #1e1e1e',
    overflow: 'hidden',
  }

  const sectionHeader: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid #1e1e1e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 'calc(100vh - 80px)' }}>

      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

        {/* Jobs table */}
        <div style={{ ...panel, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={sectionHeader}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#f5f5f5' }}>Recent Jobs</span>
            {loading && (
              <span style={{ fontSize: 11, color: '#6b7280' }}>updating</span>
            )}
          </div>
          <JobTable jobs={jobs} selectedJobId={selectedJobId} onSelect={handleSelectJob} />
        </div>

        {/* Metrics */}
        <div style={{ ...panel, padding: 16, flexShrink: 0 }}>
          <MetricsCharts jobs={jobs} />
        </div>
      </div>

      {/* Right column — DAG for selected job */}
      <div style={{ ...panel, position: 'relative' }}>
        {selectedJobId && dagForJob ? (
          <>
            <div style={sectionHeader}>
              <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                {selectedJobId}
              </span>
            </div>
            <div style={{ height: 'calc(100% - 41px)' }}>
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
          }}>
            <p style={{ fontSize: 13, color: '#6b7280' }}>
              Select a job to view its execution graph
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
