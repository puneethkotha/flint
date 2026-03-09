import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

const THEME_KEY = 'flint-theme'

export type Theme = 'dark' | 'light'

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

const LIGHT: ThemeColors = {
  pageBg:        '#fafafa',
  panelBg:       '#ffffff',
  panelBorder:   '#e5e5e5',
  inputBg:       '#f5f5f5',
  rowAlt:        '#fafafa',
  rowHover:      '#f5f5f5',
  rowSelected:   '#eeeeee',
  textPrimary:   '#171717',
  textSecondary: '#525252',
  textMuted:     '#737373',
  textDisabled:  '#a3a3a3',
  divider:       '#e5e5e5',
  handle:        '#d4d4d4',
  navBg:         '#fafafa',
  statCardBg:    '#ffffff',
  codeColor:     '#525252',
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
    const s = localStorage.getItem(THEME_KEY)
    return (s === 'light' ? 'light' : 'dark') as Theme
  })

  const colors = theme === 'light' ? LIGHT : DARK

  const toggle = useCallback(() => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, next)
      return next
    })
  }, [])

  useEffect(() => {
    document.body.style.background = colors.pageBg
    document.body.style.color = colors.textPrimary
  }, [colors.pageBg, colors.textPrimary])

  return (
    <ThemeContext.Provider value={{ theme, colors, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
