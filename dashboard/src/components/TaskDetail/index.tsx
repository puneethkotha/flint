import React from 'react'
import { TaskExecution } from '../../api/client'

interface Props {
  task: TaskExecution
  onClose: () => void
}

export default function TaskDetail({ task, onClose }: Props) {
  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: 400,
      background: '#1a1a1a',
      borderLeft: '1px solid #2a2a2a',
      overflowY: 'auto',
      zIndex: 100,
      padding: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{task.task_id}</h3>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 20 }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { label: 'Type', value: task.task_type },
          { label: 'Status', value: task.status },
          { label: 'Attempt', value: String(task.attempt_number) },
          { label: 'Duration', value: task.duration_ms ? `${task.duration_ms}ms` : 'N/A' },
          { label: 'Failure Type', value: task.failure_type || 'N/A' },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #2a2a2a', paddingBottom: 8 }}>
            <span style={{ color: '#555', fontSize: 13 }}>{label}</span>
            <span style={{ color: '#ccc', fontSize: 13 }}>{value}</span>
          </div>
        ))}

        {task.error && (
          <div style={{ background: '#1f0a0a', border: '1px solid #ef4444', borderRadius: 8, padding: 12 }}>
            <p style={{ margin: '0 0 4px', color: '#ef4444', fontSize: 11, fontWeight: 600 }}>ERROR</p>
            <pre style={{ margin: 0, color: '#fca5a5', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {task.error}
            </pre>
          </div>
        )}

        {Object.keys(task.output_data || {}).length > 0 && (
          <div>
            <p style={{ margin: '0 0 8px', color: '#555', fontSize: 11, fontWeight: 600 }}>OUTPUT</p>
            <pre style={{
              background: '#0f0f0f',
              borderRadius: 6,
              padding: 12,
              fontSize: 12,
              color: '#86efac',
              overflow: 'auto',
              maxHeight: 300,
              margin: 0,
            }}>
              {JSON.stringify(task.output_data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
