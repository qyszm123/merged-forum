import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Icon from '../components/Icon.jsx'

function timeAgo(s) {
  if (!s) return ''
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : '+08:00'))
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' 天前'
  return s.slice(0, 10)
}

// 常见职业清单，可多选 + 自定义
const PRESET_ROLES = ['前端', '后端', '全栈', '硬件', '嵌入式', '算法', 'AI/机器学习', '产品', 'UI/设计', '运营', '答辩', '视频剪辑', '文案', '测试']

const FILTERS = [
  ['open', '招募中', 'activity'],
  ['closed', '已结束', 'x-circle'],
  ['all', '全部', 'list']
]

export default function RecruitHallPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('open')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [roles, setRoles] = useState([]) // [{role, count}]
  const [customRole, setCustomRole] = useState('')
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')

  const load = () => {
    setLoading(true)
    setErr('')
    api
      .get(`/api/recruit?status=${status}&pageSize=30`)
      .then((d) => setList(d.list || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [status])

  const addRole = (name) => {
    name = (name || '').trim()
    if (!name) return
    if (roles.some((r) => r.role === name)) return
    setRoles((p) => [...p, { role: name, count: 1 }])
  }
  const removeRole = (name) => setRoles((p) => p.filter((r) => r.role !== name))
  const setRoleCount = (name, cnt) =>
    setRoles((p) => p.map((r) => (r.role === name ? { ...r, count: Math.max(1, Math.min(50, Number(cnt) || 1)) } : r)))

  const totalMembers = roles.reduce((s, r) => s + r.count, 0)

  const submit = async (e) => {
    e.preventDefault()
    setFormErr('')
    if (!title.trim() || !content.trim()) {
      setFormErr('请填写标题和详细说明')
      return
    }
    if (roles.length === 0) {
      setFormErr('请至少选择 1 个职业')
      return
    }
    setBusy(true)
    try {
      const r = await api.post('/api/recruit', {
        title: title.trim(),
        content: content.trim(),
        roles
      })
      setTitle(''); setContent(''); setRoles([]); setCustomRole(''); setShowForm(false)
      navigate(`/recruit/${r.id}`)
    } catch (error) {
      setFormErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  const renderRoles = (r) => {
    const list = Array.isArray(r.roles) ? r.roles : []
    if (list.length === 0) {
      return r.roleWanted ? <span className="recruit-role">{r.roleWanted}</span> : null
    }
    return list.map((x) => (
      <span className="recruit-role" key={x.role}>{x.role} × {x.count}</span>
    ))
  }

  return (
    <div>
      <div className="bounty-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          <Icon name="user-plus" size={18} />
          招募大厅
        </h2>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Icon name={showForm ? 'chevron-up' : 'plus'} size={16} />
          {showForm ? '收起' : '发布招募'}
        </button>
      </div>
      <div className="bounty-sub">组队做项目、打比赛、找队友，就在这里发招募～</div>

      {showForm && (
        <form className="card" onSubmit={submit} style={{ marginTop: 12 }}>
          <label className="field-label">招募标题</label>
          <input className="input" placeholder="如：招募队友参加校赛" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="field-label">详细说明</label>
          <textarea className="textarea" placeholder="项目背景、你要做什么、对队友的期望…" value={content} onChange={(e) => setContent(e.target.value)} />

          <label className="field-label">需要什么职业（可多选，每个设人数）</label>
          <div className="role-pool">
            {PRESET_ROLES.map((name) => {
              const picked = roles.some((r) => r.role === name)
              return (
                <button
                  type="button"
                  key={name}
                  className={'role-chip' + (picked ? ' active' : '')}
                  onClick={() => (picked ? removeRole(name) : addRole(name))}
                >
                  <Icon name={picked ? 'check' : 'plus'} size={12} />
                  {name}
                </button>
              )
            })}
          </div>
          <div className="role-custom">
            <input
              className="input"
              placeholder="自定义职业，回车添加"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRole(customRole); setCustomRole('') } }}
            />
            <button type="button" className="btn-ghost" onClick={() => { addRole(customRole); setCustomRole('') }}>
              <Icon name="plus" size={15} />
              添加
            </button>
          </div>

          {roles.length > 0 && (
            <div className="role-picked">
              {roles.map((r) => (
                <div className="role-picked-item" key={r.role}>
                  <span className="rp-name">{r.role}</span>
                  <label className="rp-count">×
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={r.count}
                      onChange={(e) => setRoleCount(r.role, e.target.value)}
                    />
                  </label>
                  <button type="button" className="fi-remove" onClick={() => removeRole(r.role)} title="移除">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
              <div className="role-total">合计需要 <b>{totalMembers}</b> 人</div>
            </div>
          )}

          {formErr && <div className="error-text">{formErr}</div>}
          <button className="btn-primary" type="submit" disabled={busy}>
            <Icon name="send" size={15} />
            {busy ? '发布中…' : '发布招募'}
          </button>
        </form>
      )}

      <div className="sort-bar" style={{ marginTop: 16 }}>
        {FILTERS.map(([k, l, ic]) => (
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
      {!loading && !err && list.length === 0 && <div className="empty">还没有招募，点“发布招募”开个头吧～</div>}

      {list.map((r) => (
        <div className="card bounty-card" key={r.id} onClick={() => navigate(`/recruit/${r.id}`)}>
          <div className="bounty-card-top">
            <h3 className="post-title" style={{ margin: 0 }}>{r.title}</h3>
            <span className={'recruit-count' + (r.status !== 'open' ? ' done' : '')}>
              <Icon name="users" size={13} />
              {r.acceptedCount}/{r.memberCount}
            </span>
          </div>
          <div className="post-meta">
            <span className="avatar sm">{r.publisher?.avatarChar || '?'}</span>
            <span className="author">{r.publisher?.name || '匿名'}</span>
            {renderRoles(r)}
            <span className={'bounty-status ' + (r.status === 'open' ? 'open' : 'closed')}>
              {r.status === 'open' ? '招募中' : '已结束'}
            </span>
            <span className="comment-time">
              <Icon name="user-plus" size={12} /> {r.appCount} 报名
            </span>
            <span className="comment-time">
              <Icon name="clock" size={12} /> {timeAgo(r.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
