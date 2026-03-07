import React, { useState } from 'react'
import WorkflowCreator from './components/WorkflowCreator'
import ExecutionDashboard from './components/ExecutionDashboard'

type Tab = 'create' | 'dashboard'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('create')

  return (
    <div style={{ background: '#0f0f0f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a', padding: '0 24px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 32, height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.5px' }}>Flint</span>
            <span style={{ color: '#666', fontSize: 12, marginLeft: 4 }}>workflow engine</span>
          </div>
          <nav style={{ display: 'flex', gap: 4 }}>
            {(['create', 'dashboard'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? '#3b82f6' : 'transparent',
                  color: activeTab === tab ? '#fff' : '#888',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  textTransform: 'capitalize',
                }}
              >
                {tab === 'create' ? '+ Create Workflow' : '📊 Dashboard'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        {activeTab === 'create' && <WorkflowCreator />}
        {activeTab === 'dashboard' && <ExecutionDashboard />}
      </main>
    </div>
  )
}
