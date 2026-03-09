/**
 * RiskPanel — shows all detected risks with suggested actions.
 * Drop into: dashboard/src/components/SimulationMode/RiskPanel.tsx
 */

import React from 'react'

interface RiskItem {
  level:               string
  category:            string
  node_id:             string
  message:             string
  detail:              string
  can_simulate_safely: boolean
  suggested_action:    string
}

const LEVEL_CONFIG = {
  critical: { color: '#ef4444', bg: '#1c0a0a', border: '#ef4444', icon: '🚨' },
  warning:  { color: '#f59e0b', bg: '#1c1200', border: '#f59e0b', icon: '⚠️' },
  info:     { color: '#60a5fa', bg: '#0c1525', border: '#1e3a5f', icon: 'ℹ️' },
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
  if (risks.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: '#10b981', fontSize: 14 }}>
        ✓ No risks detected — this workflow looks safe to run.
      </div>
    )
  }

  const critical = risks.filter(r => r.level === 'critical')
  const warning  = risks.filter(r => r.level === 'warning')
  const info     = risks.filter(r => r.level === 'info')

  const ordered = [...critical, ...warning, ...info]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ordered.map((risk, i) => {
        const cfg = LEVEL_CONFIG[risk.level as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.info
        return (
          <div key={i} style={{
            background: cfg.bg,
            border: `1px solid ${cfg.border}`,
            borderLeft: `4px solid ${cfg.color}`,
            borderRadius: 8,
            padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
              <span>{cfg.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>
                    {risk.message}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#475569', background: '#0f172a', borderRadius: 4, padding: '2px 6px' }}>
                      {CATEGORY_LABELS[risk.category] ?? risk.category}
                    </span>
                    <span style={{ fontSize: 10, color: '#475569', background: '#0f172a', borderRadius: 4, padding: '2px 6px' }}>
                      node: {risk.node_id}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                  {risk.detail}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', background: '#0f172a', borderRadius: 4, padding: '4px 8px' }}>
                  💡 {risk.suggested_action}
                </div>
                {!risk.can_simulate_safely && (
                  <div style={{ fontSize: 10, color: '#ef4444', marginTop: 6, fontWeight: 600 }}>
                    ⚡ This node was skipped in simulation — real execution will trigger this risk.
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default RiskPanel
