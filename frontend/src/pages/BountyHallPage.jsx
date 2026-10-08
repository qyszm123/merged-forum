import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

const STATUS = {
  open: { l: '进行中', cls: 'open' },
  adopted: { l: '已采纳', cls: 'adopted' },
  closed: { l: '已关闭', cls: 'closed' }
}

export default function BountyHallPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('open')
  const [showForm, setShowForm] = useState(false)
  const [myPoints, setMyPoints] = useState(0)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [reward, setReward] = useState(20)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState('')

  const load = () => {
    setLoading(true)
    setErr('')
    api
      .get(`/api/bounty?status=${status}&pageSize=30`)
      .then((d) => setList(d.list || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [status])

  useEffect(() => {
    if (user) api.get('/api/points/me').then((d) => setMyPoints(d.points || 0)).catch(() => {})
  }, [user])

  const submit = async (e) => {
    e.preventDefault()
    setFormErr('')
    if (!title.trim() || !content.trim() || reward < 1) {
      setFormErr('请填写标题、内容，赏金至少 1 积分')
      return
    }
    if (reward > myPoints) {
      setFormErr(`积分不足，当前余额 ${myPoints}`)
      return
    }
    setBusy(true)
    try {
      const r = await api.post('/api/bounty', {
        title: title.trim(),
        content: content.trim(),
        rewardPoints: Number(reward)
      })
      setTitle(''); setContent(''); setReward(20); setShowForm(false)
      setMyPoints((p) => p - Number(reward))
      navigate(`/bounty/${r.id}`)
    } catch (error) {
      setFormErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="bounty-head">
        <h2 className="section-title" style={{ margin: 0 }}>💰 悬赏大厅</h2>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '收起' : '＋ 发布悬赏'}
        </button>
      </div>
      <div className="bounty-sub">用积分悬赏，让社群帮你解决难题。我的积分：<b>{myPoints}</b></div>

      {showForm && (
        <form className="card" onSubmit={submit} style={{ marginTop: 12 }}>
          <label className="field-label">问题标题</label>
          <input className="input" placeholder="一句话描述你的难题" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="field-label">详细描述</label>
          <textarea className="textarea" placeholder="把问题说清楚，方便别人帮你" value={content} onChange={(e) => setContent(e.target.value)} />
          <label className="field-label">赏金积分（发布后从账户冻结，采纳后转给回答者）</label>
          <input className="input" type="number" min="1" max={myPoints} value={reward} onChange={(e) => setReward(e.target.value)} />
          {formErr && <div className="error-text">{formErr}</div>}
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? '发布中…' : '发布悬赏'}</button>
        </form>
      )}

      <div className="sort-bar" style={{ marginTop: 16 }}>
        {[['open', '进行中'], ['adopted', '已采纳'], ['closed', '已关闭'], ['all', '全部']].map(([k, l]) => (
          <button key={k} className={'tag' + (status === k ? ' active' : '')} style={{ cursor: 'pointer' }} onClick={() => setStatus(k)}>
            {l}
          </button>
        ))}
      </div>

      {loading && <div className="empty">加载中…</div>}
      {err && <div className="empty">加载失败：{err}</div>}
      {!loading && !err && list.length === 0 && <div className="empty">还没有悬赏，点“发布悬赏”开个头吧～</div>}

      {list.map((b) => (
        <div className="card bounty-card" key={b.id} onClick={() => navigate(`/bounty/${b.id}`)}>
          <div className="bounty-card-top">
            <h3 className="post-title" style={{ margin: 0 }}>{b.title}</h3>
            <span className={'bounty-reward' + (b.status !== 'open' ? ' done' : '')}>💰 {b.rewardPoints}</span>
          </div>
          <div className="post-meta">
            <span className="avatar sm">{b.asker?.avatarChar || '?'}</span>
            <span className="author">{b.asker?.name || '匿名'}</span>
            <span className={'bounty-status ' + (STATUS[b.status]?.cls || '')}>{STATUS[b.status]?.l || b.status}</span>
            <span>· {b.answerCount} 回答</span>
            <span>· {timeAgo(b.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
