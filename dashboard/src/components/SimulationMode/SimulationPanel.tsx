/**
 * SimulationPanel — the main simulation UI.
 *
 * Shows:
 *   - Overall confidence gauge
 *   - Per-node predicted outputs with confidence bars
 *   - Risk alerts (CRITICAL / WARNING / INFO)
 *   - Cost preview (simulation vs real)
 *   - Calibration accuracy badge
 *   - "Run for real" or "Fix issues first" CTA
 *
 * Drop into: dashboard/src/components/SimulationMode/SimulationPanel.tsx
 *
 * Usage:
 *   <SimulationPanel workflowId={id} onRunForReal={() => triggerJob(id)} />
 */

import React, { useState, useCallback } from 'react'
import { useTheme, type ThemeColors } from '../../theme'
import { ConfidenceGauge }    from './ConfidenceGauge'
import { NodeSimulationCard } from './NodeSimulationCard'
import { RiskPanel }          from './RiskPanel'
import { CostBreakdown, type CostEstimate } from './CostBreakdown'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NodeSim {
  node_id:               string
  node_type:             string
  predicted_output:      Record<string, unknown>
  propagated_confidence: float
  confidence_basis:      string
  historical_run_count:  number
  risks:                 RiskItem[]
  warnings:              string[]
  predicted_duration_ms: number
  simulation_note:       string
  confidence_label:      string
  confidence_color:      string
}

interface RiskItem {
  level:                string
  category:             string
  node_id:              string
  message:              string
  detail:               string
  can_simulate_safely:  boolean
  suggested_action:     string
}

interface SimResult {
  simulation_id:         string
  workflow_id:           string
  workflow_name:         string
  overall_confidence:    number
  confidence_summary:    string
  nodes:                 NodeSim[]
  risks:                 RiskItem[]
  cost_estimate:         CostEstimate
  predicted_duration_ms: number
  total_nodes:           number
  safe_to_run:           boolean
  simulation_duration_ms: number
  calibration_accuracy:  number | null
  critical_risk_count:   number
  warning_count:         number
  high_confidence_nodes: number
}

type float = number

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  workflowId:   string
  onRunForReal: () => void
}

type Status = 'idle' | 'running' | 'done' | 'error'

export const SimulationPanel: React.FC<Props> = ({ workflowId, onRunForReal }) => {
  const { colors } = useTheme()
  const styles = mkStyles(colors)
  const [status, setStatus]   = useState<Status>('idle')
  const [result, setResult]   = useState<SimResult | null>(null)
  const [error,  setError]    = useState<string | null>(null)
  const [activeTab, setTab]   = useState<'nodes' | 'risks' | 'cost'>('nodes')

  const runSimulation = useCallback(async () => {
    setStatus('running')
    setResult(null)
    setError(null)
    try {
      const resp = await fetch(
        `${API_BASE}/api/v1/workflows/${workflowId}/simulate`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ include_calibration: true }),
        },
      )
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
      const data: SimResult = await resp.json()
      setResult(data)
      setStatus('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [workflowId])

  return (
    <div style={{ ...styles.container, background: colors.panelBg, borderColor: colors.panelBorder }}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={{ ...styles.title, color: colors.textSecondary }}>Simulation Mode</div>
          <div style={{ ...styles.subtitle, color: colors.textMuted }}>
            Preview what this workflow will do without touching real systems.
          </div>
        </div>
        <button
          onClick={runSimulation}
          disabled={status === 'running'}
          style={{
            ...styles.simBtn,
            opacity: status === 'running' ? 0.6 : 1,
          }}
        >
          {status === 'running' ? 'Simulating…' : 'Run Simulation'}
        </button>
      </div>

      {/* Error */}
      {status === 'error' && (
        <div style={{ ...styles.errorBox, borderColor: colors.panelBorder, color: colors.textMuted }}>
          Simulation failed: {error}
        </div>
      )}

      {/* Loading skeleton */}
      {status === 'running' && (
        <div style={styles.loadingBox}>
          <div style={{ ...styles.loadingText, color: colors.textMuted }}>
            Predicting node outputs, analyzing risks, estimating costs…
          </div>
          <div style={{ ...styles.loadingBar, background: colors.divider }}>
            <div style={styles.loadingBarFill} />
          </div>
        </div>
      )}

      {/* Results */}
      {status === 'done' && result && (
        <>
          {/* Top metrics row */}
          <div style={styles.metricsRow}>
            <ConfidenceGauge
              value={result.overall_confidence}
              summary={result.confidence_summary}
              calibrationAccuracy={result.calibration_accuracy}
            />

            <div style={styles.metricCard}>
              <div style={{ ...styles.metricValue, color: colors.textSecondary }}>
                {result.predicted_duration_ms.toLocaleString()}
                <span style={{ ...styles.metricUnit, color: colors.textMuted }}>ms</span>
              </div>
              <div style={{ ...styles.metricLabel, color: colors.textMuted }}>Predicted duration</div>
            </div>

            <div style={styles.metricCard}>
              <div style={{ ...styles.metricValue, color: colors.textSecondary }}>
                {result.critical_risk_count}
                {result.warning_count > 0 && (
                  <span style={{ fontSize: 14, color: colors.textMuted, marginLeft: 6 }}>
                    +{result.warning_count}
                  </span>
                )}
              </div>
              <div style={{ ...styles.metricLabel, color: colors.textMuted }}>
                {result.critical_risk_count > 0 ? 'Critical risks' : 'Risks clear'}
              </div>
            </div>

            <div style={styles.metricCard}>
              <div style={{ ...styles.metricValue, color: colors.textSecondary }}>
                ${result.cost_estimate.real_run_cost_usd.toFixed(4)}
              </div>
              <div style={{ ...styles.metricLabel, color: colors.textMuted }}>Estimated real cost</div>
              <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                sim cost: ${result.cost_estimate.simulation_cost_usd.toFixed(4)}
              </div>
            </div>

            <div style={styles.metricCard}>
              <div style={{ ...styles.metricValue, color: colors.textSecondary }}>
                {result.high_confidence_nodes}/{result.total_nodes}
              </div>
              <div style={{ ...styles.metricLabel, color: colors.textMuted }}>High-confidence nodes</div>
            </div>
          </div>

          {/* Safe-to-run banner */}
          {result.safe_to_run ? (
            <div style={styles.banner}>
              No critical risks detected. Safe to run.
              <button onClick={onRunForReal} style={styles.runRealBtn}>
                Run for real
              </button>
            </div>
          ) : (
            <div style={styles.banner}>
              {result.critical_risk_count} critical risk{result.critical_risk_count !== 1 ? 's' : ''} detected. Review before running.
              <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 12, color: colors.textMuted }}>
                See Risks tab
              </span>
            </div>
          )}

          {/* Tabs */}
          <div style={{ ...styles.tabs, borderColor: colors.panelBorder }}>
            {(['nodes', 'risks', 'cost'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setTab(tab)}
                style={{
                  ...styles.tab,
                  color: activeTab === tab ? colors.textSecondary : colors.textMuted,
                  borderBottomColor: activeTab === tab ? colors.textSecondary : 'transparent',
                }}
              >
                {tab === 'nodes' && `Nodes (${result.total_nodes})`}
                {tab === 'risks' && `Risks (${result.risks.length})`}
                {tab === 'cost'  && 'Cost breakdown'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'nodes' && (
            <div style={styles.nodeGrid}>
              {result.nodes.map(node => (
                <NodeSimulationCard key={node.node_id} node={node} />
              ))}
            </div>
          )}
          {activeTab === 'risks' && <RiskPanel risks={result.risks} />}
          {activeTab === 'cost'  && <CostBreakdown cost={result.cost_estimate} />}

          <div style={{ ...styles.footer, color: colors.textMuted }}>
            Simulation ID: <code style={{ color: colors.codeColor }}>{result.simulation_id}</code>
            {'  ·  '}
            Completed in {result.simulation_duration_ms}ms
            {result.calibration_accuracy != null && (
              <>{'  ·  '}
                <span style={{ color: colors.textMuted }}>
                  Historical accuracy: {(result.calibration_accuracy * 100).toFixed(1)}%
                </span>
              </>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mkStyles = (colors: ThemeColors) => ({
  container: {
    borderRadius: 0,
    border: '1px solid',
    padding: 24,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
  },
  simBtn: {
    background: colors.rowHover,
    border: `1px solid ${colors.panelBorder}`,
    color: colors.textSecondary,
    borderRadius: 4,
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  errorBox: {
    border: '1px solid',
    borderRadius: 4,
    padding: '12px 16px',
    fontSize: 12,
    marginBottom: 16,
  },
  loadingBox: {
    padding: '32px 0',
    textAlign: 'center' as const,
  },
  loadingText: {
    fontSize: 12,
    marginBottom: 16,
  },
  loadingBar: {
    height: 2,
    borderRadius: 2,
    overflow: 'hidden',
    maxWidth: 400,
    margin: '0 auto',
  },
  loadingBarFill: {
    height: '100%',
    width: '30%',
    background: '#333',
    animation: 'shimmer 1.5s ease-in-out infinite',
  },
  metricsRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap' as const,
  },
  metricCard: {
    background: colors.statCardBg,
    border: `1px solid ${colors.panelBorder}`,
    borderRadius: 4,
    padding: '12px 16px',
    flex: '1 1 120px',
    minWidth: 100,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 4,
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: 400,
    marginLeft: 2,
  },
  metricLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap' as const,
  },
  banner: {
    background: colors.rowAlt,
    border: `1px solid ${colors.panelBorder}`,
    borderRadius: 4,
    padding: '10px 16px',
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  runRealBtn: {
    background: colors.panelBorder,
    color: colors.textSecondary,
    border: `1px solid ${colors.divider}`,
    borderRadius: 4,
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
  },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 16,
    borderBottom: '1px solid',
    paddingBottom: 0,
  },
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '1px solid transparent',
    fontSize: 12,
    fontWeight: 500,
    padding: '8px 12px',
    cursor: 'pointer',
    marginBottom: -1,
  },
  nodeGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  footer: {
    marginTop: 20,
    fontSize: 11,
    textAlign: 'center' as const,
  },
})

export default SimulationPanel
