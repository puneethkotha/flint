/**
 * CostBreakdown — shows predicted cost before running for real.
 */

import React from 'react'
import { useTheme } from '../../theme'

export interface CostEstimate {
  simulation_cost_usd:   number
  real_run_cost_usd:     number
  token_cost_usd:        number
  external_api_cost_usd: number
  compute_cost_usd:      number
  breakdown:             Array<{ node_id: string; type: string; total: number; token: number; external: number; note: string }>
}

export const CostBreakdown: React.FC<{ cost: CostEstimate }> = ({ cost }) => {
  const { colors } = useTheme()
  const total = cost.real_run_cost_usd
  const simCost = cost.simulation_cost_usd
  const savings = total > simCost ? ((total - simCost) / total * 100).toFixed(0) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <CostCard colors={colors} label="Real run cost" value={`$${total.toFixed(4)}`} />
        <CostCard colors={colors} label="Simulation cost" value={`$${simCost.toFixed(4)}`}
          sub={savings ? `${savings}% cheaper than real run` : undefined} />
        <CostCard colors={colors} label="Token costs" value={`$${cost.token_cost_usd.toFixed(4)}`} />
        <CostCard colors={colors} label="External APIs" value={`$${cost.external_api_cost_usd.toFixed(4)}`} />
      </div>

      <div>
        <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Per-node cost breakdown
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: colors.textMuted }}>
              <th style={{ ...thStyle, borderColor: colors.panelBorder }}>Node</th>
              <th style={{ ...thStyle, borderColor: colors.panelBorder }}>Type</th>
              <th style={{ ...thStyle, borderColor: colors.panelBorder, textAlign: 'right' }}>Tokens</th>
              <th style={{ ...thStyle, borderColor: colors.panelBorder, textAlign: 'right' }}>External</th>
              <th style={{ ...thStyle, borderColor: colors.panelBorder, textAlign: 'right' }}>Total</th>
              <th style={{ ...thStyle, borderColor: colors.panelBorder }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {cost.breakdown.map((row, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${colors.divider}` }}>
                <td style={{ ...tdStyle, color: colors.textSecondary }}><code style={{ color: colors.codeColor }}>{row.node_id}</code></td>
                <td style={{ ...tdStyle, color: colors.textMuted }}><span style={{ fontSize: 10 }}>{row.type}</span></td>
                <td style={{ ...tdStyle, textAlign: 'right', color: colors.textSecondary }}>${row.token.toFixed(5)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', color: colors.textMuted }}>${row.external.toFixed(5)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: colors.textSecondary }}>${row.total.toFixed(5)}</td>
                <td style={{ ...tdStyle, color: colors.textMuted, fontSize: 10 }}>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cost.external_api_cost_usd > 0.10 && (
        <div style={{ fontSize: 11, color: colors.textMuted, background: colors.rowAlt, borderRadius: 4, padding: '8px 12px' }}>
          This workflow has significant external API costs (${cost.external_api_cost_usd.toFixed(4)}).
          Consider adding a budget guard or rate limiting for high-frequency runs.
        </div>
      )}
    </div>
  )
}

const CostCard: React.FC<{ colors: import('../../theme').ThemeColors; label: string; value: string; sub?: string }> = ({ colors, label, value, sub }) => (
  <div style={{
    background: colors.statCardBg,
    border: `1px solid ${colors.panelBorder}`,
    borderRadius: 4,
    padding: '12px 16px',
    flex: '1 1 120px',
  }}>
    <div style={{ fontSize: 20, fontWeight: 700, color: colors.textSecondary, marginBottom: 4 }}>{value}</div>
    <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    {sub && <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 3 }}>{sub}</div>}
  </div>
)

const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid',
}

const tdStyle: React.CSSProperties = {
  padding: '7px 8px',
}

export default CostBreakdown
