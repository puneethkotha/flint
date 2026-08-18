/**
 * ⌘K command palette — quick-switcher for tabs, templates, and actions.
 * Opens on ⌘K / Ctrl+K (wired in App). Arrow keys to move, Enter to run, Esc to close.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../theme'
import templatesData from '../data/templates.json'
import { Search, ArrowRight, Flow, Spark, ShieldPulse, Grid, Trend, CategoryIcon } from './icons'

type NavTab = 'create' | 'agent' | 'selfheal' | 'templates' | 'dashboard'

interface Action {
  id: string
  group: string
  label: string
  hint?: string
  icon: React.ReactNode
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  onNavigate: (tab: NavTab) => void
  onUseTemplate: (description: string) => void
}

const iconProps = { size: 16 }

export default function CommandPalette({ open, onClose, onNavigate, onUseTemplate }: Props) {
  const { colors } = useTheme()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const templates = (templatesData as { templates: { id: string; title: string; description: string; category: string }[] }).templates

  const actions = useMemo<Action[]>(() => {
    const nav: Action[] = [
      { id: 'nav-create', group: 'Navigate', label: 'Create Workflow', hint: 'Describe an automation', icon: <Flow {...iconProps} />, run: () => onNavigate('create') },
      { id: 'nav-agent', group: 'Navigate', label: 'Agent', hint: 'Chat to build a workflow', icon: <Spark {...iconProps} />, run: () => onNavigate('agent') },
      { id: 'nav-selfheal', group: 'Navigate', label: 'Self-Heal', hint: 'Audit & auto-patch reliability', icon: <ShieldPulse {...iconProps} />, run: () => onNavigate('selfheal') },
      { id: 'nav-templates', group: 'Navigate', label: 'Templates', hint: 'Browse ready-made workflows', icon: <Grid {...iconProps} />, run: () => onNavigate('templates') },
      { id: 'nav-dashboard', group: 'Navigate', label: 'Dashboard', hint: 'Runs, metrics, logs', icon: <Trend {...iconProps} />, run: () => onNavigate('dashboard') },
    ]
    const tpl: Action[] = templates.map(t => ({
      id: `tpl-${t.id}`,
      group: 'Run a template',
      label: t.title,
      hint: t.category,
      icon: <CategoryIcon category={t.category} size={16} />,
      run: () => onUseTemplate(t.description),
    }))
    return [...nav, ...tpl]
  }, [templates, onNavigate, onUseTemplate])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter(a =>
      a.label.toLowerCase().includes(q) ||
      (a.hint ?? '').toLowerCase().includes(q) ||
      a.group.toLowerCase().includes(q)
    )
  }, [actions, query])

  // Reset + focus when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  useEffect(() => { setActive(0) }, [query])

  // Keep active row in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const run = (a?: Action) => { if (!a) return; a.run(); onClose() }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  // group boundaries for headers
  let lastGroup = ''

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
        animation: 'cmdkFade 0.12s ease',
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: 'min(560px, 92vw)', maxHeight: '68vh', display: 'flex', flexDirection: 'column',
          background: colors.panelBg, border: `1px solid ${colors.panelBorder}`, borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}
      >
        {/* input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${colors.panelBorder}` }}>
          <span style={{ color: colors.textMuted, display: 'inline-flex' }}><Search size={16} /></span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Jump to a tab, or search a template to run…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: colors.textPrimary, fontSize: 14, fontFamily: 'inherit',
            }}
          />
          <kbd style={{
            fontSize: 10, color: colors.textMuted, fontFamily: 'ui-monospace, monospace',
            border: `1px solid ${colors.panelBorder}`, borderRadius: 4, padding: '2px 6px',
          }}>ESC</kbd>
        </div>

        {/* results */}
        <div ref={listRef} style={{ overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
              No matches for “{query}”
            </div>
          )}
          {filtered.map((a, i) => {
            const showGroup = a.group !== lastGroup
            lastGroup = a.group
            const isActive = i === active
            return (
              <React.Fragment key={a.id}>
                {showGroup && (
                  <div style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.textMuted, fontFamily: 'ui-monospace, monospace', padding: '10px 10px 5px' }}>
                    {a.group}
                  </div>
                )}
                <div
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(a)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 8,
                    background: isActive ? colors.rowHover : 'transparent', cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-flex', color: isActive ? '#F59E0B' : colors.textMuted, flexShrink: 0 }}>{a.icon}</span>
                  <span style={{ fontSize: 13, color: colors.textPrimary, flexShrink: 0 }}>{a.label}</span>
                  {a.hint && <span style={{ fontSize: 11, color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.hint}</span>}
                  {isActive && <span style={{ marginLeft: 'auto', color: '#F59E0B', display: 'inline-flex', flexShrink: 0 }}><ArrowRight size={14} /></span>}
                </div>
              </React.Fragment>
            )
          })}
        </div>

        <div style={{ padding: '8px 14px', borderTop: `1px solid ${colors.panelBorder}`, display: 'flex', gap: 14, fontSize: 10, color: colors.textMuted, fontFamily: 'ui-monospace, monospace' }}>
          <span>↑↓ navigate</span><span>↵ select</span><span style={{ marginLeft: 'auto' }}>flint ⌘K</span>
        </div>
      </div>

      <style>{`@keyframes cmdkFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}
