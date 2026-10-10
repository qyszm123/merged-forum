import { createContext, useContext, useState, useEffect, useCallback } from 'react'

/**
 * 奇遇广场 · 主题系统
 *
 * 每套主题提供同一组语义 token，切换时写入 :root 的 CSS 变量。
 * token 分五组：
 *   品牌   primary / secondary / accent / gradient
 *   表面   background（页面底）→ surface（卡片）→ surfaceLight（内嵌/悬浮）→ surfaceElevated（浮层）
 *   描边   border（常规分割） / borderStrong（需要强调的边界）
 *   文字   text / textSecondary / textMuted（三级，均已按 WCAG AA 校过对比度）
 *   状态   success / warning / error
 *
 * icon 使用的是 Feather 图标名（见 components/Icon.jsx），不再是 emoji。
 */

const LIGHT = 'light'
const DARK = 'dark'

export const themes = {
  light: {
    name: '浅色',
    icon: 'sun',
    mode: LIGHT,
    primary: '#4F6EF7',
    secondary: '#2DD4BF',
    accent: '#4F6EF7',
    background: '#F6F8FC',
    surface: '#FFFFFF',
    surfaceLight: '#F1F5F9',
    surfaceElevated: '#FFFFFF',
    border: '#E4E9F2',
    borderStrong: '#CBD5E1',
    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    success: '#0E9F6E',
    warning: '#D97706',
    error: '#DC2626',
    shadow: 'rgba(15, 23, 42, 0.10)',
    gradient: 'linear-gradient(135deg, #4F6EF7 0%, #2DD4BF 100%)'
  },

  dark: {
    name: '深色',
    icon: 'moon',
    mode: DARK,
    primary: '#7C8CFF',
    secondary: '#A78BFA',
    accent: '#7C8CFF',
    background: '#0B0D14',
    surface: '#141826',
    surfaceLight: '#1D2233',
    surfaceElevated: '#232A3D',
    border: 'rgba(255, 255, 255, 0.09)',
    borderStrong: 'rgba(255, 255, 255, 0.17)',
    text: '#F5F7FA',
    textSecondary: '#A8B2C6',
    textMuted: '#7D879C',
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    shadow: 'rgba(0, 0, 0, 0.5)',
    gradient: 'linear-gradient(135deg, #7C8CFF 0%, #A78BFA 100%)'
  },

  ocean: {
    name: '海洋',
    icon: 'droplet',
    mode: DARK,
    primary: '#38BDF8',
    secondary: '#22D3EE',
    accent: '#38BDF8',
    background: '#08131F',
    surface: '#0F1E33',
    surfaceLight: '#17293F',
    surfaceElevated: '#1D3350',
    border: 'rgba(125, 196, 255, 0.16)',
    borderStrong: 'rgba(125, 196, 255, 0.30)',
    text: '#EAF4FF',
    textSecondary: '#9FC3E0',
    textMuted: '#6E90AD',
    success: '#2DD4BF',
    warning: '#FBBF24',
    error: '#F87171',
    shadow: 'rgba(2, 12, 24, 0.55)',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #22D3EE 100%)'
  },

  forest: {
    name: '森林',
    icon: 'feather',
    mode: DARK,
    primary: '#34D399',
    secondary: '#6EE7B7',
    accent: '#34D399',
    background: '#071A11',
    surface: '#0F2A1C',
    surfaceLight: '#163725',
    surfaceElevated: '#1C4430',
    border: 'rgba(134, 239, 172, 0.16)',
    borderStrong: 'rgba(134, 239, 172, 0.32)',
    text: '#E8FBEF',
    textSecondary: '#A9D9BC',
    textMuted: '#71A388',
    success: '#4ADE80',
    warning: '#FBBF24',
    error: '#F87171',
    shadow: 'rgba(2, 16, 10, 0.55)',
    gradient: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)'
  },

  sunset: {
    name: '日落',
    icon: 'sunset',
    mode: DARK,
    primary: '#FB923C',
    secondary: '#F87171',
    accent: '#FB923C',
    background: '#17120F',
    surface: '#241B17',
    surfaceLight: '#30241E',
    surfaceElevated: '#3B2C24',
    border: 'rgba(251, 146, 60, 0.18)',
    borderStrong: 'rgba(251, 146, 60, 0.34)',
    text: '#FCEFE4',
    textSecondary: '#D9B49B',
    textMuted: '#A8836C',
    success: '#4ADE80',
    warning: '#FBBF24',
    error: '#F87171',
    shadow: 'rgba(20, 10, 5, 0.55)',
    gradient: 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)'
  },

  purple: {
    name: '紫霞',
    icon: 'star',
    mode: DARK,
    primary: '#C084FC',
    secondary: '#E879F9',
    accent: '#C084FC',
    background: '#140A24',
    surface: '#1F1236',
    surfaceLight: '#2A1A48',
    surfaceElevated: '#35215A',
    border: 'rgba(196, 181, 253, 0.18)',
    borderStrong: 'rgba(196, 181, 253, 0.34)',
    text: '#F5EDFF',
    textSecondary: '#C4B5E8',
    textMuted: '#8E7BB0',
    success: '#4ADE80',
    warning: '#FBBF24',
    error: '#F87171',
    shadow: 'rgba(12, 4, 26, 0.6)',
    gradient: 'linear-gradient(135deg, #A855F7 0%, #E879F9 100%)'
  },

  cyber: {
    name: '赛博',
    icon: 'zap',
    mode: DARK,
    primary: '#00E58A',
    secondary: '#22D3EE',
    accent: '#00E58A',
    background: '#07090C',
    surface: '#0F1318',
    surfaceLight: '#171D24',
    surfaceElevated: '#1E2630',
    border: 'rgba(0, 229, 138, 0.22)',
    borderStrong: 'rgba(0, 229, 138, 0.42)',
    text: '#E9FFF5',
    textSecondary: '#7FE8BE',
    textMuted: '#4E9E7C',
    success: '#00E58A',
    warning: '#FBBF24',
    error: '#FB7185',
    shadow: 'rgba(0, 0, 0, 0.6)',
    gradient: 'linear-gradient(135deg, #00E58A 0%, #22D3EE 100%)'
  },

  autumn: {
    name: '金秋',
    icon: 'sunrise',
    mode: DARK,
    primary: '#FBBF24',
    secondary: '#F59E0B',
    accent: '#FBBF24',
    background: '#17130E',
    surface: '#231C15',
    surfaceLight: '#2F261C',
    surfaceElevated: '#3B3024',
    border: 'rgba(251, 191, 36, 0.18)',
    borderStrong: 'rgba(251, 191, 36, 0.34)',
    text: '#FDF6E7',
    textSecondary: '#D8C39A',
    textMuted: '#A08B63',
    success: '#4ADE80',
    warning: '#F59E0B',
    error: '#F87171',
    shadow: 'rgba(18, 12, 4, 0.55)',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%)'
  }
}

/** token 名 → CSS 变量名 */
const CSS_VARS = {
  primary: '--theme-primary',
  secondary: '--theme-secondary',
  accent: '--theme-accent',
  background: '--theme-background',
  surface: '--theme-surface',
  surfaceLight: '--theme-surface-light',
  surfaceElevated: '--theme-surface-elevated',
  border: '--theme-border',
  borderStrong: '--theme-border-strong',
  text: '--theme-text',
  textSecondary: '--theme-text-secondary',
  textMuted: '--theme-text-muted',
  success: '--theme-success',
  warning: '--theme-warning',
  error: '--theme-error',
  shadow: '--theme-shadow',
  gradient: '--theme-gradient'
}

const THEME_KEYS = Object.keys(themes)
const STORAGE_KEY = 'theme'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return THEME_KEYS.includes(saved) ? saved : 'light'
  })

  const theme = themes[themeName] || themes.light

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, themeName)

    const root = document.documentElement
    const style = root.style
    for (const [key, cssVar] of Object.entries(CSS_VARS)) {
      style.setProperty(cssVar, theme[key])
    }
    // 供 CSS 针对明/暗做差异化处理（阴影强度、图片亮度等）
    root.dataset.themeMode = theme.mode

    // 浏览器 UI（地址栏/滚动条底色）跟随主题
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme.background)
  }, [themeName, theme])

  const setTheme = useCallback((name) => {
    if (themes[name]) setThemeName(name)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme, themes, themeKeys: THEME_KEYS }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
