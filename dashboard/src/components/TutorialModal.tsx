import React from 'react'

interface Props {
  onClose: () => void
}

const TIPS = [
  { title: 'Describe in plain English', body: 'Type what you want—fetch data, run SQL, call Claude. No YAML or config.' },
  { title: 'Create & Run', body: 'Click "Create & Run" to parse and execute. Or browse Templates for ready-made workflows.' },
  { title: 'Watch it run', body: 'In Dashboard, select a job to see the DAG and live logs as tasks complete.' },
]

export default function TutorialModal({ onClose }: Props) {
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
          Here's how Flint works:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
          {TIPS.map((tip, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: '#F59E0B', color: '#080808',
                fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {i + 1}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#f5f5f5', marginBottom: 2 }}>{tip.title}</div>
                <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{tip.body}</div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: '#f5f5f5',
            color: '#080808',
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
