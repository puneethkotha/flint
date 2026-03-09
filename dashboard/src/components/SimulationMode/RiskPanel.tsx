/**
 * RiskPanel — shows all detected risks with suggested actions.
 */

import React from 'react'
import { useTheme } from '../../theme'

interface RiskItem {
  level:               string
  category:            string
  node_id:             string
  message:             string
  detail:              string
  can_simulate_safely: boolean
  suggested_action:    string
}


const CATEGORY_LABELS: Record<string, string> = {
  irreversible:   'Irreversible',
  financial:      'Financial',
  pii:            'PII / Privacy',
  external:       'External side-effect',
  destructive:    'Destructive',
  human_required: 'Needs human approval',
  security:       'Security',
  rate_limit:     'Rate limit risk',
}

export const RiskPanel: React.FC<{ risks: RiskItem[] }> = ({ risks }) => {
  const { colors } = useTheme()

  if (risks.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center' as const, color: colors.textMuted, fontSize: 13 }}>
        No risks detected. This workflow looks safe to run.
      </div>
    )
  }

  const critical = risks.filter(r => r.level === 'critical')
  const warning  = risks.filter(r => r.level === 'warning')
  const info     = risks.filter(r => r.level === 'info')

  const ordered = [...critical, ...warning, ...info]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ordered.map((risk, i) => (
          <div key={i} style={{
            background: colors.rowAlt,
            border: `1px solid ${colors.panelBorder}`,
            borderRadius: 4,
            padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, lineHeight: 1.3 }}>
                  {risk.message}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, color: colors.textMuted, background: colors.statCardBg, borderRadius: 4, padding: '2px 6px' }}>
                    {CATEGORY_LABELS[risk.category] ?? risk.category}
                  </span>
                  <span style={{ fontSize: 10, color: colors.textMuted, background: colors.statCardBg, borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                    node: {risk.node_id}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.4 }}>
                {risk.detail}
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted, background: colors.statCardBg, borderRadius: 4, padding: '6px 8px', lineHeight: 1.4 }}>
                Suggested: {risk.suggested_action}
              </div>
              {!risk.can_simulate_safely && (
                <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 500, lineHeight: 1.4 }}>
                  This node was skipped in simulation. Real execution will trigger this risk.
                </div>
              )}
            </div>
          </div>
      ))}
    </div>
  )
}

export default RiskPanel
