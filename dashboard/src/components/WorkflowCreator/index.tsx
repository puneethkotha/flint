import React, { useState, useEffect } from 'react'
import { api } from '../../api/client'
import DAGVisualization from '../DAGVisualization'
import { useTheme } from '../../theme'

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

export default function WorkflowCreator() {
  const { colors, theme } = useTheme()
  const isLight = theme === 'light'
  const [description, setDescription] = useState('')
  const [dag, setDag] = useState<Record<string, unknown> | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({})
  const [focused, setFocused] = useState(false)

  const placeholder = useTypewriter(TYPEWRITER_PLACEHOLDERS, !description && !focused)

  const handlePreview = async () => {
    if (!description.trim()) return
    setLoading(true); setError(null)
    try {
      const result = await api.parseWorkflow(description)
      setDag(result.dag); setWarnings(result.warnings)
    } catch (e) { setError(e instanceof Error ? e.message : 'Parse failed') }
    finally { setLoading(false) }
  }

  const handleCreateAndRun = async () => {
    if (!description.trim()) return
    setLoading(true); setError(null)
    try {
      const wf = await api.createWorkflow({ description, run_immediately: true })
      const job = await api.triggerJob(wf.id)
      setJobId(job.job_id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create workflow') }
    finally { setLoading(false) }
  }

  const disabled = loading || !description.trim()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: 'calc(100vh - 88px)' }}>
      {/* Left panel */}
      <div style={{
        background: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
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

        <div style={{ padding: '32px 32px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: colors.textPrimary, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 8 }}>
              What should Flint run?
            </h1>
            <p style={{ fontSize: 14, color: colors.textMuted, fontWeight: 400 }}>Plain English. No YAML.</p>
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
              borderBottom: `1px solid ${focused ? (isLight ? '#9E9A8E' : '#333') : colors.panelBorder}`,
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

          {/* Inspiration cards */}
          <div style={{ marginTop: 24, marginBottom: 'auto' }}>
            <p style={{ fontSize: 10, color: isLight ? '#9E9A8E' : '#444', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500, marginBottom: 10 }}>
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
                    e.currentTarget.style.borderColor = isLight ? '#C8C4B8' : '#2a2a2a'
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
              <div style={{ border: `1px solid ${isLight ? '#fecaca' : '#2a1010'}`, padding: '10px 12px', color: isLight ? '#dc2626' : '#f87171', fontSize: 12, lineHeight: 1.5, background: isLight ? '#fff5f5' : '#0f0505' }}>
                {error}
              </div>
            )}
            {jobId && (
              <div style={{ border: `1px solid ${isLight ? '#bbf7d0' : '#1a2a1a'}`, padding: '10px 12px', fontSize: 12, color: colors.textMuted, background: isLight ? '#f0fdf4' : '#0a0f0a' }}>
                Job queued <code style={{ color: colors.codeColor, fontSize: 11 }}>{jobId.slice(0, 8)}...</code> — view in Dashboard
              </div>
            )}
            {warnings.map((w, i) => (
              <p key={i} style={{ color: colors.textMuted, fontSize: 12, lineHeight: 1.5 }}>⚠ {w}</p>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div style={{ padding: '16px 32px 28px', display: 'flex', gap: 8, borderTop: `1px solid ${colors.panelBorder}` }}>
          <button
            onClick={handlePreview} disabled={disabled}
            style={{
              flex: 1, height: 38, background: 'none',
              border: `1px solid ${disabled ? colors.panelBorder : (isLight ? '#C8C4B8' : '#2a2a2a')}`,
              color: disabled ? colors.textDisabled : colors.textPrimary,
              fontSize: 13, fontWeight: 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'border-color 0.15s, background 0.15s', borderRadius: 0,
            }}
            onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = isLight ? '#9E9A8E' : '#444'; e.currentTarget.style.background = colors.rowHover } }}
            onMouseLeave={e => { if (!disabled) { e.currentTarget.style.borderColor = isLight ? '#C8C4B8' : '#2a2a2a'; e.currentTarget.style.background = 'none' } }}
          >
            {loading ? 'Parsing...' : 'Preview DAG'}
          </button>
          <button
            onClick={handleCreateAndRun} disabled={disabled}
            style={{
              flex: 1, height: 38,
              background: disabled ? colors.panelBorder : colors.textPrimary,
              border: '1px solid transparent',
              color: disabled ? colors.textDisabled : colors.pageBg,
              fontSize: 13, fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s', borderRadius: 0,
            }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = isLight ? '#374151' : '#e5e5e5' }}
            onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = colors.textPrimary }}
          >
            {loading ? 'Running...' : 'Create & Run'}
          </button>
        </div>
      </div>

      {/* Right panel — DAG */}
      <div style={{
        background: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
        overflow: 'hidden', position: 'relative',
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        {dag ? (
          <DAGVisualization dag={dag} jobId={jobId} taskStatuses={taskStatuses} onTaskStatusUpdate={setTaskStatuses} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
            <div style={{ border: `1px dashed ${isLight ? '#C8C4B8' : '#222'}`, padding: '48px 64px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, border: `1px dashed ${isLight ? '#C8C4B8' : '#2a2a2a'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, border: `1px solid ${isLight ? '#E8E5DF' : '#333'}` }} />
              </div>
              <p style={{ fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>DAG will appear here</p>
              <p style={{ fontSize: 11, color: isLight ? '#C8C4B8' : '#2a2a2a', textAlign: 'center', maxWidth: 200 }}>
                Type a workflow description and click Preview DAG
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
