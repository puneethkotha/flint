import React, { useState } from 'react'
import { api } from '../../api/client'
import DAGVisualization from '../DAGVisualization'

const EXAMPLES = [
  'fetch https://api.github.com/events and print the count',
  'Every morning at 9am, fetch GitHub trending repos and post to Slack',
  'Run tests, if passing deploy to production and notify the team',
  'Every hour pull orders from API, compute revenue, store in Postgres',
]

const btn: React.CSSProperties = {
  height: 36,
  padding: '0 16px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid #1e1e1e',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s, border-color 0.15s',
  whiteSpace: 'nowrap',
}

export default function WorkflowCreator() {
  const [description, setDescription] = useState('')
  const [dag, setDag] = useState<Record<string, unknown> | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({})

  const handlePreview = async () => {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.parseWorkflow(description)
      setDag(result.dag)
      setWarnings(result.warnings)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAndRun = async () => {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    try {
      const wf = await api.createWorkflow({ description, run_immediately: true })
      const job = await api.triggerJob(wf.id)
      setJobId(job.job_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create workflow')
    } finally {
      setLoading(false)
    }
  }

  const disabled = loading || !description.trim()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 'calc(100vh - 80px)' }}>

      {/* Left panel */}
      <div style={{
        background: '#111111',
        borderRadius: 8,
        border: '1px solid #1e1e1e',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}>
        {/* Header */}
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#f5f5f5', marginBottom: 4 }}>
            New Workflow
          </p>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Describe your workflow in plain English
          </p>
        </div>

        {/* Textarea */}
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe your workflow..."
          style={{
            minHeight: 160,
            background: '#0a0a0a',
            border: '1px solid #1e1e1e',
            borderRadius: 4,
            color: '#f5f5f5',
            padding: '12px 14px',
            fontSize: 13,
            resize: 'vertical',
            lineHeight: 1.6,
            outline: 'none',
            flex: '0 0 auto',
          }}
          onFocus={e => { e.target.style.borderColor = '#2563eb' }}
          onBlur={e => { e.target.style.borderColor = '#1e1e1e' }}
        />

        {/* Example chips */}
        <div>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Examples
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setDescription(ex)}
                style={{
                  background: 'none',
                  border: '1px solid #1e1e1e',
                  borderRadius: 4,
                  color: '#6b7280',
                  fontSize: 11,
                  padding: '4px 10px',
                  lineHeight: 1.4,
                  transition: 'all 0.15s',
                  textAlign: 'left',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#1a1a1a'
                  e.currentTarget.style.color = '#f5f5f5'
                  e.currentTarget.style.borderColor = '#2e2e2e'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'none'
                  e.currentTarget.style.color = '#6b7280'
                  e.currentTarget.style.borderColor = '#1e1e1e'
                }}
              >
                {ex.length > 50 ? ex.slice(0, 50) + '...' : ex}
              </button>
            ))}
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handlePreview}
            disabled={disabled}
            style={{
              ...btn,
              flex: 1,
              background: 'none',
              color: disabled ? '#3a3a3a' : '#f5f5f5',
              borderColor: disabled ? '#1e1e1e' : '#2e2e2e',
              opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#1a1a1a' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >
            {loading ? 'Parsing...' : 'Preview'}
          </button>
          <button
            onClick={handleCreateAndRun}
            disabled={disabled}
            style={{
              ...btn,
              flex: 1,
              background: disabled ? '#111' : '#2563eb',
              color: disabled ? '#3a3a3a' : '#fff',
              borderColor: disabled ? '#1e1e1e' : '#2563eb',
              opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = '#2563eb' }}
          >
            {loading ? 'Running...' : 'Create & Run'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: '#0f0505',
            border: '1px solid #2a1010',
            borderRadius: 6,
            padding: '10px 12px',
            color: '#f87171',
            fontSize: 12,
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {/* Success */}
        {jobId && (
          <div style={{
            background: '#050f05',
            border: '1px solid #102010',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 12,
            color: '#6b7280',
          }}>
            Job started:{' '}
            <code style={{ color: '#f5f5f5', fontSize: 11 }}>{jobId}</code>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div style={{
            border: '1px solid #1e1e1e',
            borderRadius: 6,
            padding: '10px 12px',
          }}>
            {warnings.map((w, i) => (
              <p key={i} style={{ color: '#6b7280', fontSize: 12, lineHeight: 1.5 }}>
                {w}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Right panel — DAG */}
      <div style={{
        background: '#111111',
        borderRadius: 8,
        border: '1px solid #1e1e1e',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {dag ? (
          <DAGVisualization
            dag={dag}
            jobId={jobId}
            taskStatuses={taskStatuses}
            onTaskStatusUpdate={setTaskStatuses}
          />
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}>
            <p style={{ fontSize: 13, color: '#6b7280' }}>DAG preview will appear here</p>
          </div>
        )}
      </div>
    </div>
  )
}
