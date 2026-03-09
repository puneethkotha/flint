import React, { useState, useEffect } from 'react'
import { api } from '../../api/client'
import DAGVisualization from '../DAGVisualization'
import RunChoiceModal, { getLastDemo, setLastDemo, clearLastDemo } from '../RunChoiceModal'
import { useTheme } from '../../theme'
import { useAuth } from '../../context/AuthContext'
import { recordUserEvent } from '../../utils/userAnalytics'

const TYPEWRITER_PLACEHOLDERS = [
  'Fetch top HN stories, summarize with Claude, post to Slack...',
  'Every hour pull orders from API, compute revenue, store in Postgres...',
  'Run tests, if passing deploy to production and notify the team...',
]

const INSPIRATION_CARDS = [
  {
    title: 'GitHub → Slack digest',
    subtitle: 'Fetch trending repos, summarize, post daily',
    icon: 'HTTP', color: '#2563eb',
    prompt: 'Every morning at 9am, fetch GitHub trending repos and post a summary to Slack',
  },
  {
    title: 'Revenue sync',
    subtitle: 'Pull orders, compute totals, write to Postgres',
    icon: 'SQL', color: '#7c3aed',
    prompt: 'Every hour pull new orders from API, compute revenue totals, and store in Postgres',
  },
  {
    title: 'LLM pipeline',
    subtitle: 'Scrape → summarize with Claude → email',
    icon: 'LLM', color: '#059669',
    prompt: 'Scrape Hacker News front page, summarize top 5 stories with Claude, email me the digest',
  },
]

type ScheduleMode = 'once' | 'recurring' | 'trigger'

const CRON_PRESETS: { key: string; label: string; cron: string }[] = [
  { key: 'daily-9', label: 'Every day at 9am', cron: '0 9 * * *' },
  { key: 'daily-8', label: 'Every day at 8am', cron: '0 8 * * *' },
  { key: 'mon-8', label: 'Every Monday at 8am', cron: '0 8 * * 1' },
  { key: 'hourly', label: 'Every hour', cron: '0 * * * *' },
  { key: '15min', label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { key: 'custom', label: 'Custom (cron)', cron: '' },
]

function cronToHuman(cron: string): string {
  if (!cron || !cron.trim()) return 'Enter a 5-field cron (e.g. 0 9 * * *)'
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return 'Invalid cron (need 5 fields: min hour day month dow)'
  const [min, hour, day, month, dow] = parts
  if (min === '0' && hour !== '*' && day === '*' && month === '*' && dow === '*') {
    return `Every day at ${hour}:00`
  }
  if (min === '0' && hour !== '*' && day === '*' && month === '*' && dow !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const d = dow === '0' || dow === '7' ? 'Sun' : days[parseInt(dow, 10)] || dow
    return `Every ${d} at ${hour}:00`
  }
  if (min.startsWith('*/') && hour === '*' && day === '*' && month === '*' && dow === '*') {
    const n = min.slice(2)
    return `Every ${n} minutes`
  }
  if (min === '0' && hour === '*' && day === '*' && month === '*' && dow === '*') return 'Every hour'
  return cron
}

function useTypewriter(strings: string[], enabled: boolean) {
  const [display, setDisplay] = useState('')
  const [strIdx, setStrIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const current = strings[strIdx]
    let timeout: ReturnType<typeof setTimeout>
    if (paused) {
      timeout = setTimeout(() => setPaused(false), 1800)
    } else if (!deleting && charIdx < current.length) {
      timeout = setTimeout(() => { setDisplay(current.slice(0, charIdx + 1)); setCharIdx(c => c + 1) }, 38)
    } else if (!deleting && charIdx === current.length) {
      setPaused(true); setDeleting(true)
    } else if (deleting && charIdx > 0) {
      timeout = setTimeout(() => { setDisplay(current.slice(0, charIdx - 1)); setCharIdx(c => c - 1) }, 18)
    } else if (deleting && charIdx === 0) {
      setDeleting(false); setStrIdx(i => (i + 1) % strings.length)
    }
    return () => clearTimeout(timeout)
  }, [charIdx, deleting, paused, strIdx, strings, enabled])
  return display
}

interface WorkflowCreatorProps {
  initialDescription?: string
  onPrefillConsumed?: () => void
  onOpenLoginPage?: () => void
}

export default function WorkflowCreator({ initialDescription, onPrefillConsumed, onOpenLoginPage }: WorkflowCreatorProps) {
  const { colors } = useTheme()
  const { user } = useAuth()
  const [description, setDescription] = useState('')
  const [dag, setDag] = useState<Record<string, unknown> | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'running'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({})
  const [showRunChoiceModal, setShowRunChoiceModal] = useState(false)
  const [lastDemoToSave, setLastDemoToSave] = useState<{ dag: Record<string, unknown>; description: string } | null>(null)
  const [savingDemo, setSavingDemo] = useState(false)
  const [focused, setFocused] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('once')
  const [cronPresetKey, setCronPresetKey] = useState('daily-9')
  const [customCron, setCustomCron] = useState('')
  const [createdWorkflowId, setCreatedWorkflowId] = useState<string | null>(null)

  const placeholder = useTypewriter(TYPEWRITER_PLACEHOLDERS, !description && !focused)

  // Prefill from Templates "Use Template"
  React.useEffect(() => {
    if (initialDescription) {
      setDescription(initialDescription)
      onPrefillConsumed?.()
    }
  }, [initialDescription, onPrefillConsumed])

  // When user logs in, check for unsaved demo
  useEffect(() => {
    if (user) {
      const last = getLastDemo()
      if (last) setLastDemoToSave(last)
    }
  }, [user])

  const handlePreview = async () => {
    if (!description.trim()) return
    if (user) {
      recordUserEvent(user.id, user.name || user.email, {
        type: 'workflow_preview',
        data: { descriptionPreview: description.slice(0, 200) },
      })
    }
    setLoading(true); setPhase('parsing'); setError(null)
    try {
      const result = await api.parseWorkflow(description)
      setDag(result.dag); setWarnings(result.warnings)
    } catch (e) { setError(e instanceof Error ? e.message : 'Parse failed') }
    finally { setLoading(false); setPhase('idle') }
  }

  const handleCreateAndRun = async () => {
    if (!description.trim()) return
    if (!user) {
      setShowRunChoiceModal(true)
      return
    }
    setLoading(true); setPhase('parsing'); setError(null)
    try {
      const isRecurring = scheduleMode === 'recurring'
      const cronExpr = isRecurring
        ? (cronPresetKey === 'custom' ? customCron.trim() : CRON_PRESETS.find(p => p.key === cronPresetKey)?.cron ?? '')
        : undefined
      const payload: Parameters<typeof api.createWorkflow>[0] = {
        description,
        run_immediately: scheduleMode === 'once',
        schedule: isRecurring && cronExpr ? cronExpr : null,
        timezone: 'UTC',
      }
      const wf = await api.createWorkflow(payload)
      recordUserEvent(user.id, user.name || user.email, {
        type: 'workflow_created',
        data: { workflowId: wf.id, descriptionPreview: description.slice(0, 200), scheduleMode },
      })
      setCreatedWorkflowId(wf.id)
      if (scheduleMode === 'once') {
        setPhase('running')
        const job = await api.triggerJob(wf.id)
        setJobId(job.job_id)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create workflow') }
    finally { setLoading(false); setPhase('idle') }
  }

  const handleTryDemo = async () => {
    if (!description.trim()) return
    if (user) {
      recordUserEvent(user.id, user.name || user.email, {
        type: 'demo_run',
        data: { descriptionPreview: description.slice(0, 200) },
      })
    }
    setShowRunChoiceModal(false)
    setLoading(true); setPhase('running'); setError(null); setJobId(null)
    try {
      const result = await api.runDemo(description)
      setDag(result.dag)
      setTaskStatuses(
        Object.fromEntries(
          Object.entries(result.task_results).map(([k, v]) => [k, v.status])
        )
      )
      setLastDemo(result.dag, description)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Demo run failed')
    } finally {
      setLoading(false)
      setPhase('idle')
    }
  }

  const handleSaveDemo = async () => {
    if (!lastDemoToSave || !user) return
    setSavingDemo(true)
    setError(null)
    try {
      const wf = await api.createWorkflow({
        dag: lastDemoToSave.dag,
        run_immediately: false,
        schedule: null,
        timezone: 'UTC',
      })
      setCreatedWorkflowId(wf.id)
      setDag(lastDemoToSave.dag)
      setDescription(lastDemoToSave.description)
      clearLastDemo()
      setLastDemoToSave(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save workflow')
    } finally {
      setSavingDemo(false)
    }
  }

  // Cmd+Enter / Ctrl+Enter to run
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && description.trim() && !loading) {
        e.preventDefault()
        handleCreateAndRun()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [description, loading])

  const disabled =
    loading ||
    !description.trim() ||
    (scheduleMode === 'recurring' && cronPresetKey === 'custom' && !customCron.trim())

  const runBtnLabel =
    phase === 'parsing' ? 'Parsing...'
    : phase === 'running' ? 'Running...'
    : scheduleMode === 'once' ? 'Create & Run'
    : scheduleMode === 'recurring' ? 'Create & Schedule'
    : 'Create workflow'

  return (
    <div className="flint-split" style={{ position: 'relative' }}>
      {showRunChoiceModal && (
        <RunChoiceModal
          onOpenLoginPage={() => { setShowRunChoiceModal(false); onOpenLoginPage?.() }}
          onTryDemo={handleTryDemo}
          showTryDemo={scheduleMode === 'once'}
          onCancel={() => setShowRunChoiceModal(false)}
        />
      )}
      {lastDemoToSave && (
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            background: colors.panelBg,
            border: `1px solid ${colors.panelBorder}`,
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <span style={{ fontSize: 13, color: colors.textPrimary }}>Save your demo workflow to your account?</span>
          <button
            onClick={handleSaveDemo}
            disabled={savingDemo}
            style={{
              padding: '6px 14px',
              background: colors.textPrimary,
              color: colors.pageBg,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: savingDemo ? 'not-allowed' : 'pointer',
              opacity: savingDemo ? 0.7 : 1,
            }}
          >
            {savingDemo ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => { clearLastDemo(); setLastDemoToSave(null) }}
            style={{
              padding: '6px 10px',
              background: 'none',
              border: 'none',
              color: colors.textMuted,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Left panel */}
      <div style={{
        background: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
        borderRadius: 12,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        {/* Shimmer */}
        {loading && (
          <div style={{ position: 'relative', height: 2, overflow: 'hidden', background: colors.panelBorder }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '25%', height: '100%',
              background: 'linear-gradient(90deg, transparent, #F59E0B, transparent)',
              animation: 'shimmer 1.4s ease-in-out infinite',
            }} />
          </div>
        )}

        <div style={{ padding: '32px 32px 28px', flex: 1, display: 'flex', flexDirection: 'column' }} className="flint-left-pad">
          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: colors.textPrimary, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 8 }} className="flint-heading">
              What should Flint run?
            </h1>
            <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 400 }}>Describe your workflow in natural language.</p>
          </div>

          {/* Textarea */}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder + ((!description && !focused) ? '|' : '')}
            rows={6}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: `1px solid ${focused ? '#333' : colors.panelBorder}`,
              color: colors.textPrimary,
              padding: '0 0 16px',
              fontSize: 15,
              resize: 'none',
              lineHeight: 1.65,
              outline: 'none',
              width: '100%',
              transition: 'border-color 0.15s',
              caretColor: '#F59E0B',
            }}
          />

          {/* Schedule */}
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500, marginBottom: 10 }}>
              Schedule
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
              {(['once', 'recurring', 'trigger'] as const).map(mode => (
                <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="schedule"
                    checked={scheduleMode === mode}
                    onChange={() => setScheduleMode(mode)}
                    style={{ accentColor: '#F59E0B' }}
                  />
                  <span style={{ fontSize: 13, color: colors.textPrimary }}>
                    {mode === 'once' ? 'Run once' : mode === 'recurring' ? 'Recurring' : 'On trigger'}
                  </span>
                </label>
              ))}
            </div>
            {scheduleMode === 'recurring' && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select
                  value={cronPresetKey}
                  onChange={e => setCronPresetKey(e.target.value)}
                  style={{
                    background: colors.inputBg,
                    border: `1px solid ${colors.panelBorder}`,
                    color: colors.textPrimary,
                    padding: '8px 12px',
                    fontSize: 13,
                    maxWidth: 280,
                  }}
                >
                  {CRON_PRESETS.filter(p => p.key !== 'custom').map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                  <option value="custom">Custom (cron)</option>
                </select>
                {cronPresetKey === 'custom' && (
                  <input
                    type="text"
                    value={customCron}
                    onChange={e => setCustomCron(e.target.value)}
                    placeholder="0 9 * * *"
                    style={{
                      background: colors.inputBg,
                      border: `1px solid ${colors.panelBorder}`,
                      color: colors.textPrimary,
                      padding: '8px 12px',
                      fontSize: 13,
                      maxWidth: 200,
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  />
                )}
                <p style={{ fontSize: 12, color: colors.textMuted }}>
                  {cronToHuman(cronPresetKey === 'custom' ? customCron : CRON_PRESETS.find(p => p.key === cronPresetKey)?.cron ?? '')}
                </p>
              </div>
            )}
            {scheduleMode === 'trigger' && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
                  POST this URL to run the workflow (create workflow first to get your ID):
                </p>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  background: colors.inputBg,
                  border: `1px solid ${colors.panelBorder}`,
                  padding: '10px 12px',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 12,
                  color: colors.codeColor,
                }}>
                  <code style={{ wordBreak: 'break-all' }}>
                    {(import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || 'https://flint-api-fbsk.onrender.com'}/api/v1/jobs/trigger/{createdWorkflowId ?? '{workflow_id}'}
                  </code>
                  {createdWorkflowId && (
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || 'https://flint-api-fbsk.onrender.com'}/api/v1/jobs/trigger/${createdWorkflowId}`
                        void navigator.clipboard.writeText(url)
                      }}
                      style={{
                        background: colors.panelBorder,
                        border: 'none',
                        color: colors.textPrimary,
                        padding: '4px 10px',
                        fontSize: 11,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Copy
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Inspiration cards */}
          <div style={{ marginTop: 24, marginBottom: 'auto' }}>
            <p style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500, marginBottom: 10 }}>
              Try an example
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {INSPIRATION_CARDS.map(card => (
                <button
                  key={card.title}
                  onClick={() => setDescription(card.prompt)}
                  style={{
                    background: 'none',
                    border: `1px solid ${colors.panelBorder}`,
                    padding: '10px 14px',
                    textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = colors.rowHover
                    e.currentTarget.style.borderColor = '#2a2a2a'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none'
                    e.currentTarget.style.borderColor = colors.panelBorder
                  }}
                >
                  <div style={{
                    background: card.color + '15', border: `1px solid ${card.color}30`,
                    borderRadius: 4, padding: '3px 6px',
                    fontSize: 9, fontWeight: 600, color: card.color,
                    letterSpacing: '0.05em', fontFamily: 'ui-monospace, monospace', flexShrink: 0,
                  }}>
                    {card.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, marginBottom: 1 }}>{card.title}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted }}>{card.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feedback */}
        {(error || jobId || warnings.length > 0) && (
          <div style={{ padding: '0 32px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {error && (
              <div style={{ border: '1px solid #2a1010', padding: '10px 12px', color: '#f87171', fontSize: 12, lineHeight: 1.5, background: '#0f0505' }}>
                {error}
              </div>
            )}
            {jobId && (
              <div style={{ border: '1px solid #1a2a1a', padding: '10px 12px', fontSize: 12, color: colors.textMuted, background: '#0a0f0a' }}>
                Job queued <code style={{ color: colors.codeColor, fontSize: 11 }}>{jobId.slice(0, 8)}...</code>. View in Dashboard.
              </div>
            )}
            {warnings.map((w, i) => (
              <p key={i} style={{ color: colors.textMuted, fontSize: 12, lineHeight: 1.5 }}>Warning: {w}</p>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div style={{ padding: '16px 32px 28px', display: 'flex', gap: 8, borderTop: `1px solid ${colors.panelBorder}`, alignItems: 'center' }} className="flint-btn-row">
          <button
            onClick={handlePreview} disabled={disabled}
            style={{
              flex: 1, height: 38, background: 'none',
              border: `1px solid ${disabled ? colors.panelBorder : '#2a2a2a'}`,
              color: disabled ? colors.textDisabled : colors.textPrimary,
              fontSize: 13, fontWeight: 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'border-color 0.15s, background 0.15s', borderRadius: 0,
            }}
            onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.background = colors.rowHover } }}
            onMouseLeave={e => { if (!disabled) { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.background = 'none' } }}
          >
            {loading && phase === 'parsing' && !jobId ? 'Parsing...' : 'Preview DAG'}
          </button>

          {/* Create & Run with shimmer sweep when loading */}
          <button
            onClick={handleCreateAndRun} disabled={disabled}
            style={{
              flex: 1, height: 38,
              background: disabled ? colors.panelBorder : colors.textPrimary,
              border: '1px solid transparent',
              color: disabled ? colors.textDisabled : colors.pageBg,
              fontSize: 13, fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              borderRadius: 0,
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={e => { if (!disabled && !loading) e.currentTarget.style.background = '#e5e5e5' }}
            onMouseLeave={e => { if (!disabled && !loading) e.currentTarget.style.background = colors.textPrimary }}
          >
            {/* Shimmer sweep overlay while loading */}
            {loading && (
              <span style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
                animation: 'btnShimmer 1.2s ease-in-out infinite',
                pointerEvents: 'none',
              }} />
            )}
            <span style={{ position: 'relative', zIndex: 1 }}>{runBtnLabel}</span>
          </button>

          {/* Cmd+Enter hint */}
          {!disabled && (
            <span style={{ fontSize: 10, color: '#444', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
              ⌘↵
            </span>
          )}
        </div>
      </div>

      {/* Right panel — DAG */}
      <div
        className="flint-panel-right"
        style={{
          background: colors.panelBg,
          border: `1px solid ${colors.panelBorder}`,
          borderRadius: 12,
          overflow: 'hidden', position: 'relative',
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        {dag ? (
          <DAGVisualization dag={dag} jobId={jobId} taskStatuses={taskStatuses} onTaskStatusUpdate={setTaskStatuses} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
            <div style={{ border: '1px dashed #222', padding: '48px 64px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, border: '1px dashed #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, border: '1px solid #333' }} />
              </div>
              <p style={{ fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>DAG will appear here</p>
              <p style={{ fontSize: 11, color: '#2a2a2a', textAlign: 'center', maxWidth: 200 }}>
                Type a workflow description and click Preview DAG
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
