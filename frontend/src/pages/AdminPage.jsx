import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { describeBadgeCondition } from '../utils/format.js'
import { emojiIconName } from '../utils/icons.js'
import Icon from '../components/Icon.jsx'
import JellyToggle from '../components/JellyToggle.jsx'

function timeAgo(s) {
  if (!s) return '-'
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : '+08:00'))
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' 天前'
  return s.slice(0, 10)
}

const STATUS_LABEL = { active: '可用', used: '已使用', disabled: '已作废' }
const ROLE_LABEL = {
  super_admin: '超级管理员',
  admin: '管理员',
  teacher: '教师',
  project_owner: '项目方',
  idea_king: '点子王',
  student: '学生'
}
const REPORT_STATUS = { pending: '待处理', resolved: '已采纳', dismissed: '已驳回' }

const TABS = [
  { k: 'invites', l: '邀请码', icon: 'key' },
  { k: 'posts', l: '帖子管理', icon: 'file-text' },
  { k: 'users', l: '账号管理', icon: 'users' },
  { k: 'reports', l: '举报审核', icon: 'flag' },
  { k: 'badges', l: '勋章管理', icon: 'award' }
]

const INVITE_FILTERS = [
  ['all', '全部', 'list'],
  ['active', '可用', 'check-circle'],
  ['used', '已使用', 'check'],
  ['disabled', '已作废', 'x-circle']
]

const REPORT_FILTERS = [
  ['pending', '待处理', 'clock'],
  ['resolved', '已采纳', 'check-circle'],
  ['dismissed', '已驳回', 'x-circle'],
  ['all', '全部', 'list']
]

export default function AdminPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tab, setTab] = useState('invites')

  useEffect(() => {
    if (user && user.role !== 'super_admin' && user.role !== 'admin') {
      navigate('/', { replace: true })
    }
  }, [user, navigate])

  return (
    <div>
      <h2 className="section-title" style={{ margin: '0 0 16px' }}>
        <Icon name="shield" size={18} />
        管理后台
      </h2>
      <div className="sort-bar" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.k}
            className={'tag' + (tab === t.k ? ' active' : '')}
            style={{ cursor: 'pointer' }}
            onClick={() => setTab(t.k)}
          >
            <Icon name={t.icon} size={13} />
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'invites' && <InvitesTab />}
      {tab === 'posts' && <PostsTab navigate={navigate} />}
      {tab === 'users' && <UsersTab me={user} />}
      {tab === 'reports' && <ReportsTab navigate={navigate} />}
      {tab === 'badges' && <BadgesTab />}
    </div>
  )
}

/* ============ 邀请码 Tab ============ */
function InvitesTab() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('all')
  const [count, setCount] = useState(1)
  const [note, setNote] = useState('')
  const [days, setDays] = useState('')
  const [busy, setBusy] = useState(false)
  const [newCodes, setNewCodes] = useState([])
  const [formErr, setFormErr] = useState('')

  const load = () => {
    setLoading(true); setErr('')
    api.get(`/api/admin/invites?status=${status}&pageSize=100`)
      .then((d) => setList(d.list || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [status])

  const gen = async (e) => {
    e.preventDefault()
    setFormErr('')
    setBusy(true)
    try {
      const body = { count: Number(count) || 1 }
      if (note.trim()) body.note = note.trim()
      if (days) body.expiresInDays = Number(days)
      const r = await api.post('/api/admin/invites', body)
      setNewCodes(r.codes || [])
      setNote(''); setCount(1); setDays('')
      load()
    } catch (error) {
      setFormErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  const disable = async (id) => {
    if (!confirm('确认作废该邀请码？')) return
    try {
      await api.post(`/api/admin/invites/${id}/disable`)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const copy = (code) => {
    navigator.clipboard?.writeText(code).then(() => alert(`已复制：${code}`)).catch(() => {})
  }

  return (
    <div>
      <form className="card" onSubmit={gen}>
        <div className="field-label">生成邀请码</div>
        <div className="admin-row">
          <div style={{ width: 110 }}>
            <input className="input" type="number" min="1" max="50" placeholder="数量" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <input className="input" placeholder="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div style={{ width: 130 }}>
            <input className="input" type="number" min="1" max="365" placeholder="有效天数（空=永久）" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <button className="btn-primary" type="submit" disabled={busy}>
            <Icon name="plus" size={15} />
            {busy ? '生成中…' : '生成'}
          </button>
        </div>
        {formErr && <div className="error-text">{formErr}</div>}
        {newCodes.length > 0 && (
          <div className="new-codes">
            <div className="field-label">新生成的邀请码（点击复制）</div>
            {newCodes.map((c) => (
              <span className="code-pill" key={c.id} onClick={() => copy(c.code)} title="点击复制">
                {c.code}
                <Icon name="copy" size={13} />
              </span>
            ))}
          </div>
        )}
      </form>

      <div className="sort-bar" style={{ marginTop: 16 }}>
        {INVITE_FILTERS.map(([k, l, ic]) => (
          <button
            key={k}
            className={'tag' + (status === k ? ' active' : '')}
            style={{ cursor: 'pointer' }}
            onClick={() => setStatus(k)}
          >
            <Icon name={ic} size={13} />
            {l}
          </button>
        ))}
      </div>

      {loading && <div className="empty">加载中…</div>}
      {err && <div className="empty">加载失败：{err}</div>}
      {!loading && !err && list.length === 0 && <div className="empty">还没有邀请码</div>}

      {list.map((c) => (
        <div className="card admin-row-card" key={c.id}>
          <div className="admin-row-top">
            <span className="code-main">{c.code}</span>
            <span className={'status-badge ' + c.status}>{STATUS_LABEL[c.status] || c.status}</span>
          </div>
          <div className="post-meta">
            {c.note && <span>备注：{c.note}</span>}
            <span>创建者：{c.creator?.name || '-'}</span>
            {c.usedBy && <span>使用者：{c.usedBy.name}</span>}
            <span>· {timeAgo(c.createdAt)}</span>
            {c.expiresAt && <span>· 过期 {c.expiresAt.slice(0, 10)}</span>}
          </div>
          <div className="admin-row-actions">
            <button className="btn-ghost" onClick={() => copy(c.code)}>
              <Icon name="copy" size={14} />
              复制
            </button>
            {c.status === 'active' && (
              <button className="btn-ghost danger" onClick={() => disable(c.id)}>
                <Icon name="x-circle" size={14} />
                作废
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ============ 帖子管理 Tab ============ */
function PostsTab({ navigate }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  const load = (keyword = q) => {
    setLoading(true); setErr('')
    const url = `/api/admin/posts?pageSize=100` + (keyword ? `&q=${encodeURIComponent(keyword)}` : '')
    api.get(url)
      .then((d) => setList(d.list || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => load(''), [])

  const del = async (id, title) => {
    if (!confirm(`确认删除帖子「${title}」？\n该操作不可恢复，将一并删除其评论与点赞。`)) return
    try {
      await api.delete(`/api/admin/posts/${id}`)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div>
      <form className="search-inline" onSubmit={(e) => { e.preventDefault(); load() }} style={{ marginBottom: 14 }}>
        <input className="input" placeholder="搜索标题或作者…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 0 }} />
        <button className="btn-primary" type="submit">
          <Icon name="search" size={15} />
          搜索
        </button>
      </form>

      {loading && <div className="empty">加载中…</div>}
      {err && <div className="empty">加载失败：{err}</div>}
      {!loading && !err && list.length === 0 && <div className="empty">没有匹配的帖子</div>}

      {list.map((p) => (
        <div className="card admin-row-card" key={p.id}>
          <div className="admin-row-top">
            <h3 className="post-title" style={{ margin: 0, flex: 1 }} onClick={() => navigate(`/post/${p.id}`)}>{p.title}</h3>
            <button className="btn-ghost danger" onClick={() => del(p.id, p.title)}>
              <Icon name="trash-2" size={14} />
              删除
            </button>
          </div>
          <div className="post-meta">
            <span className="avatar sm">{p.author?.avatarChar || '?'}</span>
            <span className="author">{p.author?.name || '匿名'}</span>
            {p.board && <span className="board-pill">{p.board.name}</span>}
            <span className="comment-time">
              <Icon name="eye" size={12} /> {p.viewCount}
            </span>
            <span className="comment-time">
              <Icon name="message-circle" size={12} /> {p.commentCount}
            </span>
            <span className="comment-time">
              <Icon name="thumbs-up" size={12} /> {p.likeCount}
            </span>
            <span className="comment-time">
              <Icon name="clock" size={12} /> {timeAgo(p.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ============ 账号管理 Tab ============ */
const ASSIGNABLE_ROLES = ['admin', 'teacher', 'project_owner', 'idea_king', 'student']

function UsersTab({ me }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  // 角色修改：{ [userId]: role } 待提交的选中值
  const [roleDraft, setRoleDraft] = useState({})
  const [busyId, setBusyId] = useState(null)
  const isSuper = me?.role === 'super_admin'

  const load = (keyword = q) => {
    setLoading(true); setErr('')
    const url = `/api/admin/users?pageSize=100` + (keyword ? `&q=${encodeURIComponent(keyword)}` : '')
    api.get(url)
      .then((d) => setList(d.list || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => load(''), [])

  const applyRole = async (u) => {
    const role = roleDraft[u.id]
    if (!role || role === u.role) return
    if (!confirm(`将「${u.displayName}（${u.studentNo}）」设为${ROLE_LABEL[role]}？`)) return
    setBusyId(u.id)
    try {
      await api.post(`/api/admin/users/${u.id}/role`, { role })
      setRoleDraft((d) => { const n = { ...d }; delete n[u.id]; return n })
      load()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <form className="search-inline" onSubmit={(e) => { e.preventDefault(); load() }} style={{ marginBottom: 14 }}>
        <input className="input" placeholder="搜索学号或昵称…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 0 }} />
        <button className="btn-primary" type="submit">
          <Icon name="search" size={15} />
          搜索
        </button>
      </form>

      {loading && <div className="empty">加载中…</div>}
      {err && <div className="empty">加载失败：{err}</div>}
      {!loading && !err && list.length === 0 && <div className="empty">没有用户</div>}

      {list.map((u) => (
        <div className="card admin-row-card" key={u.id}>
          <div className="admin-row-top">
            <span className="avatar sm">{u.avatarChar || '?'}</span>
            <strong style={{ flex: 1 }}>{u.displayName}</strong>
            <span className={'role-badge ' + u.role}>{ROLE_LABEL[u.role] || u.role}</span>
            {u.role === 'super_admin' && <span className="status-badge active">超级</span>}
          </div>
          <div className="post-meta">
            <span>学号：{u.studentNo}</span>
            <span>· {u.rankLabel || '-'}</span>
            <span>· 积分 {u.points}</span>
            <span>· 发帖 {u.postCount}</span>
            {u.className && <span>· {u.className}</span>}
            {u.grade && <span>· {u.grade}</span>}
            <span>· 注册 {timeAgo(u.createdAt)}</span>
          </div>
          {isSuper && u.role !== 'super_admin' && (
            <div className="role-assign">
              <label>设为</label>
              <select
                className="input"
                value={roleDraft[u.id] || u.role}
                onChange={(e) => setRoleDraft((d) => ({ ...d, [u.id]: e.target.value }))}
                disabled={busyId === u.id}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
              <button
                className="btn-primary"
                disabled={busyId === u.id || !roleDraft[u.id] || roleDraft[u.id] === u.role}
                onClick={() => applyRole(u)}
              >
                <Icon name="check" size={14} />
                {busyId === u.id ? '保存中…' : '应用'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ============ 举报审核 Tab ============ */
function ReportsTab({ navigate }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('pending')
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState({})

  const load = () => {
    setLoading(true); setErr('')
    api.get(`/api/admin/reports?status=${status}&pageSize=100`)
      .then((d) => setList(d.list || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [status])

  const resolve = async (id, action, deletePost = false, targetLabel = '帖子') => {
    const note = notes[id] || ''
    if (!confirm(action === 'resolved' ? (deletePost ? `采纳该举报并删除${targetLabel}？` : '采纳该举报？') : '驳回该举报？')) return
    setBusy((b) => ({ ...b, [id]: true }))
    try {
      await api.post(`/api/admin/reports/${id}/resolve`, { action, note, deletePost })
      load()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy((b) => ({ ...b, [id]: false }))
    }
  }

  return (
    <div>
      <div className="sort-bar" style={{ marginBottom: 14 }}>
        {REPORT_FILTERS.map(([k, l, ic]) => (
          <button
            key={k}
            className={'tag' + (status === k ? ' active' : '')}
            style={{ cursor: 'pointer' }}
            onClick={() => setStatus(k)}
          >
            <Icon name={ic} size={13} />
            {l}
          </button>
        ))}
      </div>

      {loading && <div className="empty">加载中…</div>}
      {err && <div className="empty">加载失败：{err}</div>}
      {!loading && !err && list.length === 0 && <div className="empty">没有举报记录</div>}

      {list.map((r) => (
        <div className="card admin-row-card" key={r.id}>
          <div className="admin-row-top">
            <span className={'status-badge ' + r.status}>{REPORT_STATUS[r.status] || r.status}</span>
            <span className="role-badge" style={{ flexShrink: 0 }}>
              <Icon name={r.type === 'comment' ? 'message-circle' : 'file-text'} size={12} />
              {r.type === 'comment' ? '评论' : '帖子'}
            </span>
            {r.post ? (
              <h3 className="post-title" style={{ margin: 0, flex: 1 }} onClick={() => navigate(`/post/${r.post.id}`)}>{r.post.title}</h3>
            ) : (
              <span style={{ flex: 1, color: 'var(--theme-text-secondary)' }}>（帖子已删除）</span>
            )}
          </div>
          {r.comment && (
            <div className="report-reason" style={{ marginTop: 0, marginBottom: 8 }}>
              被举报评论（{r.comment.author?.name || '匿名'}）：{r.comment.content}
            </div>
          )}
          <div className="post-meta">
            <span>作者：{(r.comment ? r.comment.author?.name : r.postAuthor?.name) || '-'}</span>
            <span>· 举报人：{r.reporter?.name || '-'}</span>
            <span>· {timeAgo(r.createdAt)}</span>
          </div>
          <div className="report-reason">举报原因：{r.reason}</div>
          {r.status !== 'pending' && r.handlerNote && (
            <div className="post-meta" style={{ marginTop: 6 }}>处理备注：{r.handlerNote} · 处理人 {r.handler?.name}</div>
          )}

          {r.status === 'pending' && (
            <div className="report-actions">
              <input
                className="input"
                style={{ flex: 1, marginBottom: 0 }}
                placeholder="处理备注（可选）"
                value={notes[r.id] || ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              />
              <button
                className="btn-ghost danger"
                disabled={busy[r.id]}
                onClick={() => resolve(r.id, 'resolved', true, r.type === 'comment' ? '评论' : '帖子')}
              >
                <Icon name="trash-2" size={14} />
                {r.type === 'comment' ? '采纳并删评论' : '采纳并删帖'}
              </button>
              <button className="btn-ghost" disabled={busy[r.id]} onClick={() => resolve(r.id, 'resolved')}>
                <Icon name="check" size={14} />
                采纳
              </button>
              <button className="btn-ghost" disabled={busy[r.id]} onClick={() => resolve(r.id, 'dismissed')}>
                <Icon name="x" size={14} />
                驳回
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ============ 勋章管理 Tab ============ */
const CONDITION_OPTIONS = [
  ['post_count', '发帖数'],
  ['comment_count', '评论数'],
  ['like_received_count', '获赞数'],
  ['sign_in_days', '连续签到天数'],
  ['register_days', '注册天数'],
  ['bounty_completed', '完成悬赏次数']
]

const EMPTY_FORM = { name: '', description: '', icon: '🏅', conditionType: 'post_count', conditionValue: 1, isActive: true }

function BadgesTab() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')

  // 授予/撤销
  const [studentNo, setStudentNo] = useState('')
  const [targetUser, setTargetUser] = useState(null)
  const [userBadges, setUserBadges] = useState([])

  const load = () => {
    setLoading(true); setErr('')
    api.get('/api/admin/badges')
      .then((d) => setList(d.list || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const create = async (e) => {
    e.preventDefault()
    setBusy(true); setFormErr('')
    try {
      await api.post('/api/admin/badges', { ...form, conditionValue: Number(form.conditionValue) })
      setForm(EMPTY_FORM)
      load()
    } catch (error) {
      setFormErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  const del = async (b) => {
    if (!confirm(`删除勋章「${b.name}」？\n将一并撤销所有用户持有的该勋章。`)) return
    try {
      await api.delete(`/api/admin/badges/${b.id}`)
      load()
      if (targetUser) refreshUserBadges(targetUser.id)
    } catch (e) {
      alert(e.message)
    }
  }

  const toggleActive = async (b) => {
    try {
      await api.put(`/api/admin/badges/${b.id}`, {
        name: b.name,
        description: b.description,
        icon: b.icon,
        conditionType: b.conditionType,
        conditionValue: b.conditionValue,
        isActive: !b.isActive
      })
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const refreshUserBadges = async (uid) => {
    const d = await api.get(`/api/admin/users/${uid}/badges`)
    setUserBadges(d.list || [])
  }

  const findUser = async () => {
    const kw = studentNo.trim()
    if (!kw) return
    try {
      const d = await api.get(`/api/admin/users?q=${encodeURIComponent(kw)}&pageSize=10`)
      const u = (d.list || []).find((x) => x.studentNo === kw)
      if (!u) { alert('未找到该学号'); return }
      setTargetUser(u)
      await refreshUserBadges(u.id)
    } catch (e) {
      alert(e.message)
    }
  }

  const grant = async (badgeId) => {
    try {
      await api.post(`/api/admin/users/${targetUser.id}/badges/${badgeId}`)
      await refreshUserBadges(targetUser.id)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const revoke = async (badgeId) => {
    try {
      await api.delete(`/api/admin/users/${targetUser.id}/badges/${badgeId}`)
      await refreshUserBadges(targetUser.id)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const ownedIds = new Set(userBadges.map((b) => b.id))

  return (
    <div>
      <form className="card" onSubmit={create}>
        <div className="field-label">创建勋章</div>
        <div className="admin-row" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 90 }} placeholder="图标" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
          <input className="input" style={{ flex: '1 1 140px' }} placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" style={{ flex: '1 1 180px' }} placeholder="描述（可选）" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <select className="input" style={{ width: 140 }} value={form.conditionType} onChange={(e) => setForm({ ...form, conditionType: e.target.value })}>
            {CONDITION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input className="input" style={{ width: 90 }} type="number" min="1" placeholder="阈值" value={form.conditionValue} onChange={(e) => setForm({ ...form, conditionValue: e.target.value })} required />
          <button className="btn-primary" type="submit" disabled={busy}>
            <Icon name="plus" size={15} />
            {busy ? '创建中…' : '创建'}
          </button>
        </div>
        {formErr && <div className="error-text">{formErr}</div>}
      </form>

      {loading && <div className="empty">加载中…</div>}
      {err && <div className="empty">加载失败：{err}</div>}

      {list.map((b) => (
        <div className="card admin-row-card" key={b.id}>
          <div className="admin-row-top">
            <span className="badge-icon">
              {emojiIconName(b.icon) ? <Icon name={emojiIconName(b.icon)} size={20} /> : b.icon}
            </span>
            <strong style={{ flex: 1 }}>{b.name}</strong>
            <span className="admin-toggle">
              <JellyToggle
                checked={b.isActive}
                onChange={() => toggleActive(b)}
                label={`${b.name} 启用开关`}
                title={b.isActive ? '点击停用' : '点击启用'}
              />
              <span>{b.isActive ? '启用中' : '已停用'}</span>
            </span>
            <span className="badge-cond" style={{ fontSize: 12 }}>{describeBadgeCondition(b.conditionType, b.conditionValue)}</span>
          </div>
          <div className="post-meta">
            <span>{b.description || '（无描述）'}</span>
            <span>· {b.holderCount} 人持有</span>
          </div>
          <div className="admin-row-actions">
            <button className="btn-ghost danger" onClick={() => del(b)}>
              <Icon name="trash-2" size={14} />
              删除
            </button>
          </div>
        </div>
      ))}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="field-label">授予 / 撤销勋章</div>
        <div className="admin-row">
          <input className="input" style={{ flex: 1 }} placeholder="输入学号查找用户" value={studentNo} onChange={(e) => setStudentNo(e.target.value)} />
          <button className="btn-primary" onClick={findUser}>
            <Icon name="search" size={15} />
            查找
          </button>
        </div>
        {targetUser && (
          <>
            <div className="post-meta" style={{ marginTop: 10 }}>
              <span className="avatar sm">{targetUser.avatarChar || '?'}</span>
              <span className="author">{targetUser.displayName}（{targetUser.studentNo}）</span>
              <span>· 已持有 {userBadges.length} 枚</span>
            </div>
            <div className="admin-badge-grant">
              {list.map((b) => {
                const owned = ownedIds.has(b.id)
                return (
                  <div key={b.id} className={'admin-badge-item' + (owned ? ' owned' : '')}>
                    <span className="badge-icon">
                      {emojiIconName(b.icon) ? <Icon name={emojiIconName(b.icon)} size={15} /> : b.icon}
                    </span>
                    <span className="badge-name">{b.name}</span>
                    {owned ? (
                      <button className="btn-ghost danger" onClick={() => revoke(b.id)}>
                        <Icon name="x" size={13} />
                        撤销
                      </button>
                    ) : (
                      <button className="btn-ghost" onClick={() => grant(b.id)}>
                        <Icon name="plus" size={13} />
                        授予
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
