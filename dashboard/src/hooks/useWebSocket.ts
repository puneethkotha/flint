import { useEffect, useRef, useCallback, useState } from 'react'

export interface WSMessage {
  type: string
  job_id: string
  task_id?: string
  status?: string
  timestamp?: string
}

export function useWebSocket(jobId: string | null, onMessage: (msg: WSMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!jobId) return

    const apiUrl = import.meta.env.VITE_API_URL ?? window.location.origin
    const wsBase = apiUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
    const url = `${wsBase}/ws/jobs/${jobId}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage
        if (msg.type !== 'heartbeat') {
          onMessageRef.current(msg)
        }
      } catch {
        // ignore malformed messages
      }
    }

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping')
      }
    }, 25_000)

    return () => {
      clearInterval(heartbeat)
      ws.close()
    }
  }, [jobId])

  return { connected }
}
