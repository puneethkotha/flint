/**
 * Phase 3b: Workflow Version History — "History" tab with timeline + diff view.
 * Drop into: dashboard/src/components/VersionHistory/VersionHistory.tsx
 *
 * Usage (add as a new tab in the workflow detail view):
 *   <VersionHistory workflowId={workflow.id} />
 */

import React, { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Version {
  id: string
  workflow_id: string
  version_number: number
  definition: Record<string, unknown>
  change_summary: string | null
  created_at: string
  avg_execution_ms: number | null
}

interface NodeDiff {
  node_id: string
  status: 'added' | 'removed' | 'changed' | 'unchanged'
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  changed_fields: string[]
}

interface DiffResult {
  nodes_diff: NodeDiff[]
  edges_diff: Array<{ type: 'added' | 'removed'; from: string; to: string }>
  summary: string
  version_a: number
  version_b: number
}

interface VersionHistoryProps {
  workflowId: string
}

const STATUS_DOT_COLORS = {
  added: '#10b981',
  removed: '#ef4444',
  changed: '#f59e0b',
  unchanged: '#475569',
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({ workflowId }) => {
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedA, setSelectedA] = useState<number | null>(null)
  const [selectedB, setSelectedB] = useState<number | null>(null)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/workflows/${workflowId}/versions`)
      .then(r => r.json())
      .then(data => {
        setVersions(data.versions || [])
        // Auto-select latest two versions for diff
        if (data.versions?.length >= 2) {
          setSelectedB(data.versions[0].version_number)
          setSelectedA(data.versions[1].version_number)
        }
      })
      .finally(() => setLoading(false))
  }, [workflowId])

  useEffect(() => {
    if (selectedA != null && selectedB != null && selectedA !== selectedB) {
      setDiffLoading(true)
      fetch(`${API_BASE}/api/v1/workflows/${workflowId}/versions/diff?v1=${selectedA}&v2=${selectedB}`)
        .then(r => r.json())
        .then(setDiff)
        .finally(() => setDiffLoading(false))
    } else {
      setDiff(null)
    }
  }, [workflowId, selectedA, selectedB])

  if (loading) {
    return <div style={{ padding: 24, color: '#64748b', fontSize: 13 }}>Loading version history…</div>
  }

  if (versions.length === 0) {
    return (
      <div style={{ padding: 24, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
        No version history yet. Save or update this workflow to start tracking versions.
      </div>
    )
  }

  const bestVersion = [...versions].sort(
    (a, b) => (a.avg_execution_ms ?? Infinity) - (b.avg_execution_ms ?? Infinity)
  )[0]

  return (
    <div style={{ display: 'flex', gap: 20, padding: 20, height: '100%' }}>
      {/* Left: version timeline */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Version timeline
        </div>

        <div style={{ position: 'relative' }}>
          {/* Vertical line */}
          <div style={{ position: 'absolute', left: 10, top: 12, bottom: 0, width: 2, background: '#1e293b' }} />

          {versions.map((v, i) => {
            const isA = selectedA === v.version_number
            const isB = selectedB === v.version_number
            const isBest = bestVersion?.version_number === v.version_number && v.avg_execution_ms

            return (
              <div
                key={v.id}
                style={{ position: 'relative', paddingLeft: 28, marginBottom: 16 }}
              >
                {/* Timeline dot */}
                <div
                  style={{
                    position: 'absolute',
                    left: 4,
                    top: 6,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: isA || isB ? '#a78bfa' : '#334155',
                    border: isA || isB ? '2px solid #7c3aed' : '2px solid #1e293b',
                    zIndex: 1,
                  }}
                />

                {/* Version card */}
                <div
                  style={{
                    background: isA || isB ? '#1e1b4b' : '#0f172a',
                    border: `1px solid ${isA || isB ? '#4338ca' : '#1e293b'}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                      v{v.version_number}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {isBest && (
                        <span style={{ fontSize: 9, background: '#065f46', color: '#34d399', borderRadius: 4, padding: '2px 5px' }}>
                          fastest
                        </span>
                      )}
                      {i === 0 && (
                        <span style={{ fontSize: 9, background: '#1e1b4b', color: '#a78bfa', borderRadius: 4, padding: '2px 5px' }}>
                          current
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    {new Date(v.created_at).toLocaleString()}
                  </div>

                  {v.avg_execution_ms && (
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      avg {v.avg_execution_ms}ms
                    </div>
                  )}

                  {v.change_summary && (
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 4, fontStyle: 'italic' }}>
                      {v.change_summary}
                    </div>
                  )}

                  {/* Compare buttons */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button
                      onClick={() => setSelectedA(v.version_number)}
                      style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 3,
                        background: isA ? '#7c3aed' : '#1e293b',
                        color: isA ? '#fff' : '#64748b',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      A
                    </button>
                    <button
                      onClick={() => setSelectedB(v.version_number)}
                      style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 3,
                        background: isB ? '#7c3aed' : '#1e293b',
                        color: isB ? '#fff' : '#64748b',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      B
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right: diff panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedA != null && selectedB != null && selectedA !== selectedB ? (
          <>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Diff: v{selectedA} → v{selectedB}
            </div>

            {diffLoading ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>Computing diff…</div>
            ) : diff ? (
              <>
                {/* Summary bar */}
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14, padding: '8px 12px', background: '#0f172a', borderRadius: 6, border: '1px solid #1e293b' }}>
                  {diff.summary || 'No changes detected'}
                </div>

                {/* Node diffs */}
                {diff.nodes_diff.filter(n => n.status !== 'unchanged').map(node => (
                  <div
                    key={node.node_id}
                    style={{
                      background: '#0f172a',
                      border: `1px solid ${STATUS_DOT_COLORS[node.status]}33`,
                      borderLeft: `3px solid ${STATUS_DOT_COLORS[node.status]}`,
                      borderRadius: 6,
                      padding: '10px 12px',
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_DOT_COLORS[node.status], textTransform: 'uppercase' }}>
                        {node.status}
                      </span>
                      <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>
                        {node.node_id}
                      </span>
                    </div>

                    {node.changed_fields.length > 0 && (
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        Changed: <span style={{ color: '#f59e0b' }}>{node.changed_fields.join(', ')}</span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Edge diffs */}
                {diff.edges_diff.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#0f172a',
                      border: `1px solid ${e.type === 'added' ? '#10b98133' : '#ef444433'}`,
                      borderLeft: `3px solid ${e.type === 'added' ? '#10b981' : '#ef4444'}`,
                      borderRadius: 6,
                      padding: '8px 12px',
                      marginBottom: 8,
                      fontSize: 11,
                      color: '#94a3b8',
                    }}
                  >
                    <span style={{ color: e.type === 'added' ? '#10b981' : '#ef4444', fontWeight: 700, textTransform: 'uppercase', marginRight: 8 }}>
                      {e.type}
                    </span>
                    edge: {e.from} → {e.to}
                  </div>
                ))}

                {diff.nodes_diff.every(n => n.status === 'unchanged') && diff.edges_diff.length === 0 && (
                  <div style={{ color: '#64748b', fontSize: 13 }}>These versions are identical.</div>
                )}
              </>
            ) : null}
          </>
        ) : (
          <div style={{ color: '#64748b', fontSize: 13, paddingTop: 40, textAlign: 'center' }}>
            Select two different versions (A and B) to see the diff.
          </div>
        )}
      </div>
    </div>
  )
}

export default VersionHistory
