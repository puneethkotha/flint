import React, { useState, useMemo } from 'react'
import { useTheme } from '../../theme'
import templatesData from '../../data/templates.json'
import { CategoryIcon, CATEGORY_ACCENT, Clock, ArrowRight } from '../icons'

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
  LLM: '#10b981',
  SQL: '#7c3aed',
  WEBHOOK: '#db2777',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%', overflow: 'hidden' }}>
      <style>{`
        .tpl-card { transition: border-color .15s, transform .15s, box-shadow .15s; }
        .tpl-card:hover { border-color: #2c2c2c; transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0,0,0,.45); }
        .tpl-card:hover .tpl-accent { opacity: 1; box-shadow: 0 0 10px 0 var(--accent); }
        .tpl-use { transition: background .15s, color .15s, border-color .15s; }
        .tpl-card:hover .tpl-use { background: #F59E0B; color: #0a0a0a; border-color: #F59E0B; }
        .tpl-card:hover .tpl-use svg { transform: translateX(2px); }
        .tpl-use svg { transition: transform .15s; }
        .tpl-chip { transition: background .15s, color .15s, border-color .15s; }
      `}</style>

      {/* Category filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
        {CATEGORIES.map(cat => {
          const active = category === cat
          const accent = CATEGORY_ACCENT[cat] ?? colors.textMuted
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="tpl-chip"
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: active ? '#151515' : 'transparent',
                border: `1px solid ${active ? '#2a2a2a' : colors.panelBorder}`,
                color: active ? colors.textPrimary : colors.textMuted,
                fontSize: 12, padding: '7px 13px', borderRadius: 7, cursor: 'pointer',
              }}
            >
              <span style={{ display: 'inline-flex', color: active ? accent : colors.textMuted }}>
                <CategoryIcon category={cat} size={14} />
              </span>
              {cat}
            </button>
          )
        })}
      </div>

      {/* Grid of cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 14, overflow: 'auto', paddingBottom: 24, alignContent: 'start',
      }}>
        {filtered.map(t => {
          const accent = CATEGORY_ACCENT[t.category] ?? colors.textMuted
          return (
            <div
              key={t.id}
              className="tpl-card"
              style={{
                position: 'relative',
                background: colors.panelBg,
                border: `1px solid ${colors.panelBorder}`,
                borderRadius: 10,
                padding: '16px 16px 14px',
                display: 'flex', flexDirection: 'column', gap: 11,
                minHeight: 0, minWidth: 0,
                ['--accent' as string]: accent,
              }}
            >
              {/* accent bar */}
              <div className="tpl-accent" style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: accent, opacity: 0.85, borderRadius: '10px 10px 0 0',
              }} />

              {/* category header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: accent }}>
                <CategoryIcon category={t.category} size={15} />
                <span style={{
                  fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                  fontFamily: 'ui-monospace, monospace', color: accent,
                }}>{t.category}</span>
              </div>

              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: 14.5, fontWeight: 600, color: colors.textPrimary, marginBottom: 6, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
                  {t.title}
                </h3>
                <p style={{
                  fontSize: 12, color: colors.textMuted, lineHeight: 1.5,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', overflowWrap: 'break-word',
                }}>
                  {t.description}
                </p>
              </div>

              {/* tags (outline chips) */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {t.tags.map(tag => {
                  const c = TAG_COLORS[tag] ?? colors.textMuted
                  return (
                    <span key={tag} style={{
                      fontSize: 9.5, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: c, border: `1px solid ${c}44`, background: 'transparent',
                      padding: '2.5px 7px', borderRadius: 5, fontFamily: 'ui-monospace, monospace',
                    }}>{tag}</span>
                  )
                })}
              </div>

              {/* footer */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 'auto', paddingTop: 11, borderTop: `1px solid ${colors.panelBorder}`,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                  <Clock size={12} /> {t.estimatedRuntime}
                </span>
                <button
                  onClick={() => onUseTemplate(t.description)}
                  className="tpl-use"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: colors.rowHover, color: colors.textSecondary,
                    border: `1px solid ${colors.panelBorder}`, fontSize: 12, fontWeight: 500,
                    padding: '6px 11px', borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  Use template <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
