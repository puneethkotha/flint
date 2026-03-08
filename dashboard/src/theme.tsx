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
  pageBg:       '#fafafa',
  panelBg:      '#ffffff',
  panelBorder:  '#e5e7eb',
  inputBg:      '#f9fafb',
  rowAlt:       '#f9fafb',
  rowHover:     '#f3f4f6',
  rowSelected:  '#eff6ff',
  textPrimary:  '#111111',
  textSecondary:'#374151',
  textMuted:    '#9ca3af',
  textDisabled: '#d1d5db',
  divider:      '#e5e7eb',
  handle:       '#d1d5db',
  navBg:        '#ffffff',
  statCardBg:   '#f9fafb',
  codeColor:    '#6b7280',
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
    document.body.style.background = theme === 'dark' ? '#080808' : '#fafafa'
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
