import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../theme.jsx'
import api from '../api.js'
import RightSidebar from './RightSidebar.jsx'

const NAV = [
  { to: '/', label: '首页', icon: '🏠', end: true },
  { to: '/board/all', label: '板块', icon: '📋' },
  { to: '/bounty', label: '悬赏大厅', icon: '💰' },
  { to: '/recruit', label: '招募大厅', icon: '📣' },
  { to: '/careers', label: '职业学习', icon: '🎓' },
  { to: '/badges', label: '勋章', icon: '🏅' },
  { to: '/profile', label: '我的', icon: '👤' }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme, themeName, setTheme, themes } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [q, setQ] = useState('')

  const onSearch = (e) => {
    e.preventDefault()
    const query = q.trim()
    navigate(query ? `/?q=${encodeURIComponent(query)}` : '/')
  }

  const goProfile = () => {
    setMenuOpen(false)
    navigate(user ? `/profile/${user.id}` : '/profile')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" onClick={() => navigate('/')}>
            <span className="logo">奇</span>
            <span className="name">奇遇广场</span>
          </div>

          <nav className="top-nav">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
              >
                <span className="ic">{n.icon}</span>
                {n.label}
              </NavLink>
            ))}
            {(user?.role === 'super_admin' || user?.role === 'admin') && (
              <NavLink to="/admin" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                <span className="ic">🛡️</span>管理后台
              </NavLink>
            )}
          </nav>

          <div className="topbar-actions">
            <form className="search" onSubmit={onSearch}>
              <span>🔍</span>
              <input
                placeholder="搜索帖子、话题…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </form>
            <button className="btn-primary" onClick={() => navigate('/create')}>✏️ 发帖</button>
            <div style={{ position: 'relative' }}>
              <button className="icon-btn" onClick={() => setThemeOpen((v) => !v)} title="切换主题">
                {theme.icon}
              </button>
              {themeOpen && (
                <div className="menu-pop" style={{ minWidth: 160, right: 0, top: '48px' }}>
                  {Object.entries(themes).map(([key, t]) => (
                    <button
                      key={key}
                      onClick={() => { setTheme(key); setThemeOpen(false) }}
                      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                    >
                      <span>{t.icon}</span> {t.name}
                      {key === themeName && <span style={{ marginLeft: 'auto' }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button className="avatar topbar-avatar" onClick={() => setMenuOpen((v) => !v)}>
                {user?.avatarChar || '奇'}
              </button>
              {menuOpen && (
                <div className="menu-pop" style={{ right: 0, top: '48px' }}>
                  <button onClick={goProfile}>👤 我的主页</button>
                  <button onClick={() => { logout(); navigate('/login') }}>🚪 退出登录</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="content-shell">
        <main className="main">
          <Outlet />
        </main>
        <RightSidebar onBoard={(slug) => navigate(`/board/${slug}`)} />
      </div>
    </div>
  )
}
