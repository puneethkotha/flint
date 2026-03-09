import React, { useState } from 'react'

interface Props {
  onClose: () => void
}

const TIPS = [
  { title: 'Create workflow', body: 'Type what you want: fetch data, run SQL, call Claude. Click Create & Run to execute.' },
  { title: 'Agent', body: 'Chat with the AI to design and run workflows. Tell it what to automate and it builds it for you.' },
  { title: 'Templates', body: 'Browse ready-made workflows and use them as starting points.' },
  { title: 'Dashboard', body: 'View jobs, live logs, and DAG status as tasks complete.' },
  { title: 'Simulate', body: 'Preview costs and confidence before running a workflow for real.' },
]

const PER_PAGE = 3

export default function TutorialModal({ onClose }: Props) {
  const [page, setPage] = useState(0)
  const start = page * PER_PAGE
  const visibleTips = TIPS.slice(start, start + PER_PAGE)
  const hasNext = start + PER_PAGE < TIPS.length
  const isLast = !hasNext

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9998,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f0f0f',
          border: '1px solid #1a1a1a',
          maxWidth: 420,
          width: '100%',
          padding: 28,
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f5f5f5', marginBottom: 8, letterSpacing: '-0.02em' }}>
          Quick start
        </h2>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 24, lineHeight: 1.5 }}>
          What you can do:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
          {visibleTips.map((tip, i) => (
            <div key={start + i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: '#F59E0B', color: '#080808',
                fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {start + i + 1}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#f5f5f5', marginBottom: 2 }}>{tip.title}</div>
                <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{tip.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', gap: 4, justifyContent: 'center' }}>
            {Array.from({ length: Math.ceil(TIPS.length / PER_PAGE) }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: i === page ? '#F59E0B' : '#333',
                }}
              />
            ))}
          </div>
          <button
            onClick={isLast ? onClose : () => setPage(p => p + 1)}
            style={{
              padding: '12px 24px',
              background: '#f5f5f5',
              color: '#080808',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
