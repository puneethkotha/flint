/**
 * Flint icon set — small, crafted line icons that replace emoji/unicode glyphs.
 *
 * All icons are 24×24, stroke-based, and inherit `color` via currentColor, so
 * they pick up the accent of whatever they're placed in. Keep the visual
 * language sharp and technical (matches the flint/instrument aesthetic) — no
 * filled blobs, no sparkles.
 */

import React from 'react'

interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
  style?: React.CSSProperties
}

const base = (size: number, color?: string, sw = 1.6): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color ?? 'currentColor',
  strokeWidth: sw,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

/** Shield + heartbeat — reliability (shield) meets healing (pulse). The Self-Heal mark. */
export const ShieldPulse: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.7, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <path d="M12 3 5 5.6v5.2c0 4 2.8 7 7 8.4 4.2-1.4 7-4.4 7-8.4V5.6L12 3Z" />
    <path d="M7.6 12h2l1.2-2.6L13 14.2l1.1-2.2h2.3" />
  </svg>
)

/** Node graph — a small dependency tree. Used for DAG empty states + AI category. */
export const NodeGraph: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <circle cx="12" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="18" r="2" />
    <path d="M12 8v2.5M11 12l-3.4 4M13 12l3.4 4" />
  </svg>
)

/** Two nodes joined by a pipe — data pipelines. */
export const Flow: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <circle cx="6" cy="12" r="2.2" />
    <circle cx="18" cy="12" r="2.2" />
    <path d="M8.2 12h7.6" />
  </svg>
)

/** Git branch/merge — DevOps. */
export const Branch: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <circle cx="6" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="9" r="2" />
    <path d="M6 8v8M6 13h6a6 6 0 0 0 6-6" />
  </svg>
)

/** Upward trend with an arrowhead — Finance. */
export const Trend: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <path d="M4 15l5-5 3.5 3.5L20 6" />
    <path d="M15 6h5v5" />
  </svg>
)

/** Magnifier — Research. */
export const Search: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
)

/** Dot grid — the "All" category. */
export const Grid: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <circle cx="7" cy="7" r="1.4" />
    <circle cx="17" cy="7" r="1.4" />
    <circle cx="7" cy="17" r="1.4" />
    <circle cx="17" cy="17" r="1.4" />
  </svg>
)

/** Clock — runtime estimate. */
export const Clock: React.FC<IconProps> = ({ size = 12, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l2.5 1.5" />
  </svg>
)

/** Arrow — call-to-action. */
export const ArrowRight: React.FC<IconProps> = ({ size = 13, color, strokeWidth = 1.8, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
)

/** Flint facet — the brand mark. Used for LLM/agent surfaces (not a sparkle). */
export const Spark: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <path d="M12 3 19 12 12 21 5 12Z" />
    <path d="M12 8.4 15.6 12 12 15.6 8.4 12Z" />
  </svg>
)

/** Database cylinder — SQL. */
export const Database: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
  </svg>
)

/** Sun — light-mode toggle. */
export const Sun: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)

/** Moon — dark-mode toggle. */
export const Moon: React.FC<IconProps> = ({ size = 16, color, strokeWidth = 1.6, style }) => (
  <svg {...base(size, color, strokeWidth)} style={style}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </svg>
)

/** Map a task-type tag → its crafted glyph (for example/inspiration cards). */
export const TaskTypeIcon: React.FC<{ kind: string } & IconProps> = ({ kind, ...rest }) => {
  switch (kind.toUpperCase()) {
    case 'HTTP': return <Flow {...rest} />
    case 'SQL': return <Database {...rest} />
    case 'LLM': return <Spark {...rest} />
    case 'WEBHOOK': return <Branch {...rest} />
    default: return <NodeGraph {...rest} />
  }
}

/** Map a template category → its icon + accent colour. */
export const CATEGORY_ACCENT: Record<string, string> = {
  All: '#8a8f98',
  'Data Pipelines': '#2563eb',
  'AI Pipelines': '#7c3aed',
  DevOps: '#F59E0B',
  Finance: '#10b981',
  Research: '#0891b2',
}

export const CategoryIcon: React.FC<{ category: string } & IconProps> = ({ category, ...rest }) => {
  switch (category) {
    case 'Data Pipelines': return <Flow {...rest} />
    case 'AI Pipelines': return <NodeGraph {...rest} />
    case 'DevOps': return <Branch {...rest} />
    case 'Finance': return <Trend {...rest} />
    case 'Research': return <Search {...rest} />
    default: return <Grid {...rest} />
  }
}
