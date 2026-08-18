import React, { useState, useMemo } from 'react'
import { useTheme } from '../../theme'
import templatesData from '../../data/templates.json'
import { CategoryIcon, CATEGORY_ACCENT, Clock, ArrowRight, Spark } from '../icons'

export interface WorkflowTemplate {
  id: string
  title: string
  description: string
  category: string
  tags: string[]
  estimatedRuntime: string
}

const CATEGORIES = ['All', 'Data Pipelines', 'AI Pipelines', 'DevOps', 'Finance', 'Research'] as const

// Short labels for the sidebar rail.
const RAIL_LABEL: Record<string, string> = {
  All: 'All', 'Data Pipelines': 'Data', 'AI Pipelines': 'AI',
  DevOps: 'DevOps', Finance: 'Finance', Research: 'Research',
}

const TAG_COLORS: Record<string, string> = {
  HTTP: '#2563eb', LLM: '#10b981', SQL: '#7c3aed', WEBHOOK: '#db2777',
}

// ── Mini DAG preview (featured hero) ─────────────────────────────────────────
// Renders a representative node-graph from a template's task tags.
function MiniDAG({ tags }: { tags: string[] }) {
  const nodes = tags.length >= 2 ? tags.slice(0, 4) : ['HTTP', ...tags].slice(0, 4)
  const W = 260, H = 120, n = nodes.length
  const step = n > 1 ? (W - 72) / (n - 1) : 0
  const pts = nodes.map((t, i) => ({
    x: 36 + i * step,
    y: H / 2 + (i % 2 === 0 ? -14 : 14),
    c: TAG_COLORS[t] ?? '#8a8f98',
  }))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ maxWidth: 260 }}>
      {pts.slice(1).map((p, i) => (
        <line key={i} x1={pts[i].x} y1={pts[i].y} x2={p.x} y2={p.y} stroke={pts[i].c} strokeWidth={1.5} opacity={0.5} />
      ))}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={13} fill="#0f0f0f" stroke={p.c} strokeWidth={1.6} />
          <circle cx={p.x} cy={p.y} r={3.2} fill={p.c} />
        </g>
      ))}
    </svg>
  )
}

export default function Templates({ onUseTemplate }: { onUseTemplate: (description: string) => void }) {
  const { colors } = useTheme()
  const [category, setCategory] = useState<string>('All')

  const templates = (templatesData as { templates: WorkflowTemplate[] }).templates

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: templates.length }
    for (const t of templates) c[t.category] = (c[t.category] ?? 0) + 1
    return c
  }, [templates])

  const filtered = useMemo(
    () => (category === 'All' ? templates : templates.filter(t => t.category === category)),
    [templates, category]
  )
  const featured = filtered[0]
  const rest = filtered.slice(1)

  return (
    <div className="tpl-wrap" style={{ display: 'flex', gap: 22, height: '100%', overflow: 'hidden' }}>
      <style>{`
        .tpl-card { transition: border-color .15s, transform .15s; }
        .tpl-card:hover { border-color: #2f2f2f; transform: translateY(-1px); }
        .tpl-card:hover .tpl-use { background: #F59E0B; color: #0a0a0a; border-color: #F59E0B; }
        .tpl-card:hover .tpl-use svg { transform: translateX(2px); }
        .tpl-use svg, .tpl-feat-cta svg { transition: transform .15s; }
        .tpl-feat-cta:hover svg { transform: translateX(3px); }
        .tpl-rail-item { transition: background .12s, color .12s; }
        @media (max-width: 899px) {
          .tpl-wrap { flex-direction: column !important; overflow: auto !important; }
          .tpl-rail { flex-direction: row !important; width: auto !important; overflow-x: auto; gap: 6px !important; padding-bottom: 4px; }
          .tpl-rail h4 { display: none; }
          .tpl-rail-item { white-space: nowrap; }
          .tpl-rail-item .tpl-ct { display: none; }
          .tpl-grid { grid-template-columns: 1fr !important; }
          .tpl-feat-art { display: none !important; }
        }
      `}</style>

      {/* ── Category sidebar ── */}
      <div className="tpl-rail" style={{ width: 168, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h4 style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.textMuted, fontFamily: 'ui-monospace, monospace', margin: '2px 0 8px 8px' }}>Browse</h4>
        {CATEGORIES.map(cat => {
          const active = category === cat
          const accent = CATEGORY_ACCENT[cat] ?? colors.textMuted
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="tpl-rail-item"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8,
                background: active ? colors.rowHover : 'transparent', border: 'none', cursor: 'pointer',
                color: active ? colors.textPrimary : colors.textMuted, fontSize: 13, textAlign: 'left',
              }}
            >
              <span style={{ display: 'inline-flex', color: active ? accent : colors.textMuted }}>
                <CategoryIcon category={cat} size={15} />
              </span>
              {RAIL_LABEL[cat]}
              <span className="tpl-ct" style={{ marginLeft: 'auto', fontSize: 10, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                {counts[cat] ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Featured hero */}
        {featured && (
          <FeaturedHero template={featured} colors={colors} onUse={() => onUseTemplate(featured.description)} />
        )}

        {/* Grid */}
        <div className="tpl-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {rest.map(t => {
            const accent = CATEGORY_ACCENT[t.category] ?? colors.textMuted
            return (
              <div
                key={t.id}
                className="tpl-card"
                style={{
                  position: 'relative', display: 'flex', gap: 14,
                  background: colors.panelBg, border: `1px solid ${colors.panelBorder}`, borderRadius: 10,
                  padding: '15px 16px 15px 18px', overflow: 'hidden',
                }}
              >
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent, opacity: 0.85 }} />
                <div style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  background: accent + '14', border: `1px solid ${accent}33`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
                }}>
                  <CategoryIcon category={t.category} size={17} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent, fontFamily: 'ui-monospace, monospace', marginBottom: 4 }}>
                    {t.category}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, marginBottom: 4, letterSpacing: '-0.01em' }}>
                    {t.title}
                  </div>
                  <div style={{
                    fontSize: 11.5, color: colors.textMuted, lineHeight: 1.45, marginBottom: 10,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {t.description}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                      <Clock size={11} /> {t.estimatedRuntime}
                    </span>
                    <button
                      onClick={() => onUseTemplate(t.description)}
                      className="tpl-use"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500,
                        color: colors.textSecondary, background: colors.rowHover, border: `1px solid ${colors.panelBorder}`,
                        borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                      }}
                    >
                      Use <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Featured hero ────────────────────────────────────────────────────────────
const FeaturedHero: React.FC<{
  template: WorkflowTemplate
  colors: ReturnType<typeof useTheme>['colors']
  onUse: () => void
}> = ({ template, colors, onUse }) => (
  <div style={{
    position: 'relative', border: `1px solid ${colors.panelBorder}`, borderRadius: 12, overflow: 'hidden',
    padding: '22px 24px', display: 'flex', gap: 24, alignItems: 'center', flexShrink: 0,
    background: colors.panelBg,
    backgroundImage: `radial-gradient(circle at 1px 1px, ${colors.panelBorder} 1px, transparent 0), linear-gradient(120deg, rgba(124,58,237,0.08), transparent 55%)`,
    backgroundSize: '18px 18px, 100% 100%',
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#8b5cf6', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace', marginBottom: 9 }}>
        <Spark size={13} /> Featured
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: colors.textPrimary, letterSpacing: '-0.02em', marginBottom: 8 }}>
        {template.title}
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.55, maxWidth: 460, marginBottom: 14 }}>
        {template.description}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {template.tags.map(tag => {
          const c = TAG_COLORS[tag] ?? colors.textMuted
          return (
            <span key={tag} style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              color: c, border: `1px solid ${c}44`, padding: '3px 7px', borderRadius: 5, fontFamily: 'ui-monospace, monospace',
            }}>{tag}</span>
          )
        })}
      </div>
      <button
        onClick={onUse}
        className="tpl-feat-cta"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, background: '#F59E0B', color: '#0a0a0a',
          fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
        }}
      >
        Use template <ArrowRight size={14} color="#0a0a0a" />
      </button>
    </div>
    <div style={{ flexShrink: 0, width: 260, height: 120 }} className="tpl-feat-art">
      <MiniDAG tags={template.tags} />
    </div>
  </div>
)
