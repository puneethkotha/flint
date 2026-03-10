/**
 * StreamingText: animates text appearing word-by-word.
 * Re-runs whenever `text` prop changes (new message appended).
 */

import React, { useEffect, useRef, useState } from 'react'

interface Props {
  text: string
  speed?: number   // ms per word (default 40)
  onDone?: () => void
}

export const StreamingText: React.FC<Props> = ({ text, speed = 40, onDone }) => {
  const [displayed, setDisplayed] = useState('')
  const frameRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevTextRef = useRef('')

  useEffect(() => {
    if (text === prevTextRef.current) return
    prevTextRef.current = text

    // Find the new suffix to animate
    const alreadyShown = displayed
    const newSuffix = text.startsWith(alreadyShown)
      ? text.slice(alreadyShown.length)
      : text   // full reset if text changed entirely

    if (!newSuffix) return

    const words = newSuffix.split(/(\s+)/)  // keep whitespace tokens
    let idx = 0

    const tick = () => {
      if (idx >= words.length) {
        onDone?.()
        return
      }
      const chunk = words.slice(0, idx + 1).join('')
      setDisplayed(
        text.startsWith(alreadyShown)
          ? alreadyShown + chunk
          : chunk
      )
      idx++
      frameRef.current = setTimeout(tick, speed)
    }

    if (frameRef.current) clearTimeout(frameRef.current)
    tick()

    return () => {
      if (frameRef.current) clearTimeout(frameRef.current)
    }
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  return <span style={{ whiteSpace: 'pre-wrap' }}>{displayed}</span>
}

export default StreamingText
