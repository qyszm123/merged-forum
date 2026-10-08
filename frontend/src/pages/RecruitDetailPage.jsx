import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'

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

const APP_STATUS = { pending: '待处理', accepted: '已录取', rejected: '已拒绝' }

export default function RecruitDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [r, setR] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [intro, setIntro] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    setErr('')
    api
      .get(`/api/recruit/${id}`)
      .then(setR)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [id])

  const canApply = r && user && !r.isPublisher && r.status === 'open' && !r.myApplication && r.acceptedCount < r.memberCount

  const apply = async (e) => {
    e.preventDefault()
    if (!intro.trim()) return
    setBusy(true)
    try {
      await api.post(`/api/recruit/${id}/apply`, { intro: intro.trim() })
      setIntro('')
      load()
    } catch (error) {
      alert(error.message)
    } finally {
      setBusy(false)
    }
  }

  const act = async (path, applicationId, msg) => {
    if (!confirm(msg)) return
    try {
      await api.post(`/api/recruit/${id}/${path}`, { applicationId })
      load()
    } catch (error) {
      alert(error.message)
    }
  }

  if (loading) return <div className="empty">加载中…</div>
  if (err) return <div className="empty">加载失败：{err}</div>
  if (!r) return null

  return (
    <div>
      <button className="btn-ghost" onClick={() => navigate('/recruit')} style={{ marginBottom: 12 }}>← 返回大厅</button>

      <div className="card">
        <div className="post-meta">
          <span className="avatar sm">{r.publisher?.avatarChar || '?'}</span>
          <span className="author">{r.publisher?.name || '匿名'}</span>
          <span className={'bounty-status ' + (r.status === 'open' ? 'open' : 'closed')}>
            {r.status === 'open' ? '招募中' : '已结束'}
          </span>
          <span>· {timeAgo(r.createdAt)}</span>
        </div>
        <h1 className="detail-title" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {r.title}
          <span className={'recruit-count' + (r.status !== 'open' ? ' done' : '')}>👥 {r.acceptedCount}/{r.memberCount}</span>
        </h1>
        {r.roleWanted && (
          <div style={{ marginBottom: 10 }}>
            <span className="recruit-role">招募角色：{r.roleWanted}</span>
          </div>
        )}
        {Array.isArray(r.roles) && r.roles.length > 0 && (
          <div className="role-detail-block">
            <div className="field-label">职业需求</div>
            <div className="role-pool">
              {r.roles.map((x) => (
                <span className="recruit-role" key={x.role}>{x.role} × {x.count}</span>
              ))}
            </div>
          </div>
        )}
        <div className="detail-content">{r.content}</div>
        <div className="post-actions" style={{ marginTop: 16 }}>
          <span className="act">🙋 {r.appCount} 报名</span>
          <span className="act">👁️ {r.viewCount}</span>
        </div>
        {r.isPublisher && r.status === 'open' && (
          <div style={{ marginTop: 14 }}>
            <button className="btn-ghost" onClick={() => act('close', null, '确认关闭招募？')}>关闭招募</button>
          </div>
        )}
      </div>

      {canApply && (
        <form className="card" onSubmit={apply} style={{ padding: 16 }}>
          <div className="field-label">报名（附自我介绍，让对方了解你）</div>
          <textarea className="textarea" style={{ marginBottom: 12 }} placeholder="介绍你的技能、经历，以及为什么想加入…" value={intro} onChange={(e) => setIntro(e.target.value)} />
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? '提交中…' : '提交报名'}</button>
        </form>
      )}
      {!user && <div className="empty">登录后可报名</div>}
      {user && r.myApplication && (
        <div className="empty">
          我已报名 · 状态：<b>{APP_STATUS[r.myApplication.status] || r.myApplication.status}</b>
        </div>
      )}
      {user && !r.isPublisher && r.status !== 'open' && !r.myApplication && <div className="empty">该招募已结束</div>}
      {user && !r.isPublisher && r.status === 'open' && !r.myApplication && r.acceptedCount >= r.memberCount && (
        <div className="empty">名额已满</div>
      )}

      {r.isPublisher && (
        <>
          <h3 className="section-title">报名列表 {r.applications?.length || 0}</h3>
          {(!r.applications || r.applications.length === 0) && <div className="empty">还没有人报名</div>}
          {r.applications?.map((a) => (
            <div className="card" key={a.id}>
              <div className="post-meta">
                <span className="avatar sm">{a.applicant?.avatarChar || '?'}</span>
                <span className="author">{a.applicant?.name || '匿名'}</span>
                <span className={'bounty-status ' + (a.status === 'accepted' ? 'adopted' : a.status === 'rejected' ? 'closed' : 'open')}>
                  {APP_STATUS[a.status] || a.status}
                </span>
                <span>· {timeAgo(a.createdAt)}</span>
              </div>
              <div className="detail-content" style={{ fontSize: 14 }}>{a.intro}</div>
              {r.status === 'open' && a.status === 'pending' && (
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button className="btn-primary" onClick={() => act('accept', a.id, `确认录取 ${a.applicant?.name}？`)}>录取</button>
                  <button className="btn-ghost" onClick={() => act('reject', a.id, `确认拒绝 ${a.applicant?.name}？`)}>拒绝</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
