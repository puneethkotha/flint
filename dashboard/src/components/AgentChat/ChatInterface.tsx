/**
 * ChatInterface — left-panel conversational UI for Agent Mode.
 *
 * Features:
 * - User bubbles (right, white bg on dark / dark bg on light)
 * - Agent bubbles (left, subtle panel bg)
 * - Inline "thinking / building / running" status indicators
 * - Word-by-word streaming for the latest agent message
 * - Enter to send, Shift+Enter for newline
 * - Auto-scroll to bottom on new messages
 */

import React, { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import StreamingText from './StreamingText'
import { useTheme } from '../../theme'

export interface AgentEvent {
  type: 'thinking' | 'building' | 'running' | 'done' | 'error' | 'reply' | 'dag' | 'end'
  message: string
  workflow_id?: string
  job_id?: string
  dag?: unknown
}

export interface Message {
  role: 'user' | 'agent'
  text: string
  streaming?: boolean
}

export interface WorkflowCard {
  name: string
  workflow_id: string
  job_id: string
}

const DEFAULT_SUGGESTIONS = [
  'Send me a daily 9am Slack summary of new GitHub issues',
  'Every hour, check our API latency and alert if > 500ms',
  'Fetch top HN posts and email them every Monday morning',
]

const PROMPT_SEEN_KEY = 'flint-suggestions-prompt-seen'

interface Props {
  messages: Message[]
  status: AgentEvent | null         // latest status event (thinking/building/running)
  workflowCard: WorkflowCard | null
  onSend: (text: string) => void
  disabled?: boolean
  personalizedSuggestions?: boolean
  isLoggedIn?: boolean
  onEnablePersonalized?: () => void
}

const STATUS_CONFIG = {
  thinking: { icon: '◌', color: '#6b7280', label: 'Thinking' },
  building: { icon: '⚙', color: '#F59E0B', label: 'Building DAG' },
  running:  { icon: '▶', color: '#10b981', label: 'Deploying' },
  done:     { icon: '✓', color: '#10b981', label: 'Done' },
  error:    { icon: '✕', color: '#ef4444', label: 'Error' },
  dag:      { icon: '◈', color: '#a78bfa', label: 'Generating' },
  reply:    { icon: '●', color: '#6b7280', label: '' },
  end:      { icon: '', color: '', label: '' },
}

export const ChatInterface: React.FC<Props> = ({
  messages,
  status,
  workflowCard,
  onSend,
  disabled = false,
  personalizedSuggestions = false,
  isLoggedIn = false,
  onEnablePersonalized,
}) => {
  const { colors } = useTheme()
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS)
  const [showPromptBanner, setShowPromptBanner] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch personalized suggestions when enabled and logged in
  useEffect(() => {
    if (!personalizedSuggestions || !isLoggedIn) {
      setSuggestions(DEFAULT_SUGGESTIONS)
      return
    }
    api.getSuggestions().then(r => setSuggestions(r.suggestions)).catch(() => setSuggestions(DEFAULT_SUGGESTIONS))
  }, [personalizedSuggestions, isLoggedIn])

  // First-time prompt: show when logged in, not yet opted in, and haven't asked
  useEffect(() => {
    if (isLoggedIn && !personalizedSuggestions && !sessionStorage.getItem(PROMPT_SEEN_KEY)) {
      setShowPromptBanner(true)
    }
  }, [isLoggedIn, personalizedSuggestions])

  // Auto-scroll on new messages or status
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status, workflowCard])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const submit = () => {
    const trimmed = input.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setInput('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-grow textarea
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const activeStatus = status && status.type !== 'reply' && status.type !== 'end' && status.type !== 'dag'
    ? STATUS_CONFIG[status.type]
    : null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: colors.panelBg,
      borderRadius: 12,
      border: `1px solid ${colors.panelBorder}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${colors.panelBorder}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Flint Agent</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>AI workflow builder</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {/* Empty state - centered prompt */}
        {messages.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 14, color: colors.textMuted, textAlign: 'center',
            padding: '24px 20px',
          }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: colors.textMuted, maxWidth: 320 }}>
              What would you like me to build?
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5, maxWidth: 320 }}>
              I&apos;ll build and run it for you.
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            isLatest={i === messages.length - 1}
            colors={colors}
          />
        ))}

        {/* Inline status indicator */}
        {activeStatus && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
            background: colors.inputBg,
            border: `1px solid ${colors.panelBorder}`,
            borderRadius: 8,
            alignSelf: 'flex-start',
            maxWidth: '85%',
          }}>
            <span style={{
              color: activeStatus.color,
              fontSize: 14,
              animation: activeStatus.icon === '◌' ? 'spin 1s linear infinite' : 'none',
              display: 'inline-block',
            }}>{activeStatus.icon}</span>
            <span style={{ fontSize: 12, color: colors.textMuted }}>
              {status?.message || activeStatus.label}
            </span>
          </div>
        )}

        {/* Workflow card */}
        {workflowCard && (
          <WorkflowSuccessCard card={workflowCard} colors={colors} />
        )}

        {/* First-time prompt: personalize suggestions */}
        {showPromptBanner && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '10px 14px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: 8,
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 12, color: colors.textSecondary }}>
              Personalize suggestions based on your workflow history?
            </span>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => { sessionStorage.setItem(PROMPT_SEEN_KEY, '1'); onEnablePersonalized?.(); setShowPromptBanner(false) }}
                style={{ fontSize: 11, padding: '4px 10px', background: '#F59E0B', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}
              >
                Enable
              </button>
              <button
                onClick={() => { sessionStorage.setItem(PROMPT_SEEN_KEY, '1'); setShowPromptBanner(false) }}
                style={{ fontSize: 11, padding: '4px 10px', background: 'none', color: colors.textMuted, border: 'none', cursor: 'pointer' }}
              >
                No thanks
              </button>
            </div>
          </div>
        )}

        {/* Examples - above input, above partition line (when empty) */}
        {messages.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: '0 0 12px',
            width: '100%',
            maxWidth: 420,
          }}>
            {suggestions.map((ex, i) => (
              <button
                key={i}
                onClick={() => onSend(ex)}
                style={{
                  background: colors.inputBg,
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: colors.textSecondary,
                  fontSize: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#F59E0B')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '14px 16px 16px',
        borderTop: `1px solid ${colors.panelBorder}`,
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          background: colors.inputBg,
          border: `1px solid ${colors.panelBorder}`,
          borderRadius: 10,
          padding: '12px 14px',
          transition: 'border-color 0.15s',
        }}
          onFocusCapture={e => (e.currentTarget.style.borderColor = '#F59E0B')}
          onBlurCapture={e => (e.currentTarget.style.borderColor = colors.panelBorder)}
        >
          <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={disabled ? 'Processing…' : 'Describe your automation...'}
              rows={1}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                color: colors.textPrimary,
                fontSize: 13,
                lineHeight: 1.5,
                fontFamily: 'inherit',
                overflowY: 'auto',
                minHeight: 24,
                maxHeight: 160,
                padding: 0,
              }}
            />
            <button
              onClick={submit}
              disabled={!input.trim() || disabled}
              style={{
                background: input.trim() && !disabled ? '#F59E0B' : colors.panelBorder,
                border: 'none', borderRadius: 7,
                width: 30, height: 30, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: input.trim() && !disabled ? 'pointer' : 'default',
                transition: 'background 0.15s',
                fontSize: 14, color: input.trim() && !disabled ? '#000' : colors.textMuted,
              }}
              aria-label="Send"
            >
              ↑
            </button>
          </div>
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 8, textAlign: 'right' }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
  msg: Message
  isLatest: boolean
  colors: ReturnType<typeof useTheme>['colors']
}> = ({ msg, isLatest, colors }) => {
  const isUser = msg.role === 'user'

  // Strip INTENT_CLEAR: lines from displayed agent text
  const displayText = msg.role === 'agent'
    ? msg.text.replace(/^INTENT_CLEAR:.*$/m, '').trim()
    : msg.text

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        maxWidth: '80%',
        background: isUser ? colors.textPrimary : colors.inputBg,
        color: isUser ? colors.pageBg : colors.textPrimary,
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '9px 13px',
        fontSize: 13, lineHeight: 1.55,
        border: isUser ? 'none' : `1px solid ${colors.panelBorder}`,
      }}>
        {msg.streaming && isLatest && msg.role === 'agent' ? (
          <StreamingText text={displayText} speed={30} />
        ) : (
          <span style={{ whiteSpace: 'pre-wrap' }}>{displayText}</span>
        )}
      </div>
    </div>
  )
}

const WorkflowSuccessCard: React.FC<{
  card: WorkflowCard
  colors: ReturnType<typeof useTheme>['colors']
}> = ({ card, colors }) => (
  <div style={{
    background: 'linear-gradient(135deg, #022c22 0%, #0a1628 100%)',
    border: '1px solid #10b981',
    borderRadius: 10,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    animation: 'fadeIn 0.3s ease',
    alignSelf: 'stretch',
  }}>
    <div>
      <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, marginBottom: 3 }}>
        ✓ WORKFLOW LIVE
      </div>
      <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{card.name}</div>
      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
        job {card.job_id.slice(0, 8)}… running
      </div>
    </div>
    <a
      href={`#dashboard?job=${card.job_id}`}
      style={{
        fontSize: 11, color: '#10b981',
        textDecoration: 'none', whiteSpace: 'nowrap',
        border: '1px solid #10b981',
        borderRadius: 6, padding: '4px 10px',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      View in Dashboard →
    </a>
  </div>
)

export default ChatInterface
