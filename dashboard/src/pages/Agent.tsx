/**
 * Agent Mode: full-height split layout.
 * Left: conversational chat with Flint's AI agent.
 * Right: live DAG visualization building in real time.
 *
 * Flow:
 *   1. User opens SSE stream connection (GET /api/v1/agent/stream/:id)
 *   2. User sends message (POST /api/v1/agent/chat)
 *   3. Server pushes events: thinking → reply → building → dag → running → done
 *   4. Chat displays streaming reply, DAG panel animates nodes
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import ChatInterface, {
  AgentEvent,
  Message,
  WorkflowCard,
} from '../components/AgentChat/ChatInterface'
import LiveDAGPanel from '../components/AgentChat/LiveDAGPanel'
import { useAuth } from '../context/AuthContext'
import { recordUserEvent } from '../utils/userAnalytics'

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/v1'

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

interface AgentProps {
  personalizedSuggestions?: boolean
  onEnablePersonalized?: () => void
}

export default function Agent({ personalizedSuggestions = false, onEnablePersonalized }: AgentProps) {
  const { user } = useAuth()
  const [sessionId] = useState<string>(() => generateSessionId())
  const [messages, setMessages] = useState<Message[]>([])
  const [statusEvent, setStatusEvent] = useState<AgentEvent | null>(null)
  const [dag, setDag] = useState<Record<string, unknown> | null>(null)
  const [buildingMessage, setBuildingMessage] = useState<string | null>(null)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [workflowCard, setWorkflowCard] = useState<WorkflowCard | null>(null)
  const [disabled, setDisabled] = useState(false)

  const eventSourceRef = useRef<EventSource | null>(null)
  const latestMsgIndexRef = useRef<number>(-1)

  // ── SSE stream management ─────────────────────────────────────────────────

  const openStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const url = `${API_BASE}/agent/stream/${sessionId}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onmessage = (ev) => {
      try {
        const event: AgentEvent = JSON.parse(ev.data)
        handleEvent(event)
      } catch {
        /* ignore malformed */
      }
    }

    es.onerror = () => {
      // SSE errors are expected when stream ends; reconnect will happen on next send
      es.close()
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])

  // ── Event handler ─────────────────────────────────────────────────────────

  const handleEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case 'thinking':
      case 'building':
      case 'running':
        setStatusEvent(event)
        if (event.type === 'building') {
          setBuildingMessage(event.message)
        }
        break

      case 'reply': {
        // Append agent message (streaming)
        const newMsg: Message = {
          role: 'agent',
          text: event.message,
          streaming: true,
        }
        setMessages(prev => {
          const updated = [...prev, newMsg]
          latestMsgIndexRef.current = updated.length - 1
          return updated
        })
        setStatusEvent(null)
        break
      }

      case 'dag':
        if (event.dag) {
          setDag(event.dag as Record<string, unknown>)
          setBuildingMessage(null)
        }
        break

      case 'done': {
        setStatusEvent(null)
        setBuildingMessage(null)
        setDoneMessage(event.message)
        if (event.workflow_id && event.job_id) {
          // Extract workflow name from last agent message or dag
          const name = (dag as Record<string, unknown>)?.['name'] as string ?? 'Workflow'
          setWorkflowCard({
            name,
            workflow_id: event.workflow_id,
            job_id: event.job_id,
          })
        }
        break
      }

      case 'error':
        setStatusEvent(null)
        setBuildingMessage(null)
        // Append error as agent message
        setMessages(prev => [
          ...prev,
          { role: 'agent', text: `⚠ ${event.message}`, streaming: false },
        ])
        setDisabled(false)
        break

      case 'end':
        setStatusEvent(null)
        setDisabled(false)
        // Mark latest message as no longer streaming
        setMessages(prev =>
          prev.map((m, i) =>
            i === latestMsgIndexRef.current ? { ...m, streaming: false } : m
          )
        )
        eventSourceRef.current?.close()
        break
    }
  }, [dag])

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text: string) => {
    if (user) {
      recordUserEvent(user.id, user.name || user.email, {
        type: 'agent_query',
        data: { queryPreview: text.slice(0, 300) },
      })
    }
    setDisabled(true)
    setDoneMessage(null)

    // Append user message immediately
    setMessages(prev => [...prev, { role: 'user', text, streaming: false }])

    // Open SSE stream before posting (so we don't miss early events)
    openStream()

    try {
      const res = await fetch(`${API_BASE}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      })

      if (!res.ok) {
        const err = await res.text()
        handleEvent({ type: 'error', message: `Request failed: ${err}` })
      }
      // Events come via SSE; no need to read POST response body
    } catch (err) {
      handleEvent({
        type: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      })
    }
  }, [user, sessionId, openStream, handleEvent])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      height: 'calc(100vh - 80px)',
      minHeight: 0,
    }}
      className="agent-grid"
    >
      {/* Left: Chat */}
      <ChatInterface
        messages={messages}
        status={statusEvent}
        workflowCard={workflowCard}
        onSend={handleSend}
        disabled={disabled}
        personalizedSuggestions={personalizedSuggestions}
        isLoggedIn={!!user}
        onEnablePersonalized={onEnablePersonalized}
      />

      {/* Right: Live DAG */}
      <LiveDAGPanel
        dag={dag}
        buildingMessage={buildingMessage}
        statusEvent={statusEvent}
        doneMessage={doneMessage}
        workflowId={workflowCard?.workflow_id ?? null}
      />

      <style>{`
        @media (max-width: 899px) {
          .agent-grid {
            grid-template-columns: 1fr !important;
            height: auto !important;
          }
        }
      `}</style>
    </div>
  )
}
