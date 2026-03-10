/**
 * Settings: user preferences (e.g. personalized suggestions).
 */

import React from 'react'
import { useTheme } from '../theme'
import Toggle from './Toggle'
import { getStoredUserData } from '../utils/userAnalytics'

const PREF_KEY = 'flint-personalized-suggestions'

export function getPersonalizedSuggestionsEnabled(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(PREF_KEY) === '1'
}

export function setPersonalizedSuggestionsEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PREF_KEY, enabled ? '1' : '')
}

interface Props {
  personalizedSuggestions: boolean
  onPersonalizedSuggestionsChange: (enabled: boolean) => void
}

export default function Settings({ personalizedSuggestions, onPersonalizedSuggestionsChange }: Props) {
  const { colors } = useTheme()
  return (
    <div style={{
      padding: 32,
      maxWidth: 480,
      margin: '0 auto',
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: colors.textPrimary, marginBottom: 24 }}>
        Settings
      </h2>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        background: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
        borderRadius: 8,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: colors.textPrimary }}>
            Personalized suggestions
          </div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 1.4 }}>
            Use your workflow history to suggest automations in the Agent tab
          </div>
        </div>
        <Toggle
          checked={personalizedSuggestions}
          onChange={onPersonalizedSuggestionsChange}
          ariaLabel={personalizedSuggestions ? 'Disable personalized suggestions' : 'Enable personalized suggestions'}
        />
      </div>

      <div style={{
        marginTop: 16,
        padding: 16,
        background: colors.panelBg,
        border: `1px solid ${colors.panelBorder}`,
        borderRadius: 8,
      }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: colors.textPrimary }}>
          Usage data (for review & learning)
        </div>
        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 1.4 }}>
          Non-sensitive activity stored by userId and username. Export for analysis or model training.
        </div>
        <button
          onClick={() => {
            const data = getStoredUserData()
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `flint-usage-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(a.href)
          }}
          style={{
            marginTop: 12,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 500,
            color: colors.textPrimary,
            background: colors.panelBorder,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Export usage data
        </button>
      </div>
    </div>
  )
}
