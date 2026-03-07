import React from 'react'
import { JobResponse } from '../../api/client'

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  failed: '#ef4444',
  running: '#3b82f6',
  queued: '#eab308',
  pending: '#888',
  cancelled: '#666',
}

interface Props {
  jobs: JobResponse[]
  selectedJobId: string | null
  onSelect: (id: string) => void
}

export default function JobTable({ jobs, selectedJobId, onSelect }: Props) {
  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
            {['Status', 'Duration', 'Trigger', 'Started'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#555', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '24px 12px', textAlign: 'center', color: '#444' }}>
                No jobs yet
              </td>
            </tr>
          )}
          {jobs.map(job => (
            <tr
              key={job.id}
              onClick={() => onSelect(job.id)}
              style={{
                borderBottom: '1px solid #1a1a1a',
                cursor: 'pointer',
                background: selectedJobId === job.id ? '#1a2a3a' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => {
                if (selectedJobId !== job.id) (e.currentTarget as HTMLElement).style.background = '#1a1a2a'
              }}
              onMouseLeave={e => {
                if (selectedJobId !== job.id) (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <td style={{ padding: '10px 12px' }}>
                <span style={{
                  color: STATUS_COLORS[job.status] || '#888',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: STATUS_COLORS[job.status] || '#888',
                    display: 'inline-block',
                    flexShrink: 0,
                  }} />
                  {job.status}
                </span>
              </td>
              <td style={{ padding: '10px 12px', color: '#888' }}>
                {job.duration_ms ? `${job.duration_ms}ms` : '—'}
              </td>
              <td style={{ padding: '10px 12px', color: '#666' }}>
                {job.trigger_type}
              </td>
              <td style={{ padding: '10px 12px', color: '#555', fontSize: 11 }}>
                {job.triggered_at ? new Date(job.triggered_at).toLocaleString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
