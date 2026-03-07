import React, { useState } from 'react'
import { api } from '../../api/client'
import DAGVisualization from '../DAGVisualization'

const EXAMPLES = [
  'fetch https://api.github.com/events and print the count',
  'Every morning at 9am, fetch GitHub trending repos and post to Slack',
  'Run tests, if passing deploy to production and notify Slack',
  'Every hour pull orders from API, compute revenue, store in Postgres',
]

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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, height: 'calc(100vh - 120px)' }}>
      {/* Left: Input panel */}
      <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Create Workflow</h2>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>
            Describe your workflow in plain English
          </p>
        </div>

        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe your workflow in plain English...&#10;&#10;Examples:&#10;• fetch https://api.github.com/events and print the count&#10;• Every morning at 9am, fetch trending GitHub repos and post to Slack&#10;• Run tests, if passing deploy to production"
          style={{
            flex: 1,
            background: '#0f0f0f',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
            color: '#fff',
            padding: 16,
            fontSize: 14,
            resize: 'none',
            lineHeight: 1.6,
            fontFamily: 'inherit',
            outline: 'none',
          }}
          onFocus={e => (e.target.style.borderColor = '#3b82f6')}
          onBlur={e => (e.target.style.borderColor = '#2a2a2a')}
        />

        {/* Example chips */}
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#555' }}>Quick examples:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setDescription(ex)}
                style={{
                  background: '#2a2a2a',
                  border: '1px solid #333',
                  borderRadius: 20,
                  color: '#888',
                  fontSize: 11,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#3b82f6'; (e.target as HTMLElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = '#333'; (e.target as HTMLElement).style.color = '#888' }}
              >
                {ex.length > 45 ? ex.slice(0, 45) + '...' : ex}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handlePreview}
            disabled={loading || !description.trim()}
            style={{
              flex: 1,
              background: '#2a2a2a',
              border: '1px solid #3b82f6',
              borderRadius: 8,
              color: '#3b82f6',
              padding: '10px 0',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
              opacity: loading || !description.trim() ? 0.5 : 1,
            }}
          >
            {loading ? '⟳ Parsing...' : '👁 Preview DAG'}
          </button>
          <button
            onClick={handleCreateAndRun}
            disabled={loading || !description.trim()}
            style={{
              flex: 1,
              background: loading ? '#2a2a2a' : '#3b82f6',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              padding: '10px 0',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              opacity: loading || !description.trim() ? 0.5 : 1,
            }}
          >
            {loading ? '⟳ Running...' : '🚀 Create & Run'}
          </button>
        </div>

        {error && (
          <div style={{ background: '#1f0a0a', border: '1px solid #ef4444', borderRadius: 8, padding: 12, color: '#ef4444', fontSize: 13 }}>
            ✗ {error}
          </div>
        )}

        {jobId && (
          <div style={{ background: '#0a1a0a', border: '1px solid #22c55e', borderRadius: 8, padding: 12, color: '#22c55e', fontSize: 13 }}>
            ✓ Job started: <code style={{ color: '#86efac' }}>{jobId}</code>
          </div>
        )}

        {warnings.length > 0 && (
          <div style={{ background: '#1a1500', border: '1px solid #eab308', borderRadius: 8, padding: 12 }}>
            {warnings.map((w, i) => (
              <p key={i} style={{ margin: 0, color: '#fbbf24', fontSize: 12 }}>⚠ {w}</p>
            ))}
          </div>
        )}
      </div>

      {/* Right: DAG visualization */}
      <div style={{ background: '#1a1a1a', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
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
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#333',
            gap: 12,
          }}>
            <span style={{ fontSize: 48 }}>🔗</span>
            <p style={{ margin: 0, fontSize: 14 }}>DAG preview will appear here</p>
            <p style={{ margin: 0, fontSize: 12 }}>Describe your workflow and click "Preview DAG"</p>
          </div>
        )}
      </div>
    </div>
  )
}
