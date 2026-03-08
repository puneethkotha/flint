import React, { useState, useEffect } from 'react'
import WorkflowCreator from './components/WorkflowCreator'
import ExecutionDashboard from './components/ExecutionDashboard'
import Intro from './components/Intro'
import { useTheme } from './theme'

type Tab = 'create' | 'dashboard'

function useAPIStatus() {
  const [status, setStatus] = useState<'ok' | 'error' | 'checking'>('checking')
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/v1/health`)
        setStatus(res.ok ? 'ok' : 'error')
      } catch { setStatus('error') }
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
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
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
  const isLight = theme === 'light'

  // Show intro only once per session
  const [showIntro, setShowIntro] = useState(() => !sessionStorage.getItem('flint-intro-seen'))
  const handleIntroDone = () => {
    sessionStorage.setItem('flint-intro-seen', '1')
    setShowIntro(false)
  }

  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return
    setVisible(false)
    setTimeout(() => { setActiveTab(tab); setVisible(true) }, 150)
  }

  const statusDot = apiStatus === 'ok' ? '#22c55e' : apiStatus === 'error' ? '#ef4444' : '#6b7280'

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
        ::-webkit-scrollbar-thumb { background: ${isLight ? '#C8C4B8' : '#222'}; border-radius: 2px; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
        @keyframes btnShimmer { 0% { transform: translateX(-150%); } 100% { transform: translateX(250%); } }

        /* ── Responsive layout ── */
        .flint-main {
          flex: 1;
          padding: 16px;
          overflow: auto;
          display: flex;
          flex-direction: column;
        }

        /* Two-column side-by-side: desktop (>= 900px) */
        .flint-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          height: calc(100vh - 80px);
          min-height: 0;
        }

        /* Tablet (600–899px): stack, no fixed height */
        @media (max-width: 899px) {
          .flint-main { padding: 12px; }
          .flint-split {
            grid-template-columns: 1fr;
            height: auto;
            min-height: 0;
          }
          .flint-panel-right {
            min-height: 360px;
          }
        }

        /* Mobile (< 600px): tighter padding */
        @media (max-width: 599px) {
          .flint-main { padding: 8px; }
          .flint-split { gap: 8px; }
          .flint-panel-right { min-height: 300px; }
        }

        /* DAG panel always fills its container */
        .flint-dag-wrap {
          width: 100%;
          height: 100%;
          min-height: inherit;
        }

        /* Stat cards: 4-col on desktop, 2-col on tablet, 2-col on mobile */
        .flint-stat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: ${colors.panelBorder};
        }
        @media (max-width: 599px) {
          .flint-stat-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        /* Charts: side-by-side desktop, stacked mobile */
        .flint-chart-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        @media (max-width: 699px) {
          .flint-chart-grid { grid-template-columns: 1fr; gap: 16px; }
        }
        @media (max-width: 399px) {
          .flint-api-label { display: none; }
          .flint-nav-tab-label { font-size: 12px !important; }
        }

        /* Inspiration cards: shrink padding on mobile */
        @media (max-width: 599px) {
          .flint-inspiration { padding: 8px 10px !important; }
          .flint-left-pad { padding: 20px 20px 20px !important; }
          .flint-btn-row { padding: 12px 20px 20px !important; }
          .flint-heading { font-size: 22px !important; }
        }
      `}</style>

      <div style={{ background: colors.pageBg, minHeight: '100vh', color: colors.textPrimary, display: 'flex', flexDirection: 'column', transition: 'background 0.2s' }}>
        {showIntro && <Intro onDone={handleIntroDone} />}
        {/* Navbar */}
        <nav style={{
          height: 48, display: 'flex', alignItems: 'center',
          padding: '0 16px',
          borderBottom: `1px solid ${colors.panelBorder}`,
          background: colors.navBg,
          position: 'relative', flexShrink: 0,
          transition: 'background 0.2s, border-color 0.2s',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, #F59E0B 0%, transparent 50%)' }} />

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 20, flexShrink: 0 }}>
            <span style={{ color: '#F59E0B', fontSize: 15, lineHeight: 1 }}>⚡</span>
            <span style={{ fontFamily: 'ui-monospace, "Cascadia Code", monospace', fontWeight: 600, fontSize: 14, color: colors.textPrimary, letterSpacing: '-0.02em' }}>flint</span>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 1, flex: 1, overflow: 'hidden' }}>
            {([
              { key: 'create' as Tab, label: 'Create Workflow' },
              { key: 'dashboard' as Tab, label: 'Dashboard' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className="flint-nav-tab-label"
                style={{
                  background: 'none', border: 'none',
                  color: activeTab === key ? colors.textPrimary : colors.textMuted,
                  fontSize: 13, fontWeight: activeTab === key ? 500 : 400,
                  padding: '0 10px', height: 48,
                  position: 'relative', transition: 'color 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (activeTab !== key) e.currentTarget.style.color = colors.textSecondary }}
                onMouseLeave={e => { if (activeTab !== key) e.currentTarget.style.color = colors.textMuted }}
              >
                {label}
                {activeTab === key && (
                  <div style={{ position: 'absolute', bottom: 0, left: 10, right: 10, height: 1, background: colors.textPrimary }} />
                )}
              </button>
            ))}
          </div>

          {/* Right: API status + theme toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: statusDot,
                animation: apiStatus === 'checking' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                flexShrink: 0,
              }} />
              <span className="flint-api-label" style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                {apiStatus === 'ok' ? 'api live' : apiStatus === 'error' ? 'api down' : '...'}
              </span>
            </div>
            <button
              onClick={toggle}
              title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
              style={{
                background: 'none', border: `1px solid ${colors.panelBorder}`,
                color: colors.textMuted, width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, transition: 'border-color 0.15s, color 0.15s', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = isLight ? '#9E9A8E' : '#333'; e.currentTarget.style.color = colors.textPrimary }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = colors.panelBorder; e.currentTarget.style.color = colors.textMuted }}
            >
              {isLight ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
        </nav>

        {/* Page */}
        <main
          className="flint-main"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.15s ease' }}
        >
          {activeTab === 'create' && <WorkflowCreator />}
          {activeTab === 'dashboard' && <ExecutionDashboard />}
        </main>
      </div>
    </>
  )
}
