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

const STATUS = { open: '进行中', adopted: '已采纳', closed: '已关闭' }

export default function BountyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [b, setB] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    setErr('')
    api
      .get(`/api/bounty/${id}`)
      .then(setB)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [id])

  const isAsker = b && user && b.asker.id === user.id
  const canAnswer = b && user && b.asker.id !== user.id && b.status === 'open'

  const submitAnswer = async (e) => {
    e.preventDefault()
    if (!answer.trim()) return
    setBusy(true)
    try {
      await api.post(`/api/bounty/${id}/answers`, { content: answer.trim() })
      setAnswer('')
      load()
    } catch (error) {
      alert(error.message)
    } finally {
      setBusy(false)
    }
  }

  const adopt = async (answerId) => {
    if (!confirm('确认采纳该回答？赏金将发放给回答者。')) return
    try {
      await api.post(`/api/bounty/${id}/adopt`, { answerId })
      load()
    } catch (error) {
      alert(error.message)
    }
  }

  const close = async () => {
    if (!confirm('确认关闭悬赏？未被采纳时赏金将退回你的账户。')) return
    try {
      await api.post(`/api/bounty/${id}/close`)
      load()
    } catch (error) {
      alert(error.message)
    }
  }

  if (loading) return <div className="empty">加载中…</div>
  if (err) return <div className="empty">加载失败：{err}</div>
  if (!b) return null

  return (
    <div>
      <button className="btn-ghost" onClick={() => navigate('/bounty')} style={{ marginBottom: 12 }}>← 返回大厅</button>

      <div className="card">
        <div className="post-meta">
          <span className="avatar sm">{b.asker?.avatarChar || '?'}</span>
          <span className="author">{b.asker?.name || '匿名'}</span>
          <span className="bounty-status open">{STATUS[b.status] || b.status}</span>
          <span>· {timeAgo(b.createdAt)}</span>
        </div>
        <h1 className="detail-title" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {b.title}
          <span className={'bounty-reward' + (b.status !== 'open' ? ' done' : '')}>💰 {b.rewardPoints}</span>
        </h1>
        <div className="detail-content">{b.content}</div>
        <div className="post-actions" style={{ marginTop: 16 }}>
          <span className="act">💬 {b.answerCount} 回答</span>
          <span className="act">👁️ {b.viewCount}</span>
        </div>
        {isAsker && b.status === 'open' && (
          <div style={{ marginTop: 14 }}>
            <button className="btn-ghost" onClick={close}>关闭悬赏（退回赏金）</button>
          </div>
        )}
      </div>

      <h3 className="section-title">回答 {b.answers?.length || 0}</h3>

      {canAnswer && (
        <form className="card" onSubmit={submitAnswer} style={{ padding: 16 }}>
          <textarea className="textarea" style={{ marginBottom: 12 }} placeholder="写下你的解决方案…" value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? '提交中…' : '提交回答'}</button>
        </form>
      )}
      {!user && <div className="empty">登录后可参与回答</div>}
      {user && !isAsker && b.status !== 'open' && <div className="empty">该悬赏已结束</div>}

      {b.answers?.map((a) => (
        <div className={'card' + (a.isAdopted ? ' bounty-adopted' : '')} key={a.id}>
          <div className="post-meta">
            <span className="avatar sm">{a.answerer?.avatarChar || '?'}</span>
            <span className="author">{a.answerer?.name || '匿名'}</span>
            {a.isAdopted && <span className="tag active" style={{ cursor: 'default' }}>✓ 已采纳</span>}
            <span>· {timeAgo(a.createdAt)}</span>
          </div>
          <div className="detail-content" style={{ fontSize: 14 }}>{a.content}</div>
          {isAsker && b.status === 'open' && !a.isAdopted && (
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => adopt(a.id)}>采纳此回答</button>
          )}
        </div>
      ))}
    </div>
  )
}
