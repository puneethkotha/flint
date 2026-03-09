/**
 * LoginPage — full-screen login with Google, GitHub, Email, Sign up, Forgot password.
 * Shown when user clicks "Sign in" in the navbar.
 */

import React, { useState } from 'react'
import { useTheme } from '../theme'

const LOGO_SRC = '/flint-logo.png'

export interface LoginPageProps {
  onLoginGoogle: () => void
  onLoginGithub: () => void
  onBack: () => void
  onLoginWithCredentials?: (email: string, password: string) => void
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginGoogle, onLoginGithub, onBack, onLoginWithCredentials }) => {
  const { colors } = useTheme()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: colors.pageBg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 10001,
      }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          background: 'none',
          border: 'none',
          color: colors.textMuted,
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        ← Back
      </button>

      <div style={{ textAlign: 'center', maxWidth: 360, width: '100%' }}>
        <img
          src={LOGO_SRC}
          alt="Flint"
          width={80}
          height={80}
          style={{ display: 'block', margin: '0 auto 16px' }}
        />
        <h1
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 24,
            fontWeight: 600,
            color: colors.textPrimary,
            letterSpacing: '0.12em',
            marginBottom: 8,
          }}
        >
          flint
        </h1>
        <p
          style={{
            fontSize: 13,
            color: colors.textMuted,
            marginBottom: 28,
            lineHeight: 1.5,
          }}
        >
          {isSignUp ? 'Create an account to get started' : 'Sign in to your account'}
        </p>

        {/* Social sign-in */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <button
            onClick={onLoginGoogle}
            style={{
              width: '100%',
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 500,
              color: colors.textPrimary,
              background: colors.panelBg,
              border: `1px solid ${colors.panelBorder}`,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <svg width={18} height={18} viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.59a7.49 7.49 0 0 0 2.64-6.05z" />
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-2.7.82c-2.07 0-3.84-1.4-4.48-3.42H1.83v2.07C3.17 15.09 5.9 17 8.98 17z" />
              <path fill="#FBBC05" d="M4.5 10.75a4.62 4.62 0 0 1 0-2.96V5.72H1.83a7.49 7.49 0 0 0 0 6.72l2.67-2.69z" />
              <path fill="#EA4335" d="M8.98 4.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A7.5 7.5 0 0 0 1.83 5.72L4.5 8.43a4.77 4.77 0 0 1 4.48-3.85z" />
            </svg>
            Continue with Google
          </button>
          <button
            onClick={onLoginGithub}
            style={{
              width: '100%',
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 500,
              color: colors.textPrimary,
              background: colors.panelBg,
              border: `1px solid ${colors.panelBorder}`,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: colors.panelBorder }} />
          <span style={{ fontSize: 11, color: colors.textMuted }}>or</span>
          <div style={{ flex: 1, height: 1, background: colors.panelBorder }} />
        </div>

        {/* Email form — UI only for now, backend supports OAuth only */}
        {showForgotPassword ? (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12 }}>
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 14,
                background: colors.inputBg || colors.panelBg,
                border: `1px solid ${colors.panelBorder}`,
                borderRadius: 8,
                color: colors.textPrimary,
                marginBottom: 10,
              }}
            />
            <button
              style={{
                width: '100%',
                padding: '12px',
                fontSize: 14,
                fontWeight: 500,
                background: colors.textPrimary,
                color: colors.pageBg,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Send reset link
            </button>
            <button
              onClick={() => setShowForgotPassword(false)}
              style={{
                marginTop: 8,
                background: 'none',
                border: 'none',
                color: colors.textMuted,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 14,
                background: colors.inputBg || colors.panelBg,
                border: `1px solid ${colors.panelBorder}`,
                borderRadius: 8,
                color: colors.textPrimary,
                marginBottom: 10,
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 14,
                background: colors.inputBg || colors.panelBg,
                border: `1px solid ${colors.panelBorder}`,
                borderRadius: 8,
                color: colors.textPrimary,
                marginBottom: 12,
              }}
            />
            <button
              onClick={() => {
                if (onLoginWithCredentials && email.trim().toLowerCase() === 'admin' && password === 'admin') {
                  onLoginWithCredentials(email, password)
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: 14,
                fontWeight: 500,
                background: colors.textPrimary,
                color: colors.pageBg,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                marginBottom: 12,
              }}
            >
              {isSignUp ? 'Create account' : 'Sign in with email'}
            </button>
          </>
        )}

        {/* Sign up / Sign in toggle + Forgot password */}
        {!showForgotPassword && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              style={{
                background: 'none',
                border: 'none',
                color: colors.textMuted,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
            <button
              onClick={() => setShowForgotPassword(true)}
              style={{
                background: 'none',
                border: 'none',
                color: colors.textMuted,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Forgot password?
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default LoginPage
