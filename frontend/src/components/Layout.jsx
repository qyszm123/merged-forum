import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../theme.jsx'
import Icon from './Icon.jsx'
import RightSidebar from './RightSidebar.jsx'

const NAV = [
  { to: '/', label: '首页', icon: 'home', end: true },
  { to: '/board/all', label: '板块', icon: 'grid' },
  { to: '/bounty', label: '悬赏大厅', icon: 'gift' },
  { to: '/recruit', label: '招募大厅', icon: 'user-plus' },
  { to: '/careers', label: '职业学习', icon: 'book-open' },
  { to: '/badges', label: '勋章', icon: 'award' },
  { to: '/profile', label: '我的', icon: 'user' }
]

/** 点击浮层外部 / 按 Esc 时关闭 */
function useDismiss(open, close) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme, themeName, setTheme, themes, themeKeys } = useTheme()
  const navigate = useNavigate()

  const [menuOpen, setMenuOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [q, setQ] = useState('')

  const closeMenu = () => setMenuOpen(false)
  const closeTheme = () => setThemeOpen(false)
  const menuRef = useDismiss(menuOpen, closeMenu)
  const themeRef = useDismiss(themeOpen, closeTheme)

  const onSearch = (e) => {
    e.preventDefault()
    const query = q.trim()
    navigate(query ? `/?q=${encodeURIComponent(query)}` : '/')
  }

  const goProfile = () => {
    closeMenu()
    navigate(user ? `/profile/${user.id}` : '/profile')
  }

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin'

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" onClick={() => navigate('/')} title="奇遇广场">
            <span className="logo">
              <Icon name="compass" size={18} />
            </span>
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
                <span className="ic">
                  <Icon name={n.icon} size={16} />
                </span>
                {n.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                <span className="ic">
                  <Icon name="shield" size={16} />
                </span>
                管理后台
              </NavLink>
            )}
          </nav>

          <div className="topbar-actions">
            <form className="search" onSubmit={onSearch}>
              <Icon name="search" size={15} />
              <input
                placeholder="搜索帖子、话题…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="搜索"
              />
            </form>

            <button className="btn-primary" onClick={() => navigate('/create')}>
              <Icon name="edit-3" size={15} />
              发帖
            </button>

            {/* 主题切换 */}
            <div style={{ position: 'relative' }} ref={themeRef}>
              <button
                className="icon-btn"
                onClick={() => {
                  setThemeOpen((v) => !v)
                  setMenuOpen(false)
                }}
                title={`当前主题：${theme.name}`}
                aria-label="切换主题"
              >
                <Icon name={theme.icon} size={16} />
              </button>
              {themeOpen && (
                <div className="menu-pop">
                  {themeKeys.map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTheme(key)
                        closeTheme()
                      }}
                    >
                      <span className="theme-dot" style={{ background: themes[key].gradient }} />
                      {themes[key].name}
                      {key === themeName && <Icon name="check" size={15} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 用户菜单 */}
            <div style={{ position: 'relative' }} ref={menuRef}>
              <button
                className="avatar topbar-avatar"
                onClick={() => {
                  setMenuOpen((v) => !v)
                  setThemeOpen(false)
                }}
                aria-label="账号菜单"
              >
                {user?.avatarChar || '奇'}
              </button>
              {menuOpen && (
                <div className="menu-pop">
                  <button onClick={goProfile}>
                    <Icon name="user" size={15} />
                    我的主页
                  </button>
                  <button
                    onClick={() => {
                      logout()
                      navigate('/login')
                    }}
                  >
                    <Icon name="log-out" size={15} />
                    退出登录
                  </button>
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
