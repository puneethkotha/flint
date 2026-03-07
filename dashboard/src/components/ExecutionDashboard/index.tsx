import React, { useState } from 'react'
import { useJobs } from '../../hooks/useFlintAPI'
import JobTable from './JobTable'
import MetricsCharts from './MetricsCharts'
import DAGVisualization from '../DAGVisualization'
import { api } from '../../api/client'

export default function ExecutionDashboard() {
  const { jobs, loading } = useJobs(5000)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [jobDetail, setJobDetail] = useState<Record<string, unknown> | null>(null)
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({})

  const handleSelectJob = async (id: string) => {
    setSelectedJobId(id)
    setTaskStatuses({})
    try {
      const job = await api.getJob(id)
      const statuses: Record<string, string> = {}
      job.task_executions.forEach(te => { statuses[te.task_id] = te.status })
      setTaskStatuses(statuses)

      // Get the workflow to get the DAG
      const wfResp = await fetch(`/api/v1/workflows/${job.workflow_id}`)
      if (wfResp.ok) {
        const wf = await wfResp.json()
        setJobDetail(wf.dag_json)
      }
    } catch {
      setJobDetail(null)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, height: 'calc(100vh - 120px)' }}>
      {/* Left panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Jobs table */}
        <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 20, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Recent Jobs</h2>
            {loading && <span style={{ color: '#555', fontSize: 12 }}>updating...</span>}
          </div>
          <JobTable jobs={jobs} selectedJobId={selectedJobId} onSelect={handleSelectJob} />
        </div>

        {/* Metrics */}
        <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#888' }}>METRICS</h3>
          <MetricsCharts jobs={jobs} />
        </div>
      </div>

      {/* Right panel — DAG for selected job */}
      <div style={{ background: '#1a1a1a', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
        {selectedJobId && jobDetail ? (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2a2a', fontSize: 12, color: '#555' }}>
              Job: <code style={{ color: '#888' }}>{selectedJobId}</code>
            </div>
            <div style={{ height: 'calc(100% - 41px)' }}>
              <DAGVisualization
                dag={jobDetail}
                jobId={selectedJobId}
                taskStatuses={taskStatuses}
                onTaskStatusUpdate={setTaskStatuses}
              />
            </div>
          </>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#333',
            gap: 12,
          }}>
            <span style={{ fontSize: 48 }}>📊</span>
            <p style={{ margin: 0, fontSize: 14 }}>Select a job to see its DAG</p>
          </div>
        )}
      </div>
    </div>
  )
}
