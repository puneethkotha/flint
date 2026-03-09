import React from 'react'
import { useTheme } from '../theme'

interface Props {
  /** Open the login page (user picks Google/GitHub/Email there) */
  onOpenLoginPage: () => void
  onTryDemo?: () => void
  onCancel: () => void
  /** When true, show "Try 1 free demo" option (only for run-once) */
  showTryDemo?: boolean
}

const LAST_DEMO_KEY = 'flint-last-demo'

export function getLastDemo(): { dag: Record<string, unknown>; description: string } | null {
  try {
    const s = sessionStorage.getItem(LAST_DEMO_KEY)
    if (!s) return null
    const parsed = JSON.parse(s) as { dag?: Record<string, unknown>; description?: string }
    if (parsed?.dag && parsed?.description) return { dag: parsed.dag, description: parsed.description }
  } catch {
    /* ignore */
  }
  return null
}

export function setLastDemo(dag: Record<string, unknown>, description: string) {
  sessionStorage.setItem(LAST_DEMO_KEY, JSON.stringify({ dag, description }))
}

export function clearLastDemo() {
  sessionStorage.removeItem(LAST_DEMO_KEY)
}

export default function RunChoiceModal({ onOpenLoginPage, onTryDemo, onCancel, showTryDemo = true }: Props) {
  const { colors } = useTheme()
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: colors.panelBg,
          border: `1px solid ${colors.panelBorder}`,
          padding: 28,
          maxWidth: 400,
          width: '90%',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
          {showTryDemo ? 'Sign in to save, or try a free demo' : 'Sign in to create workflows'}
        </h3>
        <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
          {showTryDemo ? 'Run once without saving, or sign in to create and save your workflow.' : 'Sign in to create and schedule workflows.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onOpenLoginPage}
            style={{
              padding: '12px 16px',
              background: colors.textPrimary,
              color: colors.pageBg,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign in
          </button>
          {showTryDemo && onTryDemo && (
            <button
              onClick={onTryDemo}
              style={{
                padding: '12px 16px',
                background: 'none',
                border: `1px solid ${colors.panelBorder}`,
                color: colors.textPrimary,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try 1 free demo run (not saved)
            </button>
          )}
          <button
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              color: colors.textMuted,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
