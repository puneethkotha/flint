import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { generateCoolUsername } from '../utils/usernameGenerator'

const TOKEN_KEY = 'flint_token'
const MASTER_DISPLAY_NAME_KEY = 'flint-master-display-name'
const JUST_LOGGED_IN_KEY = 'flint-just-logged-in'

export interface User {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
}

const MASTER_TOKEN = '__flint_master_preview__'

interface AuthContextValue {
  token: string | null
  user: User | null
  loading: boolean
  justLoggedIn: boolean
  clearJustLoggedIn: () => void
  login: (provider: 'google' | 'github') => void
  loginAsMaster: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const getMasterDisplayName = useCallback(() => {
    const stored = sessionStorage.getItem(MASTER_DISPLAY_NAME_KEY)
    if (stored) return stored
    const name = generateCoolUsername()
    sessionStorage.setItem(MASTER_DISPLAY_NAME_KEY, name)
    return name
  }, [])

  const fetchUser = useCallback(async (t: string) => {
    if (t === MASTER_TOKEN) {
      setUser({
        id: 'master-preview',
        email: 'preview@flint.demo',
        name: getMasterDisplayName(),
        avatar_url: null,
      })
      return
    }
    const apiUrl = import.meta.env.VITE_API_URL ?? ''
    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.ok) {
        const u = await res.json()
        setUser(u)
        return
      }
    } catch {
      /* ignore */
    }
    setToken(null)
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [getMasterDisplayName])

  useEffect(() => {
    if (token) {
      fetchUser(token).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token, fetchUser])

  const login = useCallback((provider: 'google' | 'github') => {
    const apiUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') || window.location.origin
    window.location.href = `${apiUrl}/api/v1/auth/${provider}`
  }, [])

  const loginAsMaster = useCallback(() => {
    localStorage.setItem(TOKEN_KEY, MASTER_TOKEN)
    sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1')
    setToken(MASTER_TOKEN)
    setUser({
      id: 'master-preview',
      email: 'preview@flint.demo',
      name: getMasterDisplayName(),
      avatar_url: null,
    })
  }, [getMasterDisplayName])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(MASTER_DISPLAY_NAME_KEY)
  }, [])

  const [justLoggedIn, setJustLoggedIn] = useState(false)

  const handleCallback = useCallback(() => {
    const hash = window.location.hash
    if (window.location.pathname === '/auth/callback' && hash.startsWith('token=')) {
      const t = hash.slice(6)
      if (t) {
        localStorage.setItem(TOKEN_KEY, t)
        sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1')
        setToken(t)
        window.history.replaceState({}, '', '/')
      }
    }
  }, [])

  useEffect(() => {
    handleCallback()
  }, [handleCallback])

  useEffect(() => {
    if (sessionStorage.getItem(JUST_LOGGED_IN_KEY) === '1') {
      setJustLoggedIn(true)
    }
  }, [user])

  const clearJustLoggedIn = useCallback(() => {
    sessionStorage.removeItem(JUST_LOGGED_IN_KEY)
    setJustLoggedIn(false)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, loading, justLoggedIn, clearJustLoggedIn, login, loginAsMaster, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
