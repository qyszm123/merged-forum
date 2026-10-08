import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { timeAgo, stripMarkdown } from '../utils/format.js'

const PURPOSES = [
  { v: 'other', l: '通用附件' },
  { v: 'quest_work', l: '闯关作品' },
  { v: 'project_pack', l: '项目包' },
  { v: 'course_material', l: '课程资料' }
]

function fmtSize(n) {
  n = Number(n || 0)
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

export default function ProfilePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [files, setFiles] = useState([])
  const [purpose, setPurpose] = useState('other')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [bookmarks, setBookmarks] = useState([])
  const [bmLoading, setBmLoading] = useState(false)
  const [badges, setBadges] = useState([])
  const fileInputRef = useRef(null)

  const loadFiles = () =>
    api
      .get('/api/uploads/mine')
      .then((d) => setFiles(d?.list || []))
      .catch(() => setFiles([]))

  const loadBookmarks = () => {
    setBmLoading(true)
    api
      .get('/api/forum/bookmarks?pageSize=50')
      .then((d) => setBookmarks(d?.list || []))
      .catch(() => setBookmarks([]))
      .finally(() => setBmLoading(false))
  }

  const loadBadges = () =>
    api
      .get('/api/badges/my')
      .then((d) => setBadges(d?.list || []))
      .catch(() => setBadges([]))

  useEffect(() => {
    setLoading(true)
    // 仅支持查看自己；访客主页端点未开放，先提示
    if (!user) {
      navigate('/login')
      return
    }
    if (id && id !== String(user.id)) {
      setLoading(false)
      return
    }
    api
      .get('/api/auth/me')
      .then((meData) => {
        setMe(meData)
        return Promise.all([loadFiles(), loadBookmarks(), loadBadges()])
      })
      .catch(() => setMe(null))
      .finally(() => setLoading(false))
  }, [id, user, navigate])

  const handleUpload = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    setUploadMsg('')
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('purpose', purpose)
      await api.post('/api/uploads', fd)
      setUploadMsg('✅ 上传成功：' + f.name)
      await loadFiles()
    } catch (err) {
      setUploadMsg('❌ 上传失败：' + (err.message || '未知错误'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const toggleBadge = async (badgeId) => {
    try {
      await api.put(`/api/badges/${badgeId}/toggle-display`)
      await loadBadges()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="empty">加载中…</div>

  if (id && id !== String(user?.id)) {
    return (
      <div className="card">
        <h2 className="section-title">访客主页</h2>
        <p style={{ color: 'var(--theme-text-secondary)' }}>
          当前仅开放「我的主页」。后续可接入公开用户接口查看 ID {id} 的主页与帖子。
        </p>
      </div>
    )
  }

  if (!me) return <div className="empty">未获取到资料</div>

  const level = Math.floor((me.points || 0) / 500) + 1
  const curExp = (me.points || 0) % 500
  const expPct = Math.round((curExp / 500) * 100)

  return (
    <div>
      <div className="card profile-head">
        <span className="avatar lg">{me.avatarChar}</span>
        <div className="info">
          <h2 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {me.displayName}
            <span className="level-badge">{me.rankLabel}</span>
          </h2>
          <div style={{ color: 'var(--theme-text-secondary)', fontSize: 14 }}>
            {me.role} · {me.points} 积分 · Lv.{level}
          </div>
          {me.className && (
            <div style={{ color: 'var(--theme-text-muted)', fontSize: 13, marginTop: 4 }}>
              {me.grade || ''} {me.className}
            </div>
          )}
          <div className="exp-wrap">
            <div className="exp-meta">
              <span>经验 {curExp} / 500</span>
              <span>Lv.{level} → Lv.{level + 1}</span>
            </div>
            <div className="exp-bar"><div className="exp-fill" style={{ width: expPct + '%' }} /></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="stat-grid">
          <div className="stat-item"><div className="num">{me.points}</div><div className="lbl">积分</div></div>
          <div className="stat-item"><div className="num">Lv.{level}</div><div className="lbl">等级</div></div>
          <div className="stat-item"><div className="num">{me.identityDetails?.length || 0}</div><div className="lbl">身份</div></div>
        </div>
      </div>

      {me.identityDetails?.length > 0 && (
        <div className="card">
          <h3 className="section-title" style={{ marginBottom: 10 }}>已获得身份</h3>
          <div>
            {me.identityDetails.map((i, idx) => (
              <span key={idx} className="tag active" style={{ cursor: 'default' }}>
                {i.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="section-title" style={{ marginBottom: 10 }}>🏅 我的勋章</h3>
        {badges.length === 0 ? (
          <div className="empty" style={{ padding: '24px 0' }}>
            还没有获得勋章，去勋章墙看看获取条件吧
            <div style={{ marginTop: 10 }}>
              <button className="btn-ghost" onClick={() => navigate('/badges')}>前往勋章墙 →</button>
            </div>
          </div>
        ) : (
          <>
            <p className="badge-sub" style={{ marginTop: 0 }}>点击勋章可佩戴 / 取消佩戴（最多同时佩戴 3 枚）</p>
            <div className="my-badge-list">
              {badges.map((b) => (
                <div
                  key={b.id}
                  className={'my-badge-item' + (b.isDisplayed ? ' displayed' : '')}
                  onClick={() => toggleBadge(b.id)}
                  title={b.isDisplayed ? '点击取消佩戴' : '点击佩戴'}
                >
                  <span className="badge-icon">{b.icon}</span>
                  <div className="my-badge-info">
                    <div className="badge-name">{b.name}</div>
                    <div className="badge-meta">
                      {b.isDisplayed ? '👑 佩戴中' : '点击佩戴'} · {String(b.awardedAt).slice(0, 10)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="section-title" style={{ marginBottom: 10 }}>我的模块</h3>
        <div className="module-grid">
          <div className="module-card" onClick={() => navigate('/m/projects')}>
            <h4>🚀 我的项目</h4>
            <p>前往项目广场查看 / 发布科创项目</p>
          </div>
          <div className="module-card" onClick={() => navigate('/m/ideas')}>
            <h4>💡 我的点子</h4>
            <p>前往点子集市发布创意或接委托</p>
          </div>
          <div className="module-card" onClick={() => navigate('/m/train')}>
            <h4>🎓 修炼之路</h4>
            <p>闯关刷题，通关获得创造者身份</p>
          </div>
          <div className="module-card" onClick={() => navigate('/careers')}>
            <h4>💼 职业学习</h4>
            <p>选择职业方向，学完获得身份认证</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title" style={{ marginBottom: 12 }}>⭐ 我的收藏</h3>
        {bmLoading && <div className="empty" style={{ padding: '24px 0' }}>加载中…</div>}
        {!bmLoading && bookmarks.length === 0 && (
          <div className="empty" style={{ padding: '24px 0' }}>还没有收藏过帖子</div>
        )}
        {!bmLoading && bookmarks.length > 0 && (
          <div className="bm-list">
            {bookmarks.map((bm) => {
              const excerpt = stripMarkdown(bm.content || '').slice(0, 80)
              return (
                <div
                  key={bm.id}
                  className="bm-item"
                  onClick={() => navigate(`/post/${bm.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="bm-title">{bm.title}</div>
                  {excerpt && <div className="bm-excerpt">{excerpt}</div>}
                  <div className="bm-meta">
                    <span>{bm.author?.name || '匿名'}</span>
                    <span>· {bm.board?.title || '综合'}</span>
                    <span>· ❤️ {bm.likeCount || 0}</span>
                    <span>· 💬 {bm.commentCount || 0}</span>
                    <span>· 收藏于 {timeAgo(bm.bookmarkedAt)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="section-title" style={{ marginBottom: 12 }}>📁 我的文件</h3>
        <div className="upload-row">
          <select className="select" style={{ marginBottom: 0, width: 'auto' }} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {PURPOSES.map((p) => (
              <option key={p.v} value={p.v}>{p.l}</option>
            ))}
          </select>
          <button className="btn-primary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? '上传中…' : '＋ 选择文件上传'}
          </button>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleUpload} />
        </div>
        {uploadMsg && <div className="upload-msg">{uploadMsg}</div>}
        {files.length === 0 ? (
          <div className="empty" style={{ padding: '24px 0' }}>还没有上传过文件</div>
        ) : (
          <div className="file-list">
            {files.map((f) => (
              <a key={f.id} className="file-item" href={`${f.url}?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} target="_blank" rel="noreferrer">
                <span className="fi-ic">📎</span>
                <span className="fi-name">{f.originalName}</span>
                <span className="fi-size">{fmtSize(f.size)}</span>
                <span className="fi-tag">{PURPOSES.find((p) => p.v === f.purpose)?.l || f.purpose}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
