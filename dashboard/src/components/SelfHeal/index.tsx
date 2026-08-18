/**
 * Self-Heal Lab — Flint's reliability theater.
 *
 * Left: describe a workflow, then watch the monitor → detect → diagnose →
 * recover → verify loop play out as a live trace with computed metrics.
 * Right: the DAG animates — nodes turn red where they're fragile, violet while
 * Flint patches them, green once healed — with a reliability score that climbs.
 *
 * Everything is driven by the real /reliability/heal endpoint (real failure
 * taxonomy + applicable fix patches). No execution, no cost beyond an optional
 * AI narration on the free provider.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, HealResult } from '../../api/client'
import { HealStatus } from './HealNode'
import HealDAGPanel from './HealDAGPanel'
import { ShieldPulse } from '../icons'
import { useTheme } from '../../theme'
import { useAuth } from '../../context/AuthContext'
import { recordUserEvent } from '../../utils/userAnalytics'

const EXAMPLES = [
  'Every morning fetch top Hacker News stories, summarize with an LLM, and post to Slack',
  'Hourly, pull new GitHub issues, classify them with an LLM, and insert into Postgres',
  'Fetch Stripe payouts daily, transform them, and send a webhook to our finance channel',
]

type Phase = 'idle' | 'scanning' | 'detect' | 'diagnose' | 'recover' | 'verify' | 'done' | 'error'

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Describe a workflow to begin',
  scanning: 'Monitoring — mapping the workflow…',
  detect: 'Detecting fragile steps…',
  diagnose: 'Diagnosing failure modes…',
  recover: 'Recovering — patching reliability gaps…',
  verify: 'Verifying the healed workflow…',
  done: 'Healed — workflow hardened',
  error: 'Something went wrong',
}

export default function SelfHeal() {
  const { colors } = useTheme()
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<HealResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [statusMap, setStatusMap] = useState<Record<string, HealStatus>>({})
  const [vulnMap, setVulnMap] = useState<Record<string, number>>({})
  const [score, setScore] = useState(0)
  const [grade, setGrade] = useState('—')
  const [revealed, setRevealed] = useState(0)      // trace steps shown in the log

  const timers = useRef<number[]>([])
  const dagRef = useRef<Record<string, unknown> | null>(null)

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => () => clearTimers(), [])

  const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)) }

  const play = useCallback((res: HealResult) => {
    const trace = res.trace
    dagRef.current = res.patched_dag
    setResult(res)
    setRevealed(0)
    setScore(res.metrics.score_before)
    setGrade(res.metrics.grade_before)

    // Monitor: everything scanning.
    const scanning: Record<string, HealStatus> = {}
    trace.forEach(t => { scanning[t.node_id] = 'scanning' })
    setStatusMap({ ...scanning })
    setPhase('scanning')

    // Detect: fragile nodes turn red (staggered); solid nodes go straight healed.
    at(650, () => setPhase('detect'))
    trace.forEach((t, i) => {
      at(700 + i * 260, () => {
        setStatusMap(prev => ({ ...prev, [t.node_id]: t.vulnerabilities.length ? 'vulnerable' : 'healed' }))
        setVulnMap(prev => ({ ...prev, [t.node_id]: t.vulnerabilities.length }))
      })
    })
    const afterDetect = 700 + trace.length * 260 + 300

    at(afterDetect, () => setPhase('diagnose'))

    // Recover: patch each healable node (violet) then heal (green); reveal log rows.
    at(afterDetect + 500, () => setPhase('recover'))
    let cursor = afterDetect + 700
    trace.forEach((t, i) => {
      if (t.healed) {
        at(cursor, () => setStatusMap(prev => ({ ...prev, [t.node_id]: 'patching' })))
        at(cursor + 550, () => {
          setStatusMap(prev => ({ ...prev, [t.node_id]: 'healed' }))
          setRevealed(i + 1)
        })
        cursor += 900
      } else {
        at(cursor, () => setRevealed(i + 1))
        cursor += 250
      }
    })

    // Verify: climb the reliability score, then done.
    at(cursor + 200, () => { setPhase('verify'); setScore(res.metrics.score_after); setGrade(res.metrics.grade_after) })
    at(cursor + 1300, () => { setPhase('done'); setRevealed(trace.length) })
  }, [])

  const run = useCallback(async (description: string) => {
    const text = description.trim()
    if (!text) return
    clearTimers()
    setError(null)
    setResult(null)
    setStatusMap({})
    setVulnMap({})
    setScore(0)
    setGrade('—')
    setPhase('scanning')
    if (user) recordUserEvent(user.id, user.name || user.email, { type: 'self_heal_run', data: { queryPreview: text.slice(0, 200) } })
    try {
      const res = await api.healWorkflow({ description: text, narrate: true })
      play(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
      setPhase('error')
    }
  }, [play, user])

  const busy = phase !== 'idle' && phase !== 'done' && phase !== 'error'
  const m = result?.metrics

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
      height: 'calc(100vh - 80px)', minHeight: 0,
    }} className="heal-grid">
      {/* Left: control + trace */}
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: colors.panelBg, borderRadius: 12, border: `1px solid ${colors.panelBorder}`, overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${colors.panelBorder}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed',
            }}>
              <ShieldPulse size={16} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Self-Heal</div>
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
            Audit a workflow's resilience and auto-patch its reliability gaps.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Input */}
          <div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(input) }}
              placeholder="Describe a workflow to stress-test… (⌘/Ctrl+Enter to run)"
              rows={3}
              disabled={busy}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                background: colors.inputBg, border: `1px solid ${colors.panelBorder}`,
                borderRadius: 10, padding: '12px 14px', color: colors.textPrimary,
                fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              onClick={() => run(input)}
              disabled={!input.trim() || busy}
              style={{
                marginTop: 8, width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none',
                background: input.trim() && !busy ? '#7c3aed' : colors.panelBorder,
                color: input.trim() && !busy ? '#fff' : colors.textMuted,
                fontSize: 13, fontWeight: 600, cursor: input.trim() && !busy ? 'pointer' : 'default',
              }}
            >
              {busy ? 'Running self-heal…' : 'Run Self-Heal'}
            </button>
          </div>

          {/* Examples (only before first run) */}
          {phase === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Try a fragile workflow</div>
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => { setInput(ex); run(ex) }}
                  style={{
                    background: colors.inputBg, border: `1px solid ${colors.panelBorder}`, borderRadius: 8,
                    padding: '10px 12px', color: colors.textSecondary, fontSize: 12, textAlign: 'left', cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = colors.panelBorder)}
                >{ex}</button>
              ))}
            </div>
          )}

          {error && (
            <div style={{ border: `1px solid ${colors.panelBorder}`, borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#ef4444' }}>
              {error}
            </div>
          )}

          {/* Metrics strip */}
          {m && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <Metric label="Reliability" value={`${m.score_before} → ${m.score_after}`} accent="#10b981" sub={`+${m.score_delta} · ${m.grade_before}→${m.grade_after}`} colors={colors} />
              <Metric label="Vulnerabilities closed" value={`${m.vulnerabilities_closed}`} accent="#ef4444" sub={`${m.vulnerabilities_before} → ${m.vulnerabilities_after}`} colors={colors} />
              <Metric label="Fixes applied" value={`${m.fixes_applied}`} accent="#7c3aed" sub="auto-patched" colors={colors} />
              <Metric label="Est. MTTR" value={`${m.estimated_mttr_seconds}s`} accent="#F59E0B" sub={`~${m.retry_waste_avoided_seconds}s retry-waste avoided`} colors={colors} />
            </div>
          )}

          {/* AI narration */}
          {phase === 'done' && result?.narration && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.10), rgba(15,23,42,0.2))',
              border: '1px solid #7c3aed', borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Reliability engineer's summary
              </div>
              <div style={{ fontSize: 12.5, color: colors.textSecondary, lineHeight: 1.6 }}>{result.narration}</div>
            </div>
          )}

          {/* Trace log */}
          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Heal trace</div>
              {result.trace.slice(0, revealed).map((t, i) => (
                <TraceCard key={t.node_id + i} step={t} colors={colors} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: live DAG */}
      <HealDAGPanel
        dag={dagRef.current}
        statusMap={statusMap}
        vulnMap={vulnMap}
        score={score}
        grade={grade}
        phaseLabel={PHASE_LABEL[phase]}
        edgeColor={phase === 'done' ? '#10b981' : phase === 'detect' ? '#ef4444' : '#7c3aed'}
      />

      <style>{`
        @media (max-width: 899px) {
          .heal-grid { grid-template-columns: 1fr !important; height: auto !important; }
        }
      `}</style>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const Metric: React.FC<{ label: string; value: string; sub?: string; accent: string; colors: ReturnType<typeof useTheme>['colors'] }> =
({ label, value, sub, accent, colors }) => (
  <div style={{ background: colors.statCardBg, border: `1px solid ${colors.panelBorder}`, borderRadius: 8, padding: '10px 12px' }}>
    <div style={{ fontSize: 18, fontWeight: 700, color: accent, fontFamily: 'ui-monospace, monospace', lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 4 }}>{label}</div>
    {sub && <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{sub}</div>}
  </div>
)

const TraceCard: React.FC<{ step: import('../../api/client').HealTraceStep; colors: ReturnType<typeof useTheme>['colors'] }> =
({ step, colors }) => {
  const [showPatch, setShowPatch] = useState(false)
  const healed = step.healed
  return (
    <div style={{
      border: `1px solid ${healed ? 'rgba(16,185,129,0.4)' : colors.panelBorder}`,
      borderRadius: 8, padding: '10px 12px', animation: 'healFadeIn 0.25s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: healed ? '#10b981' : '#64748b', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, fontFamily: 'ui-monospace, monospace' }}>{step.node_id}</span>
          <span style={{ fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' }}>{step.node_type}</span>
        </div>
        <span style={{ fontSize: 11, color: healed ? '#10b981' : colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
          {step.score_before} → {step.score_after}
        </span>
      </div>

      {step.vulnerabilities.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {step.vulnerabilities.map((v, i) => (
            <span key={i} title={v.description} style={{
              fontSize: 10, color: '#fca5a5', background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5, padding: '2px 6px',
            }}>{v.label}</span>
          ))}
        </div>
      )}

      {step.fixes_applied.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {step.fixes_applied.map((f, i) => (
            <div key={i} style={{ fontSize: 11.5, color: colors.textSecondary, lineHeight: 1.45, display: 'flex', gap: 6 }}>
              <span style={{ color: '#10b981' }}>✓</span><span>{f}</span>
            </div>
          ))}
          {step.fix_patch && (
            <button onClick={() => setShowPatch(s => !s)} style={{
              alignSelf: 'flex-start', marginTop: 2, background: 'none', border: 'none',
              color: '#a78bfa', fontSize: 10.5, cursor: 'pointer', padding: 0,
            }}>{showPatch ? 'hide patch' : 'view patch'}</button>
          )}
          {showPatch && step.fix_patch && (
            <pre style={{
              margin: '4px 0 0', background: '#020617', borderRadius: 6, padding: '8px 10px',
              fontSize: 10.5, color: '#86efac', overflow: 'auto', maxHeight: 180,
            }}>{JSON.stringify(step.fix_patch, null, 2)}</pre>
          )}
        </div>
      )}

      <style>{`@keyframes healFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
