import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../api.js'
import { isOnline } from '../utils/format.js'

const MODULES = [
  { name: 'projects', label: '项目广场', icon: '🚀', desc: '科创项目招募与展示' },
  { name: 'ideas', label: '点子集市', icon: '💡', desc: '积分委托与创意交付' },
  { name: 'points', label: '积分中心', icon: '⭐', desc: '校园积分沙箱与流水' },
  { name: 'train', label: '修炼之路', icon: '🎓', desc: '闯关刷题与判定' },
  { name: 'makers', label: '人才广场', icon: '👥', desc: '创造者人才墙' },
  { name: 'events', label: '活动报名', icon: '📅', desc: '黑客松与特殊通道' }
]

// 标签云字号（按热度错落，破坏对称）
const CLOUD_SIZES = ['lg', 'md', 'sm', 'md', 'sm', 'lg', 'sm', 'md']

function HomeSidebar({ boards, makers, notices, onBoard }) {
  const navigate = useNavigate()
  return (
    <>
      {boards.length > 0 && (
        <div className="panel hp-panel">
          <div className="panel-head">
            <h3>热门话题</h3>
            <button className="panel-more" onClick={() => onBoard('all')}>全部</button>
          </div>
          <div className="tag-cloud">
            {boards.slice(0, 8).map((b, i) => (
              <button
                key={b.slug}
                className={'cloud-tag ' + (CLOUD_SIZES[i % CLOUD_SIZES.length] || 'md')}
                onClick={() => onBoard(b.slug)}
              >
                {b.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {makers.length > 0 && (
        <div className="panel hp-panel">
          <div className="panel-head">
            <h3>活跃创造者</h3>
            <button className="panel-more" onClick={() => navigate('/m/makers')}>更多</button>
          </div>
          <div className="active-users">
            {makers.slice(0, 5).map((m) => {
              const online = isOnline(m.id)
              return (
                <div key={m.id} className="active-user" onClick={() => navigate(`/m/makers`)}>
                  <span
                    className={'avatar sm' + (online ? ' is-online' : ' is-offline')}
                    title={online ? `${m.displayName} · 在线` : `${m.displayName} · 离线`}
                  >
                    {m.avatarChar || m.displayName?.slice(0, 1) || '?'}
                  </span>
                  <span className="active-user-name">{m.displayName}</span>
                  <span className="active-user-id">{m.identities?.[0] || m.rankLabel || '创造者'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {notices.length > 0 && (
        <div className="panel hp-panel">
          <div className="panel-head">
            <h3>社区公告</h3>
          </div>
          <ul className="notice-list">
            {notices.slice(0, 4).map((n) => (
              <li key={n.id} onClick={() => navigate(`/post/${n.id}`)}>
                <span className="notice-dot">📌</span>
                <span className="notice-text">{n.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

export default function RightSidebar({ onBoard }) {
  const [boards, setBoards] = useState([])
  const [makers, setMakers] = useState([])
  const [notices, setNotices] = useState([])
  const navigate = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/'

  useEffect(() => {
    api.get('/api/forum/boards').then(setBoards).catch(() => setBoards([]))
  }, [])

  useEffect(() => {
    if (!isHome) return
    api
      .get('/api/makers?pageSize=8')
      .then((d) => setMakers(d.list || []))
      .catch(() => setMakers([]))
    api
      .get('/api/forum/posts?sort=new&pageSize=30')
      .then((d) => setNotices((d.list || []).filter((p) => p.isPinned)))
      .catch(() => setNotices([]))
  }, [isHome])

  if (isHome) {
    return (
      <aside className="right-sidebar home-sidebar">
        <HomeSidebar boards={boards} makers={makers} notices={notices} onBoard={onBoard} />
      </aside>
    )
  }

  return (
    <aside className="right-sidebar">
      <div className="panel">
        <h3>板块</h3>
        <span className="tag" onClick={() => onBoard('all')}>全部</span>
        {boards.map((b) => (
          <span key={b.slug} className="tag" onClick={() => onBoard(b.slug)}>
            {b.title}
          </span>
        ))}
      </div>

      <div className="panel">
        <div className="mod-link" onClick={() => navigate('/careers')}>
          <span style={{ fontSize: 18 }}>🎓</span>
          <div>
            <div>职业学习</div>
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', fontWeight: 400 }}>
              学习路径、技能点与结业考试
            </div>
          </div>
        </div>
        {MODULES.map((m) => (
          <div key={m.name} className="mod-link" onClick={() => navigate(`/m/${m.name}`)}>
            <span style={{ fontSize: 18 }}>{m.icon}</span>
            <div>
              <div>{m.label}</div>
              <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', fontWeight: 400 }}>
                {m.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>关于融合</h3>
        <p style={{ fontSize: 13, color: 'var(--theme-text-secondary)', lineHeight: 1.6, margin: 0 }}>
          视觉沿用 <b>qyszm 奇遇社交论坛</b> 的靛紫主题与三栏布局；工程架构采用{' '}
          <b>kcsquare 科创广场</b> 的 Vite + Express/MySQL 分层后端，并集成了两个论坛的全部模块。
        </p>
      </div>
    </aside>
  )
}
