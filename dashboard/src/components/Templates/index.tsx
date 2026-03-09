import React, { useState, useMemo } from 'react'
import { useTheme } from '../../theme'
import templatesData from '../../data/templates.json'

export interface WorkflowTemplate {
  id: string
  title: string
  description: string
  category: string
  tags: string[]
  estimatedRuntime: string
}

const CATEGORIES = ['All', 'Data Pipelines', 'AI Pipelines', 'DevOps', 'Finance', 'Research'] as const

const TAG_COLORS: Record<string, string> = {
  HTTP: '#2563eb',
  LLM: '#059669',
  SQL: '#7c3aed',
  WEBHOOK: '#dc2626',
}

export default function Templates({ onUseTemplate }: { onUseTemplate: (description: string) => void }) {
  const { colors } = useTheme()
  const [category, setCategory] = useState<string>('All')

  const templates = (templatesData as { templates: WorkflowTemplate[] }).templates

  const filtered = useMemo(() => {
    if (category === 'All') return templates
    return templates.filter(t => t.category === category)
  }, [templates, category])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%', overflow: 'hidden' }}>
      {/* Category filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              background: category === cat ? colors.panelBorder : 'transparent',
              border: `1px solid ${colors.panelBorder}`,
              color: category === cat ? colors.textPrimary : colors.textMuted,
              fontSize: 12,
              padding: '6px 14px',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid of cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
          overflow: 'auto',
          paddingBottom: 24,
        }}
      >
        {filtered.map(t => (
          <div
            key={t.id}
            style={{
              background: colors.panelBg,
              border: `1px solid ${colors.panelBorder}`,
              borderRadius: 8,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minHeight: 0,
            }}
          >
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, marginBottom: 6, lineHeight: 1.3 }}>
                {t.title}
              </h3>
              <p style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.45 }}>
                {t.description}
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {t.tags.map(tag => (
                <span
                  key={tag}
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: TAG_COLORS[tag] ?? colors.textMuted,
                    background: `${TAG_COLORS[tag] ?? colors.panelBorder}22`,
                    padding: '2px 8px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 4 }}>
              <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                ~{t.estimatedRuntime}
              </span>
              <button
                onClick={() => onUseTemplate(t.description)}
                style={{
                  background: colors.textPrimary,
                  color: colors.pageBg,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '8px 14px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                Use Template
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
