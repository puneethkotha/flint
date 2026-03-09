/**
 * CostBreakdown — shows predicted cost before running for real.
 * Drop into: dashboard/src/components/SimulationMode/CostBreakdown.tsx
 */

import React from 'react'

interface CostEstimate {
  simulation_cost_usd:   number
  real_run_cost_usd:     number
  token_cost_usd:        number
  external_api_cost_usd: number
  compute_cost_usd:      number
  breakdown:             Array<{ node_id: string; type: string; total: number; token: number; external: number; note: string }>
}

export const CostBreakdown: React.FC<{ cost: CostEstimate }> = ({ cost }) => {
  const total = cost.real_run_cost_usd
  const simCost = cost.simulation_cost_usd
  const savings = total > simCost ? ((total - simCost) / total * 100).toFixed(0) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 12 }}>
        <CostCard label="Real run cost" value={`$${total.toFixed(4)}`} color="#e2e8f0" />
        <CostCard label="Simulation cost" value={`$${simCost.toFixed(4)}`} color="#10b981"
          sub={savings ? `${savings}% cheaper than real run` : undefined} />
        <CostCard label="Token costs" value={`$${cost.token_cost_usd.toFixed(4)}`} color="#a78bfa" />
        <CostCard label="External APIs" value={`$${cost.external_api_cost_usd.toFixed(4)}`}
          color={cost.external_api_cost_usd > 1 ? '#f59e0b' : '#64748b'} />
      </div>

      {/* Per-node breakdown */}
      <div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Per-node cost breakdown
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: '#475569' }}>
              <th style={th}>Node</th>
              <th style={th}>Type</th>
              <th style={{ ...th, textAlign: 'right' }}>Tokens</th>
              <th style={{ ...th, textAlign: 'right' }}>External</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
              <th style={th}>Note</th>
            </tr>
          </thead>
          <tbody>
            {cost.breakdown.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #0f172a' }}>
                <td style={td}><code style={{ color: '#94a3b8' }}>{row.node_id}</code></td>
                <td style={td}><span style={{ color: '#64748b', fontSize: 10 }}>{row.type}</span></td>
                <td style={{ ...td, textAlign: 'right', color: '#a78bfa' }}>${row.token.toFixed(5)}</td>
                <td style={{ ...td, textAlign: 'right', color: row.external > 0.01 ? '#f59e0b' : '#475569' }}>
                  ${row.external.toFixed(5)}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#e2e8f0' }}>
                  ${row.total.toFixed(5)}
                </td>
                <td style={{ ...td, color: '#475569', fontSize: 10 }}>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cost.external_api_cost_usd > 0.10 && (
        <div style={{ fontSize: 11, color: '#f59e0b', background: '#1c1200', borderRadius: 6, padding: '8px 12px' }}>
          ⚠ This workflow has significant external API costs (${cost.external_api_cost_usd.toFixed(4)}).
          Consider adding a budget guard or rate limiting for high-frequency runs.
        </div>
      )}
    </div>
  )
}

const CostCard: React.FC<{ label: string; value: string; color: string; sub?: string }> = ({ label, value, color, sub }) => (
  <div style={{
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    padding: '12px 16px',
    flex: '1 1 120px',
  }}>
    <div style={{ fontSize: 20, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    {sub && <div style={{ fontSize: 10, color: '#10b981', marginTop: 3 }}>{sub}</div>}
  </div>
)

const th: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid #1e293b',
}

const td: React.CSSProperties = {
  padding: '7px 8px',
  color: '#94a3b8',
}

export default CostBreakdown
