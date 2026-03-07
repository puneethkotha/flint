import React from 'react'
import { JobResponse } from '../../api/client'

const STATUS_COLOR: Record<string, string> = {
  completed: '#f5f5f5',
  failed: '#f5f5f5',
  running: '#f5f5f5',
  queued: '#f5f5f5',
  pending: '#6b7280',
  cancelled: '#6b7280',
}

const STATUS_DOT: Record<string, string> = {
  completed: '#22c55e',
  failed:    '#ef4444',
  running:   '#2563eb',
  queued:    '#eab308',
  pending:   '#6b7280',
  cancelled: '#3a3a3a',
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
          <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
            {['Status', 'Duration', 'Trigger', 'Started'].map(h => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '8px 16px',
                  color: '#6b7280',
                  fontWeight: 500,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 && (
            <tr>
              <td
                colSpan={4}
                style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  color: '#6b7280',
                  fontSize: 13,
                }}
              >
                No jobs yet
              </td>
            </tr>
          )}
          {jobs.map((job, i) => (
            <tr
              key={job.id}
              onClick={() => onSelect(job.id)}
              style={{
                background: selectedJobId === job.id
                  ? '#161b27'
                  : i % 2 === 0 ? '#0f0f0f' : '#111111',
                cursor: 'pointer',
                transition: 'background 0.1s',
                borderBottom: '1px solid #1a1a1a',
              }}
              onMouseEnter={e => {
                if (selectedJobId !== job.id)
                  e.currentTarget.style.background = '#161616'
              }}
              onMouseLeave={e => {
                if (selectedJobId !== job.id)
                  e.currentTarget.style.background = i % 2 === 0 ? '#0f0f0f' : '#111111'
              }}
            >
              <td style={{ padding: '10px 16px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: STATUS_DOT[job.status] || '#6b7280',
                    flexShrink: 0,
                  }} />
                  <span style={{ color: STATUS_COLOR[job.status] || '#6b7280', fontSize: 12 }}>
                    {job.status}
                  </span>
                </span>
              </td>
              <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 12 }}>
                {job.duration_ms ? `${job.duration_ms}ms` : '—'}
              </td>
              <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 12 }}>
                {job.trigger_type}
              </td>
              <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 11 }}>
                {job.triggered_at ? new Date(job.triggered_at).toLocaleString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
