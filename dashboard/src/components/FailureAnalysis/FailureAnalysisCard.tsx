/**
 * Phase 3c: Failure Analysis Card — shown below the DAG when a job fails.
 * Drop into: dashboard/src/components/FailureAnalysis/FailureAnalysisCard.tsx
 *
 * Usage in the job detail view:
 *   {job.status === 'failed' && job.failure_analysis && (
 *     <FailureAnalysisCard analysis={job.failure_analysis} onApplyFix={handleApplyFix} />
 *   )}
 */

import React, { useState } from 'react'
import { useTheme } from '../../theme'

interface FailureAnalysis {
  explanation: string
  suggested_fix: string
  fix_patch?: Record<string, unknown> | null
  confidence: 'high' | 'medium' | 'low'
}

interface FailureAnalysisCardProps {
  analysis: FailureAnalysis
  /** Called with the fix_patch when user clicks "Apply fix" */
  onApplyFix?: (patch: Record<string, unknown>) => void
}

const CONFIDENCE_COLORS = {
  high: '#10b981',
  medium: '#f59e0b',
  low: '#6b7280',
}

const CONFIDENCE_LABELS = {
  high: '● High confidence',
  medium: '● Medium confidence',
  low: '● Low confidence',
}

export const FailureAnalysisCard: React.FC<FailureAnalysisCardProps> = ({
  analysis,
  onApplyFix,
}) => {
  const { colors } = useTheme()
  const [dismissed, setDismissed] = useState(false)
  const [showPatch, setShowPatch] = useState(false)

  if (dismissed) return null

  const confidenceColor = CONFIDENCE_COLORS[analysis.confidence]
  const hasPatch = !!analysis.fix_patch

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #1a0f2e 0%, #0f172a 100%)',
        border: '1px solid #7c3aed',
        borderRadius: 12,
        padding: '16px 20px',
        marginTop: 20,
        position: 'relative',
      }}
    >
      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#475569',
          fontSize: 16,
          lineHeight: 1,
        }}
        title="Dismiss"
      >
        ×
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.textSecondary }}>
            Failure analysis
          </div>
          <div style={{ fontSize: 11, color: confidenceColor, marginTop: 2 }}>
            {CONFIDENCE_LABELS[analysis.confidence]}
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div
        style={{
          fontSize: 13,
          color: '#e2e8f0',
          lineHeight: 1.6,
          marginBottom: 14,
          paddingBottom: 14,
          borderBottom: '1px solid #1e293b',
        }}
      >
        {analysis.explanation}
      </div>

      {/* Suggested fix footer */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Suggested fix
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
            {analysis.suggested_fix}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          {hasPatch && onApplyFix && (
            <button
              onClick={() => onApplyFix(analysis.fix_patch!)}
              style={{
                background: '#7c3aed',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Apply fix →
            </button>
          )}
          {hasPatch && (
            <button
              onClick={() => setShowPatch(!showPatch)}
              style={{
                background: 'none',
                color: '#64748b',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {showPatch ? 'Hide patch' : 'View patch'}
            </button>
          )}
        </div>
      </div>

      {/* Optional: show the fix_patch JSON */}
      {showPatch && analysis.fix_patch && (
        <pre
          style={{
            marginTop: 12,
            background: '#020617',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 11,
            color: '#86efac',
            overflow: 'auto',
            maxHeight: 200,
          }}
        >
          {JSON.stringify(analysis.fix_patch, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default FailureAnalysisCard
