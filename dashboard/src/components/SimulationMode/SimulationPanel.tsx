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
import { ConfidenceGauge }    from './ConfidenceGauge'
import { NodeSimulationCard } from './NodeSimulationCard'
import { RiskPanel }          from './RiskPanel'
import { CostBreakdown }      from './CostBreakdown'

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

interface CostEstimate {
  simulation_cost_usd:   number
  real_run_cost_usd:     number
  token_cost_usd:        number
  external_api_cost_usd: number
  breakdown:             Array<Record<string, unknown>>
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
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>🔮 Simulation Mode</div>
          <div style={styles.subtitle}>
            Preview exactly what this workflow will do — without touching real systems.
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
          {status === 'running' ? '⟳  Simulating…' : '▶  Run Simulation'}
        </button>
      </div>

      {/* Error */}
      {status === 'error' && (
        <div style={styles.errorBox}>
          ✗ Simulation failed: {error}
        </div>
      )}

      {/* Loading skeleton */}
      {status === 'running' && (
        <div style={styles.loadingBox}>
          <div style={styles.loadingText}>
            Predicting node outputs, analyzing risks, estimating costs…
          </div>
          <div style={styles.loadingBar}>
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
              <div style={styles.metricValue}>
                {result.predicted_duration_ms.toLocaleString()}
                <span style={styles.metricUnit}>ms</span>
              </div>
              <div style={styles.metricLabel}>Predicted duration</div>
            </div>

            <div style={styles.metricCard}>
              <div style={styles.metricValue}>
                <span style={{ color: result.critical_risk_count > 0 ? '#ef4444' : '#10b981' }}>
                  {result.critical_risk_count}
                </span>
                {result.warning_count > 0 && (
                  <span style={{ fontSize: 14, color: '#f59e0b', marginLeft: 6 }}>
                    +{result.warning_count}⚠
                  </span>
                )}
              </div>
              <div style={styles.metricLabel}>
                {result.critical_risk_count > 0 ? 'Critical risks' : 'Risks clear'}
              </div>
            </div>

            <div style={styles.metricCard}>
              <div style={styles.metricValue}>
                ${result.cost_estimate.real_run_cost_usd.toFixed(4)}
              </div>
              <div style={styles.metricLabel}>Estimated real cost</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                sim cost: ${result.cost_estimate.simulation_cost_usd.toFixed(4)}
              </div>
            </div>

            <div style={styles.metricCard}>
              <div style={styles.metricValue}>
                {result.high_confidence_nodes}/{result.total_nodes}
              </div>
              <div style={styles.metricLabel}>High-confidence nodes</div>
            </div>
          </div>

          {/* Safe-to-run banner */}
          {result.safe_to_run ? (
            <div style={styles.safeBanner}>
              ✓ No critical risks detected — safe to run
              <button onClick={onRunForReal} style={styles.runRealBtn}>
                Run for real →
              </button>
            </div>
          ) : (
            <div style={styles.unsafeBanner}>
              ✗ {result.critical_risk_count} critical risk{result.critical_risk_count !== 1 ? 's' : ''} detected
              — review before running
              <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 12 }}>
                See Risks tab ↓
              </span>
            </div>
          )}

          {/* Tabs */}
          <div style={styles.tabs}>
            {(['nodes', 'risks', 'cost'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setTab(tab)}
                style={{
                  ...styles.tab,
                  ...(activeTab === tab ? styles.tabActive : {}),
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

          <div style={styles.footer}>
            Simulation ID: <code style={{ color: '#64748b' }}>{result.simulation_id}</code>
            {'  ·  '}
            Completed in {result.simulation_duration_ms}ms
            {result.calibration_accuracy != null && (
              <>{'  ·  '}
                <span style={{ color: '#10b981' }}>
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#0a0a14',
    borderRadius: 12,
    border: '1px solid #1e293b',
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
    fontSize: 20,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  simBtn: {
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  errorBox: {
    background: '#1c0a0a',
    border: '1px solid #ef4444',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 16,
  },
  loadingBox: {
    padding: '32px 0',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
  },
  loadingBar: {
    height: 3,
    background: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
    maxWidth: 400,
    margin: '0 auto',
  },
  loadingBarFill: {
    height: '100%',
    width: '40%',
    background: 'linear-gradient(90deg, transparent, #7c3aed, transparent)',
    animation: 'shimmer 1.5s ease-in-out infinite',
  },
  metricsRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  metricCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    padding: '12px 16px',
    flex: '1 1 120px',
    minWidth: 110,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 4,
  },
  metricUnit: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 400,
    marginLeft: 2,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  safeBanner: {
    background: '#022c22',
    border: '1px solid #10b981',
    borderRadius: 8,
    padding: '10px 16px',
    color: '#34d399',
    fontSize: 13,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  unsafeBanner: {
    background: '#1c0a0a',
    border: '1px solid #ef4444',
    borderRadius: 8,
    padding: '10px 16px',
    color: '#ef4444',
    fontSize: 13,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    marginBottom: 16,
  },
  runRealBtn: {
    background: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 16,
    borderBottom: '1px solid #1e293b',
    paddingBottom: 0,
  },
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#64748b',
    fontSize: 13,
    fontWeight: 500,
    padding: '8px 14px',
    cursor: 'pointer',
    marginBottom: -1,
  },
  tabActive: {
    color: '#a78bfa',
    borderBottomColor: '#7c3aed',
  },
  nodeGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  footer: {
    marginTop: 20,
    fontSize: 11,
    color: '#334155',
    textAlign: 'center',
  },
}

export default SimulationPanel
