import React, { useState } from 'react'
import { JobResponse } from '../../api/client'
import { useTheme } from '../../theme'

const STATUS_DOT: Record<string, string> = {
  completed: '#22c55e',
  failed:    '#ef4444',
  running:   '#f5f5f5',
  queued:    '#F59E0B',
  pending:   '#6b7280',
  cancelled: '#3a3a3a',
}

interface Props {
  jobs: JobResponse[]
  selectedJobId: string | null
  onSelect: (id: string) => void
}

function JobRow({ job, selected, index, onSelect }: {
  job: JobResponse; selected: boolean; index: number; onSelect: () => void
}) {
  const { colors } = useTheme()
  const [hovered, setHovered] = useState(false)
  const bg = selected ? colors.rowSelected : hovered ? colors.rowHover : index % 2 === 0 ? colors.rowAlt : colors.panelBg

  return (
    <tr
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: bg, cursor: 'pointer', borderBottom: `1px solid ${colors.divider}`, transition: 'background 0.1s' }}
    >
      <td style={{ padding: '11px 16px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: STATUS_DOT[job.status] || '#6b7280',
            flexShrink: 0,
            boxShadow: job.status === 'running' ? '0 0 6px #f5f5f5aa' : 'none',
          }} />
          <span style={{ color: colors.textSecondary, fontSize: 12 }}>{job.status}</span>
        </span>
      </td>
      <td style={{ padding: '11px 16px', color: colors.textMuted, fontSize: 12 }}>
        {job.duration_ms ? `${job.duration_ms}ms` : '-'}
      </td>
      <td style={{ padding: '11px 16px', color: colors.textMuted, fontSize: 12 }}>{job.trigger_type}</td>
      <td style={{ padding: '11px 16px', color: colors.textMuted, fontSize: 11 }}>
        {job.triggered_at ? new Date(job.triggered_at).toLocaleTimeString() : '-'}
      </td>
      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
        <span style={{
          fontSize: 11, color: hovered ? colors.textMuted : 'transparent',
          transition: 'color 0.15s', whiteSpace: 'nowrap',
          fontFamily: 'ui-monospace, monospace',
        }}>
          View DAG →
        </span>
      </td>
    </tr>
  )
}

export default function JobTable({ jobs, selectedJobId, onSelect }: Props) {
  const { colors } = useTheme()
  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${colors.panelBorder}` }}>
            {['Run', 'Duration', 'Trigger', 'Time', ''].map((h, i) => (
              <th key={i} style={{
                textAlign: i === 4 ? 'right' : 'left',
                padding: '9px 16px',
                color: colors.textMuted,
                fontWeight: 500, fontSize: 10,
                textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
                No jobs yet
              </td>
            </tr>
          ) : (
            jobs.map((job, i) => (
              <JobRow key={job.id} job={job} selected={selectedJobId === job.id} index={i} onSelect={() => onSelect(job.id)} />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
