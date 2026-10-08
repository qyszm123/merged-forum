import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// 移植自 qyszm 的 8 套主题：默认深色（靛紫 #667eea → #764ba2 渐变）
export const themes = {
  dark: {
    name: '深色', icon: '🌙',
    primary: '#667eea', secondary: '#764ba2',
    background: '#0d0d0d', surface: '#1a1a2e', surfaceLight: '#252542',
    border: 'rgba(255,255,255,0.1)', text: '#ffffff', textSecondary: '#a0a0a0',
    textMuted: '#666666', accent: '#667eea', success: '#10b981', warning: '#f59e0b',
    error: '#ef4444', shadow: 'rgba(0,0,0,0.5)',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  },
  light: {
    name: '浅色', icon: '☀️',
    primary: '#4F6EF7', secondary: '#2DD4BF',
    background: '#F8FAFC', surface: '#FFFFFF', surfaceLight: '#F1F5F9',
    border: '#E2E8F0', text: '#0F172A', textSecondary: '#475569',
    textMuted: '#94A3B8', accent: '#4F6EF7', success: '#10B981', warning: '#F59E0B',
    error: '#EF4444', shadow: 'rgba(15, 23, 42, 0.08)',
    gradient: 'linear-gradient(135deg, #4F6EF7 0%, #2DD4BF 100%)'
  },
  ocean: {
    name: '海洋', icon: '🌊',
    primary: '#0ea5e9', secondary: '#06b6d4',
    background: '#0c1929', surface: '#16213e', surfaceLight: '#1f3460',
    border: 'rgba(14,165,233,0.2)', text: '#ffffff', textSecondary: '#93c5fd',
    textMuted: '#64748b', accent: '#0ea5e9', success: '#22d3ee', warning: '#fbbf24',
    error: '#f87171', shadow: 'rgba(14,165,233,0.2)',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)'
  },
  forest: {
    name: '森林', icon: '🌲',
    primary: '#22c55e', secondary: '#10b981',
    background: '#052e16', surface: '#14532d', surfaceLight: '#166534',
    border: 'rgba(34,197,94,0.2)', text: '#dcfce7', textSecondary: '#bbf7d0',
    textMuted: '#64748b', accent: '#22c55e', success: '#4ade80', warning: '#fbbf24',
    error: '#f87171', shadow: 'rgba(34,197,94,0.2)',
    gradient: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)'
  },
  sunset: {
    name: '日落', icon: '🌅',
    primary: '#f97316', secondary: '#ef4444',
    background: '#1c1917', surface: '#292524', surfaceLight: '#3f3a35',
    border: 'rgba(249,115,22,0.2)', text: '#fef3c7', textSecondary: '#fed7aa',
    textMuted: '#64748b', accent: '#f97316', success: '#22c55e', warning: '#eab308',
    error: '#f87171', shadow: 'rgba(249,115,22,0.2)',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)'
  },
  purple: {
    name: '紫霞', icon: '💜',
    primary: '#a855f7', secondary: '#d946ef',
    background: '#1a0a2e', surface: '#2d1b4e', surfaceLight: '#3d2a6b',
    border: 'rgba(168,85,247,0.2)', text: '#f3e8ff', textSecondary: '#c4b5fd',
    textMuted: '#64748b', accent: '#a855f7', success: '#22c55e', warning: '#fbbf24',
    error: '#f87171', shadow: 'rgba(168,85,247,0.2)',
    gradient: 'linear-gradient(135deg, #a855f7 0%, #d946ef 100%)'
  },
  cyber: {
    name: '赛博', icon: '⚡',
    primary: '#00ff88', secondary: '#00ffff',
    background: '#0a0a0f', surface: '#12121a', surfaceLight: '#1a1a25',
    border: 'rgba(0,255,136,0.3)', text: '#ffffff', textSecondary: '#88ffcc',
    textMuted: '#00aa55', accent: '#00ff88', success: '#00ff88', warning: '#ffaa00',
    error: '#ff4488', shadow: 'rgba(0,255,136,0.3)',
    gradient: 'linear-gradient(135deg, #00ff88 0%, #00ffff 100%)'
  },
  autumn: {
    name: '金秋', icon: '🍂',
    primary: '#f59e0b', secondary: '#d97706',
    background: '#1c1917', surface: '#374151', surfaceLight: '#4b5563',
    border: 'rgba(245,158,11,0.2)', text: '#fef3c7', textSecondary: '#fde68a',
    textMuted: '#64748b', accent: '#f59e0b', success: '#22c55e', warning: '#fbbf24',
    error: '#f87171', shadow: 'rgba(245,158,11,0.2)',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
  }
}

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(() => localStorage.getItem('theme') || 'light')
  const theme = themes[themeName] || themes.light

  useEffect(() => {
    localStorage.setItem('theme', themeName)
    const r = document.documentElement.style
    r.setProperty('--theme-primary', theme.primary)
    r.setProperty('--theme-secondary', theme.secondary)
    r.setProperty('--theme-background', theme.background)
    r.setProperty('--theme-surface', theme.surface)
    r.setProperty('--theme-surface-light', theme.surfaceLight)
    r.setProperty('--theme-border', theme.border)
    r.setProperty('--theme-text', theme.text)
    r.setProperty('--theme-text-secondary', theme.textSecondary)
    r.setProperty('--theme-text-muted', theme.textMuted)
    r.setProperty('--theme-accent', theme.accent)
    r.setProperty('--theme-success', theme.success)
    r.setProperty('--theme-warning', theme.warning)
    r.setProperty('--theme-error', theme.error)
    r.setProperty('--theme-shadow', theme.shadow)
    r.setProperty('--theme-gradient', theme.gradient)
  }, [themeName, theme])

  const setTheme = useCallback((name) => {
    if (themes[name]) setThemeName(name)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
