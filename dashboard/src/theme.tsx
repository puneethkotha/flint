import React, { createContext, useContext, useState, useEffect } from 'react'

export type Theme = 'dark' | 'light'

export interface ThemeColors {
  // Backgrounds
  pageBg: string
  panelBg: string
  panelBorder: string
  inputBg: string
  rowAlt: string
  rowHover: string
  rowSelected: string
  // Text
  textPrimary: string
  textSecondary: string
  textMuted: string
  textDisabled: string
  // UI elements
  divider: string
  handle: string
  // Specific
  navBg: string
  statCardBg: string
  codeColor: string
}

const DARK: ThemeColors = {
  pageBg:       '#080808',
  panelBg:      '#0f0f0f',
  panelBorder:  '#1a1a1a',
  inputBg:      '#080808',
  rowAlt:       '#0c0c0c',
  rowHover:     '#141414',
  rowSelected:  '#161616',
  textPrimary:  '#f5f5f5',
  textSecondary:'#d1d5db',
  textMuted:    '#555',
  textDisabled: '#333',
  divider:      '#141414',
  handle:       '#1a1a1a',
  navBg:        '#080808',
  statCardBg:   '#0f0f0f',
  codeColor:    '#888',
}

const LIGHT: ThemeColors = {
  // Warm off-white — Claude's exact palette
  pageBg:        '#F5F4EF',  // warm parchment page
  panelBg:       '#FDFCFA',  // slightly warmer white for panels
  panelBorder:   '#E8E5DF',  // warm gray border
  inputBg:       '#F5F4EF',  // matches page
  rowAlt:        '#F5F4EF',  // warm tint on alternate rows
  rowHover:      '#EDEAE3',  // hover — slightly darker warm
  rowSelected:   '#E8E3D8',  // selected — warm tan
  textPrimary:   '#1A1916',  // near-black with slight warmth
  textSecondary: '#3D3B35',  // warm dark gray
  textMuted:     '#9E9A8E',  // warm muted
  textDisabled:  '#C8C4B8',  // warm disabled
  divider:       '#E8E5DF',  // same as border
  handle:        '#C8C4B8',  // node handle
  navBg:         '#FDFCFA',  // nav slightly brighter than page
  statCardBg:    '#F5F4EF',  // stat cards match page bg
  codeColor:     '#7A7568',  // warm code gray
}

interface ThemeCtx {
  theme: Theme
  colors: ThemeColors
  toggle: () => void
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'dark',
  colors: DARK,
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('flint-theme') as Theme) ?? 'dark'
  })

  useEffect(() => {
    localStorage.setItem('flint-theme', theme)
    document.body.style.background = theme === 'dark' ? '#080808' : '#F5F4EF'
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  const colors = theme === 'dark' ? DARK : LIGHT

  return (
    <ThemeContext.Provider value={{ theme, colors, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
