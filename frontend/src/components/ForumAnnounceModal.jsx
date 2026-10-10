import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { timeAgo } from '../utils/format.js'
import Icon from './Icon.jsx'

// 角色 → 身份标签文案/色阶
const ROLE_TAG = {
  admin: { label: '管理员', cls: 'role-admin' },
  teacher: { label: '版主', cls: 'role-teacher' },
  super_admin: { label: '站长', cls: 'role-admin' }
}

// 统计卡片配置（图标 + 标题）
const STAT_CARDS = [
  { key: 'postCount', label: '帖子总数', icon: 'file-text' },
  { key: 'memberCount', label: '会员总数', icon: 'users' },
  { key: 'todayCount', label: '今日发帖', icon: 'edit-3' },
  { key: 'onlineCount', label: '在线人数', icon: 'activity' }
]

export default function ForumAnnounceModal({ open, onClose }) {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [toast, setToast] = useState('')

  // 拉取概览：统计 + 版主 + 公告 + 签到状态
  const load = useCallback(() => {
    setLoading(true)
    api
      .get('/api/forum/overview')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (open) {
      load()
      setToast('')
    }
  }, [open, load])

  // 签到逻辑
  const handleCheckin = async () => {
    if (!user) {
      navigate('/login')
      onClose()
      return
    }
    if (checking) return
    setChecking(true)
    setToast('')
    try {
      const d = await api.post('/api/forum/checkin')
      setToast(`签到成功，给予 ${d.reward} 积分奖励`)
      setData((prev) =>
        prev
          ? {
              ...prev,
              checkin: { totalDays: d.totalDays, checkedToday: true }
            }
          : prev
      )
    } catch (e) {
      setToast(e.message || '签到失败')
    } finally {
      setChecking(false)
    }
  }

  if (!open) return null

  const stats = data?.stats || null
  const staff = data?.staff || []
  const notices = data?.notices || []
  const checkin = data?.checkin || null
  const checkedToday = !!checkin?.checkedToday

  return (
    <div className="fam-overlay" onClick={onClose}>
      <div className="fam-modal" onClick={(e) => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <button className="fam-close" onClick={onClose} aria-label="关闭" title="关闭">
          <Icon name="x" size={16} />
        </button>

        {/* 1. 顶部：用户信息 + 签到状态 */}
        <header className="fam-header">
          <span className="fam-avatar">{user?.avatarChar || user?.displayName?.slice(0, 1) || '奇'}</span>
          <div className="fam-user">
            <div className="fam-name">
              {user?.displayName || '同学'}
              <span className="fam-rank">{user?.rankLabel || '外门弟子'}</span>
            </div>
            <div className="fam-sub">
              {checkedToday
                ? `已签到 ${checkin?.totalDays ?? 0} 天`
                : checkin
                  ? `连续签到 ${checkin.totalDays} 天`
                  : '登录后即可每日签到'}
            </div>
          </div>
          <button
            className={'fam-checkin' + (checkedToday ? ' done' : '')}
            onClick={handleCheckin}
            disabled={checkedToday || checking}
          >
            {checkedToday ? (
              <>
                <Icon name="check" size={15} />
                已签到
              </>
            ) : checking ? (
              '签到中…'
            ) : (
              '签到'
            )}
          </button>
        </header>

        {toast && <div className="fam-toast">{toast}</div>}

        {/* 2. 统计卡片 */}
        <div className="fam-stats">
          {STAT_CARDS.map((c) => (
            <div key={c.key} className="fam-stat">
              <span className="fam-stat-ic">
                <Icon name={c.icon} size={18} />
              </span>
              <div className="fam-stat-num">{stats ? (stats[c.key] ?? 0) : '—'}</div>
              <div className="fam-stat-label">{c.label}</div>
            </div>
          ))}
        </div>

        {/* 3. 版主 / 管理员列表 */}
        {staff.length > 0 && (
          <section className="fam-section">
            <h3 className="fam-sec-title">
              <Icon name="shield" size={15} />
              版主 / 管理员
            </h3>
            <div className="fam-staff">
              {staff.map((s) => {
                const tag = ROLE_TAG[s.role] || { label: '成员', cls: '' }
                return (
                  <div key={s.id} className="fam-staff-item">
                    <span className="fam-staff-avatar">{s.avatarChar || s.name?.slice(0, 1) || '?'}</span>
                    <span className="fam-staff-name">{s.name}</span>
                    <span className={'fam-badge ' + tag.cls}>{tag.label}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 4. 置顶公告列表 */}
        {notices.length > 0 && (
          <section className="fam-section">
            <h3 className="fam-sec-title">
              <Icon name="map-pin" size={15} />
              置顶公告
            </h3>
            <ul className="fam-notices">
              {notices.map((n) => (
                <li key={n.id} className="fam-notice" onClick={() => { navigate(`/post/${n.id}`); onClose() }}>
                  <div className="fam-notice-title">{n.title}</div>
                  <div className="fam-notice-meta">
                    <span className="fam-notice-board">{n.board?.title || '公告'}</span>
                    <span>
                      <Icon name="message-circle" size={12} />
                      {n.commentCount ?? 0}
                    </span>
                    <span>
                      <Icon name="clock" size={12} />
                      {timeAgo(n.lastReplyAt)}
                    </span>
                    {n.lastReplyBy && <span>最后回复：{n.lastReplyBy}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loading && <div className="fam-loading">加载中…</div>}
      </div>
    </div>
  )
}
