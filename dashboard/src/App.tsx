import React, { useState } from 'react'
import WorkflowCreator from './components/WorkflowCreator'
import ExecutionDashboard from './components/ExecutionDashboard'

type Tab = 'create' | 'dashboard'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('create')

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; color: #f5f5f5; font-family: 'Inter', system-ui, sans-serif; }
        button { cursor: pointer; font-family: inherit; }
        textarea, input { font-family: inherit; }
      `}</style>

      <div style={{ background: '#0a0a0a', minHeight: '100vh', color: '#f5f5f5' }}>
        {/* Nav */}
        <nav style={{
          background: '#0a0a0a',
          borderBottom: '1px solid #1e1e1e',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 32,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>⚡</span>
            <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em', color: '#f5f5f5' }}>
              flint
            </span>
          </div>

          <div style={{ display: 'flex', gap: 2 }}>
            {[
              { key: 'create' as Tab, label: 'Create Workflow' },
              { key: 'dashboard' as Tab, label: 'Dashboard' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: activeTab === key ? '#f5f5f5' : '#6b7280',
                  fontSize: 13,
                  fontWeight: activeTab === key ? 500 : 400,
                  padding: '4px 10px',
                  borderRadius: 6,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => {
                  if (activeTab !== key) (e.currentTarget as HTMLElement).style.color = '#d1d5db'
                }}
                onMouseLeave={e => {
                  if (activeTab !== key) (e.currentTarget as HTMLElement).style.color = '#6b7280'
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
          {activeTab === 'create' && <WorkflowCreator />}
          {activeTab === 'dashboard' && <ExecutionDashboard />}
        </main>
      </div>
    </>
  )
}
