import React, { useState, useEffect, useRef } from 'react'
import WorkflowCreator from './components/WorkflowCreator'
import ExecutionDashboard from './components/ExecutionDashboard'
import Templates from './components/Templates'
import TutorialModal from './components/TutorialModal'
import LoadingScreen, { shouldShowSplash } from './components/LoadingScreen'
import LoginPage from './components/LoginPage'
import Settings, { getPersonalizedSuggestionsEnabled, setPersonalizedSuggestionsEnabled } from './components/Settings'
import Agent from './pages/Agent'
import Toggle from './components/Toggle'
import { useTheme } from './theme'
import { useAuth } from './context/AuthContext'
import { recordUserEvent } from './utils/userAnalytics'

type Tab = 'create' | 'dashboard' | 'templates' | 'agent' | 'settings'

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

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('create')
  const [visible, setVisible] = useState(true)
  const [templatePrefill, setTemplatePrefill] = useState<string | null>(null)
  const [showPostLoginSplash, setShowPostLoginSplash] = useState(false)
  const [showInitialSplash, setShowInitialSplash] = useState(() => shouldShowSplash())
  const [showLoginPage, setShowLoginPage] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const [personalizedSuggestions, setPersonalizedSuggestions] = useState(() => getPersonalizedSuggestionsEnabled())
  const { colors, theme, toggle: toggleTheme } = useTheme()

  useEffect(() => {
    if (!profileMenuOpen) return
    const onOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [profileMenuOpen])

  const handlePersonalizedSuggestionsChange = (enabled: boolean) => {
    setPersonalizedSuggestions(enabled)
    setPersonalizedSuggestionsEnabled(enabled)
  }
  const apiStatus = useAPIStatus()
  const { user, loading: authLoading, justLoggedIn, clearJustLoggedIn, login, loginAsMaster, logout } = useAuth()

  const handleUseTemplate = (description: string) => {
    if (user) {
      recordUserEvent(user.id, user.name || user.email, {
        type: 'template_used',
        data: { descriptionPreview: description.slice(0, 200) },
      })
    }
    setTemplatePrefill(description)
    setVisible(false)
    setTimeout(() => { setActiveTab('create'); setVisible(true) }, 150)
  }

  // Show tutorial popup once per session, after splash
  const [showTutorial, setShowTutorial] = useState(() => !sessionStorage.getItem('flint-tutorial-seen'))
  const handleTutorialClose = () => {
    sessionStorage.setItem('flint-tutorial-seen', '1')
    setShowTutorial(false)
  }

  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return
    if (user) {
      recordUserEvent(user.id, user.name || user.email, { type: 'tab_visited', data: { tab } })
    }
    setVisible(false)
    setTimeout(() => { setActiveTab(tab); setVisible(true) }, 150)
  }

  const statusDot = apiStatus === 'ok' ? '#22c55e' : apiStatus === 'error' ? '#ef4444' : '#6b7280'

  // Show post-login splash when user just logged in
  useEffect(() => {
    if (user && justLoggedIn) {
      setShowPostLoginSplash(true)
    }
  }, [user, justLoggedIn])

  const handleSplashComplete = () => {
    setShowPostLoginSplash(false)
    clearJustLoggedIn()
  }

  const handleInitialSplashComplete = () => {
    setShowInitialSplash(false)
  }

  // 0. Initial loading page (first load per session)
  if (showInitialSplash) {
    return <LoadingScreen onComplete={handleInitialSplashComplete} />
  }

  // 1. Checking auth (initial load with token) → minimal loading
  if (authLoading && !user) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#080808',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <img src="/flint-logo.png" alt="Flint" width={80} height={80} style={{ opacity: 0.9 }} />
        <div style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Loading...</div>
      </div>
    )
  }

  // 1. Just logged in → Loading screen (only when user exists)
  if (showPostLoginSplash) {
    return <LoadingScreen onComplete={handleSplashComplete} />
  }

  // 3. Logged in → Main app
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
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
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
        {showLoginPage && (
          <LoginPage
            onLoginGoogle={() => login('google')}
            onLoginGithub={() => login('github')}
            onBack={() => setShowLoginPage(false)}
            onLoginWithCredentials={() => { loginAsMaster(); setShowLoginPage(false) }}
          />
        )}
        {showTutorial && <TutorialModal onClose={handleTutorialClose} />}
        {/* Navbar */}
        <nav style={{
          height: 48, display: 'flex', alignItems: 'center',
          padding: '0 16px',
          borderBottom: `1px solid ${colors.panelBorder}`,
          background: colors.navBg,
          position: 'relative', flexShrink: 0,
          overflow: 'visible',
          zIndex: 50,
          transition: 'background 0.2s, border-color 0.2s',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, #F59E0B 0%, transparent 50%)' }} />

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', marginRight: 20, flexShrink: 0 }}>
            <img src="/flint-logo.png" alt="Flint" width={36} height={36} style={{ display: 'block' }} />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 1, flex: 1, overflow: 'hidden' }}>
            {([
              { key: 'create' as Tab, label: 'Create Workflow' },
              { key: 'agent' as Tab, label: 'Agent' },
              { key: 'templates' as Tab, label: 'Templates' },
              { key: 'dashboard' as Tab, label: 'Dashboard' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className="flint-nav-tab-label"
                style={{
                  background: 'none', border: 'none',
                  color: activeTab === key
                    ? (key === 'agent' ? '#F59E0B' : colors.textPrimary)
                    : colors.textMuted,
                  fontSize: 13, fontWeight: activeTab === key ? 500 : 400,
                  padding: '0 10px', height: 48,
                  position: 'relative', transition: 'color 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => {
                  if (activeTab !== key) e.currentTarget.style.color = key === 'agent' ? '#F59E0B' : colors.textSecondary
                }}
                onMouseLeave={e => {
                  if (activeTab !== key) e.currentTarget.style.color = colors.textMuted
                }}
              >
                {label}
                {activeTab === key && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 10, right: 10, height: 1,
                    background: key === 'agent' ? '#F59E0B' : colors.textPrimary,
                  }} />
                )}
              </button>
            ))}
          </div>

          {/* Right: API status + Auth */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: statusDot,
              animation: apiStatus === 'checking' ? 'pulse 1.5s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }} />
            <span className="flint-api-label" style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
              {apiStatus === 'ok' ? 'api live' : apiStatus === 'error' ? 'api down' : '...'}
            </span>
            {!authLoading && (
              user ? (
                <div ref={profileMenuRef} style={{ position: 'relative', zIndex: 100, marginLeft: 16 }}>
                  <button
                    onClick={() => setProfileMenuOpen(o => !o)}
                    style={{
                      background: 'none', border: `1px solid ${colors.panelBorder}`, padding: 4, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%',
                    }}
                  >
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" width={28} height={28} style={{ borderRadius: '50%', display: 'block' }} />
                    ) : (
                      <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="2.5" />
                        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                      </svg>
                    )}
                  </button>
                  {profileMenuOpen && (
                    <div
                      style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: 6,
                        minWidth: 200,
                        background: colors.panelBg,
                        border: `1px solid ${colors.panelBorder}`,
                        borderRadius: 8,
                        padding: 12,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        zIndex: 1000,
                      }}
                    >
                      <div style={{ paddingBottom: 10, marginBottom: 8, borderBottom: `1px solid ${colors.panelBorder}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" width={40} height={40} style={{ borderRadius: '50%', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: colors.panelBorder, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="1.5">
                                <circle cx="12" cy="8" r="2.5" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                              </svg>
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: colors.textPrimary }}>{user.name || 'Profile'}</div>
                            <div style={{ fontSize: 11, color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: colors.textPrimary }}>{theme === 'dark' ? 'Dark' : 'Light'} mode</span>
                        <Toggle
                          checked={theme === 'dark'}
                          onChange={() => toggleTheme()}
                          onColor={colors.panelBorder}
                          offColor={colors.textSecondary}
                          ariaLabel={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        />
                      </div>
                      <button
                        onClick={() => { switchTab('settings'); setProfileMenuOpen(false) }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                          background: 'none', border: 'none', color: colors.textPrimary, fontSize: 13,
                          cursor: 'pointer', borderRadius: 6,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = colors.rowHover }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                      >
                        Settings
                      </button>
                      <button
                        onClick={() => { logout(); setProfileMenuOpen(false) }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                          background: 'none', border: 'none', color: colors.textMuted, fontSize: 13,
                          cursor: 'pointer', borderRadius: 6,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = colors.rowHover; e.currentTarget.style.color = colors.textPrimary }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textMuted }}
                      >
                        Log out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowLoginPage(true)}
                  style={{
                    background: colors.panelBg, border: `1px solid ${colors.panelBorder}`,
                    color: colors.textPrimary, fontSize: 12, padding: '6px 12px',
                    cursor: 'pointer', borderRadius: 4, fontWeight: 500,
                    marginLeft: 16,
                  }}
                >
                  Sign in
                </button>
              )
            )}
          </div>
        </nav>

        {/* Page */}
        <main
          className="flint-main"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.15s ease' }}
        >
          <div style={{ display: activeTab === 'create' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <WorkflowCreator
              initialDescription={templatePrefill ?? undefined}
              onPrefillConsumed={() => setTemplatePrefill(null)}
              onOpenLoginPage={() => setShowLoginPage(true)}
            />
          </div>
          <div style={{ display: activeTab === 'agent' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Agent
              personalizedSuggestions={personalizedSuggestions}
              onEnablePersonalized={() => handlePersonalizedSuggestionsChange(true)}
            />
          </div>
          <div style={{ display: activeTab === 'templates' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Templates onUseTemplate={handleUseTemplate} />
          </div>
          <div style={{ display: activeTab === 'dashboard' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <ExecutionDashboard />
          </div>
          <div style={{ display: activeTab === 'settings' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Settings
              personalizedSuggestions={personalizedSuggestions}
              onPersonalizedSuggestionsChange={handlePersonalizedSuggestionsChange}
            />
          </div>
        </main>
      </div>
    </>
  )
}
