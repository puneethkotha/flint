import React, { createContext, useContext, useEffect } from 'react'

export type Theme = 'dark'

export interface ThemeColors {
  pageBg: string
  panelBg: string
  panelBorder: string
  inputBg: string
  rowAlt: string
  rowHover: string
  rowSelected: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  textDisabled: string
  divider: string
  handle: string
  navBg: string
  statCardBg: string
  codeColor: string
}

const DARK: ThemeColors = {
  pageBg:        '#080808',
  panelBg:       '#0f0f0f',
  panelBorder:   '#1a1a1a',
  inputBg:       '#080808',
  rowAlt:        '#0c0c0c',
  rowHover:      '#141414',
  rowSelected:   '#161616',
  textPrimary:   '#f5f5f5',
  textSecondary: '#d1d5db',
  textMuted:     '#555',
  textDisabled:  '#333',
  divider:       '#141414',
  handle:        '#1a1a1a',
  navBg:         '#080808',
  statCardBg:    '#0f0f0f',
  codeColor:     '#888',
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
  useEffect(() => {
    document.body.style.background = '#080808'
    document.body.style.color = '#f5f5f5'
    // Remove any stale light preference from a previous session
    localStorage.removeItem('flint-theme')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme: 'dark', colors: DARK, toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
