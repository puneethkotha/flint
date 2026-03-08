import React, { useState, useEffect, useRef } from 'react'
import WorkflowCreator from './components/WorkflowCreator'
import ExecutionDashboard from './components/ExecutionDashboard'

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

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('create')
  const [visible, setVisible] = useState(true)
  const prevTab = useRef<Tab>('create')
  const apiStatus = useAPIStatus()

  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return
    setVisible(false)
    setTimeout(() => {
      setActiveTab(tab)
      prevTab.current = tab
      setVisible(true)
    }, 150)
  }

  const statusDot = apiStatus === 'ok' ? '#22c55e' : apiStatus === 'error' ? '#ef4444' : '#6b7280'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        body {
          background: #080808;
          color: #f5f5f5;
          font-family: 'Inter', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        button { cursor: pointer; font-family: inherit; }
        textarea, input { font-family: inherit; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>

      <div style={{ background: '#080808', minHeight: '100vh', color: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
        {/* Navbar */}
        <nav style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          borderBottom: '1px solid #1a1a1a',
          position: 'relative',
          flexShrink: 0,
        }}>
          {/* Amber top border gradient */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: 1,
            background: 'linear-gradient(90deg, #F59E0B 0%, transparent 50%)',
          }} />

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 24 }}>
            <span style={{ color: '#F59E0B', fontSize: 15, lineHeight: 1 }}>⚡</span>
            <span style={{
              fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
              fontWeight: 600,
              fontSize: 14,
              color: '#f5f5f5',
              letterSpacing: '-0.02em',
            }}>
              flint
            </span>
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
                  background: 'none',
                  border: 'none',
                  color: activeTab === key ? '#f5f5f5' : '#555',
                  fontSize: 13,
                  fontWeight: activeTab === key ? 500 : 400,
                  padding: '0 12px',
                  height: 48,
                  position: 'relative',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (activeTab !== key) e.currentTarget.style.color = '#999' }}
                onMouseLeave={e => { if (activeTab !== key) e.currentTarget.style.color = '#555' }}
              >
                {label}
                {activeTab === key && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0, left: 12, right: 12,
                    height: 1,
                    background: '#f5f5f5',
                  }} />
                )}
              </button>
            ))}
          </div>

          {/* API status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6, height: 6,
              borderRadius: '50%',
              background: statusDot,
              animation: apiStatus === 'checking' ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 11, color: '#555', fontFamily: 'ui-monospace, monospace' }}>
              {apiStatus === 'ok' ? 'api live' : apiStatus === 'error' ? 'api down' : 'checking'}
            </span>
          </div>
        </nav>

        {/* Page content with fade transition */}
        <main style={{
          flex: 1,
          padding: '20px',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.15s ease',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {activeTab === 'create' && <WorkflowCreator />}
          {activeTab === 'dashboard' && <ExecutionDashboard />}
        </main>
      </div>
    </>
  )
}
