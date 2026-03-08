import React, { useState, useEffect, useRef } from 'react'
import WorkflowCreator from './components/WorkflowCreator'
import ExecutionDashboard from './components/ExecutionDashboard'
import { useTheme } from './theme'

type Tab = 'create' | 'dashboard'

function useAPIStatus() {
  const [status, setStatus] = useState<'ok' | 'error' | 'checking'>('checking')
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/v1/health`)
        setStatus(res.ok ? 'ok' : 'error')
      } catch {
        setStatus('error')
      }
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [])
  return status
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('create')
  const [visible, setVisible] = useState(true)
  const { theme, colors, toggle } = useTheme()
  const apiStatus = useAPIStatus()

  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return
    setVisible(false)
    setTimeout(() => { setActiveTab(tab); setVisible(true) }, 150)
  }

  const statusDot = apiStatus === 'ok' ? '#22c55e' : apiStatus === 'error' ? '#ef4444' : '#6b7280'
  const isLight = theme === 'light'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        body {
          background: ${colors.pageBg};
          color: ${colors.textPrimary};
          font-family: 'Inter', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
          transition: background 0.2s, color 0.2s;
        }
        button { cursor: pointer; font-family: inherit; }
        textarea, input { font-family: inherit; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${isLight ? '#d1d5db' : '#222'}; border-radius: 2px; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
      `}</style>

      <div style={{ background: colors.pageBg, minHeight: '100vh', color: colors.textPrimary, display: 'flex', flexDirection: 'column', transition: 'background 0.2s' }}>
        {/* Navbar */}
        <nav style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          borderBottom: `1px solid ${colors.panelBorder}`,
          background: colors.navBg,
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.2s, border-color 0.2s',
        }}>
          {/* Amber top gradient */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(90deg, #F59E0B 0%, transparent 50%)',
          }} />

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 24 }}>
            <span style={{ color: '#F59E0B', fontSize: 15, lineHeight: 1 }}>⚡</span>
            <span style={{
              fontFamily: 'ui-monospace, "Cascadia Code", monospace',
              fontWeight: 600, fontSize: 14,
              color: colors.textPrimary,
              letterSpacing: '-0.02em',
            }}>flint</span>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 1, flex: 1 }}>
            {([
              { key: 'create' as Tab, label: 'Create Workflow' },
              { key: 'dashboard' as Tab, label: 'Dashboard' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                style={{
                  background: 'none', border: 'none',
                  color: activeTab === key ? colors.textPrimary : colors.textMuted,
                  fontSize: 13, fontWeight: activeTab === key ? 500 : 400,
                  padding: '0 12px', height: 48,
                  position: 'relative', transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (activeTab !== key) e.currentTarget.style.color = colors.textSecondary }}
                onMouseLeave={e => { if (activeTab !== key) e.currentTarget.style.color = colors.textMuted }}
              >
                {label}
                {activeTab === key && (
                  <div style={{ position: 'absolute', bottom: 0, left: 12, right: 12, height: 1, background: colors.textPrimary }} />
                )}
              </button>
            ))}
          </div>

          {/* Right side: API status + theme toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: statusDot,
                animation: apiStatus === 'checking' ? 'pulse 1.5s ease-in-out infinite' : 'none',
              }} />
              <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                {apiStatus === 'ok' ? 'api live' : apiStatus === 'error' ? 'api down' : 'checking'}
              </span>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
              style={{
                background: 'none',
                border: `1px solid ${colors.panelBorder}`,
                color: colors.textMuted,
                width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = isLight ? '#9ca3af' : '#333'
                e.currentTarget.style.color = colors.textPrimary
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = colors.panelBorder
                e.currentTarget.style.color = colors.textMuted
              }}
            >
              {isLight ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
        </nav>

        {/* Page content */}
        <main style={{
          flex: 1, padding: '20px',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.15s ease',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {activeTab === 'create' && <WorkflowCreator />}
          {activeTab === 'dashboard' && <ExecutionDashboard />}
        </main>
      </div>
    </>
  )
}
