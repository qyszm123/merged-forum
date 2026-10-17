import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { emojiIconName } from '../utils/icons.js'
import Icon from '../components/Icon.jsx'
import LikeBurst from '../components/LikeBurst.jsx'
import MorphButton from '../components/MorphButton.jsx'

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

function fmtSize(n) {
  n = Number(n || 0)
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

const REPORT_PRESETS = ['垃圾广告', '违法违规', '人身攻击', '抄袭内容', '其他']

/** 举报表单：帖子与评论共用 */
function ReportForm({ reason, setReason, submitting, onSubmit, onCancel, title }) {
  return (
    <form className="report-form" onSubmit={onSubmit}>
      <div className="field-label">{title}</div>
      <div className="report-presets">
        {REPORT_PRESETS.map((p) => (
          <span
            key={p}
            className={'tag' + (reason === p ? ' active' : '')}
            style={{ cursor: 'pointer' }}
            onClick={() => setReason(p)}
          >
            {p}
          </span>
        ))}
      </div>
      <textarea
        className="textarea"
        placeholder="补充说明（可选，也可直接修改上面的原因）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="report-actions">
        <button className="btn-ghost" type="button" onClick={onCancel}>
          取消
        </button>
        <button className="btn-primary danger" type="submit" disabled={submitting || !reason.trim()}>
          {submitting ? '提交中…' : '提交举报'}
        </button>
      </div>
    </form>
  )
}

export default function PostDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [comment, setComment] = useState('')
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [bookmarked, setBookmarked] = useState(false)
  const [bookmarkCount, setBookmarkCount] = useState(0)
  const [sendState, setSendState] = useState('idle')

  // 举报相关：target 为 null | 'post' | { commentId }
  const [reportTarget, setReportTarget] = useState(null)
  const [reportReason, setReportReason] = useState('')
  const [reporting, setReporting] = useState(false)

  const load = () => {
    setLoading(true)
    api
      .get(`/api/forum/posts/${id}`)
      .then((d) => {
        setPost(d)
        setLikeCount(d.likeCount || 0)
        setBookmarkCount(d.bookmarkCount || 0)
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  const toggleLike = async () => {
    if (!user) return navigate('/login')
    const r = await api.post(`/api/forum/posts/${id}/like`)
    setLiked(r.liked)
    setLikeCount(r.likeCount)
  }

  const toggleBookmark = async () => {
    if (!user) return navigate('/login')
    const r = await api.post(`/api/forum/posts/${id}/bookmark`)
    setBookmarked(r.bookmarked)
    setBookmarkCount(r.bookmarkCount)
  }

  const submitComment = async (e) => {
    e.preventDefault()
    if (!user) return navigate('/login')
    if (!comment.trim() || sendState !== 'idle') return
    setSendState('loading')
    try {
      await api.post(`/api/forum/posts/${id}/comments`, { content: comment.trim() })
      setComment('')
      load()
      setSendState('success')
      setTimeout(() => setSendState('idle'), 900)
    } catch (error) {
      alert(error.message)
      setSendState('idle')
    }
  }

  const openReport = (target) => {
    if (!user) return navigate('/login')
    setReportTarget(target)
    setReportReason('')
  }

  const closeReport = () => {
    setReportTarget(null)
    setReportReason('')
  }

  const submitReport = async (e) => {
    e.preventDefault()
    if (!reportTarget || !reportReason.trim()) return
    setReporting(true)
    try {
      const url =
        reportTarget === 'post'
          ? `/api/forum/posts/${id}/report`
          : `/api/forum/comments/${reportTarget.commentId}/report`
      await api.post(url, { reason: reportReason.trim() })
      alert('举报已提交，等待管理员审核')
      closeReport()
    } catch (error) {
      alert(error.message)
    } finally {
      setReporting(false)
    }
  }

  if (loading) return <div className="empty">加载中…</div>
  if (err) return <div className="empty">加载失败：{err}</div>
  if (!post) return null

  // 是否可举报：已登录且非本人内容（管理员也可以提交，审核统一在管理后台进行）
  const isOwnPost = user && Number(post.author?.id) === Number(user.id)

  return (
    <div>
      <button className="btn-ghost" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
        <Icon name="arrow-left" size={15} />
        返回
      </button>
      <div className="card">
        <div className="post-meta">
          <span className="avatar sm">{post.author?.avatarChar || '?'}</span>
          <span className="author">{post.author?.name || '匿名'}</span>
          {post.author?.badge && (
            <span className="badge-mini" title={post.author.badge.name}>
              {emojiIconName(post.author.badge.icon) ? (
                <Icon name={emojiIconName(post.author.badge.icon)} size={14} />
              ) : (
                post.author.badge.icon
              )}
            </span>
          )}
          <span className="board-pill">{post.board?.title || '综合'}</span>
          <span className="comment-time">· {timeAgo(post.createdAt)}</span>
        </div>
        <h1 className="detail-title">{post.title}</h1>
        <div className="detail-content">{post.content}</div>
        {post.attachments?.length > 0 && (
          <div className="att-section">
            <div className="field-label">附件 {post.attachments.length} 个</div>
            <div className="file-list">
              {post.attachments.map((f) => (
                <a key={f.id} className="file-item" href={`${f.url}?token=${encodeURIComponent(localStorage.getItem('token') || '')}`} target="_blank" rel="noreferrer">
                  <span className="fi-ic">
                    <Icon name="paperclip" size={15} />
                  </span>
                  <span className="fi-name">{f.name}</span>
                  <span className="fi-size">{fmtSize(f.size)}</span>
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="post-actions" style={{ marginTop: 16 }}>
          <LikeBurst liked={liked} count={likeCount} onToggle={toggleLike} size={16} />
          <span className={'act' + (bookmarked ? ' bookmarked' : '')} onClick={toggleBookmark} title="收藏">
            <Icon name="bookmark" size={16} strokeWidth={bookmarked ? 2.4 : 2} />
            {bookmarkCount}
          </span>
          <span className="act" title="评论数">
            <Icon name="message-circle" size={16} />
            {post.commentCount || 0}
          </span>
          <span className="act" title="浏览数">
            <Icon name="eye" size={16} />
            {post.viewCount || 0}
          </span>
          <span
            className={'act report-btn' + (isOwnPost ? ' is-disabled' : '')}
            onClick={() => !isOwnPost && openReport('post')}
            title={isOwnPost ? '不能举报自己的帖子' : '举报该帖子'}
          >
            <Icon name="flag" size={16} />
            举报
          </span>
        </div>

        {reportTarget === 'post' && (
          <ReportForm
            title="举报该帖子"
            reason={reportReason}
            setReason={setReportReason}
            submitting={reporting}
            onSubmit={submitReport}
            onCancel={closeReport}
          />
        )}
      </div>

      <h3 className="section-title">
        <Icon name="message-square" size={17} />
        评论 {post.comments?.length || 0}
      </h3>
      {user ? (
        <form className="comment-form" onSubmit={submitComment}>
          <span className="avatar sm">{user.avatarChar}</span>
          <textarea
            className="textarea"
            style={{ marginBottom: 0 }}
            placeholder="写下你的看法…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <MorphButton state={sendState} icon="send">
            发送
          </MorphButton>
        </form>
      ) : (
        <div className="empty">登录后可参与评论</div>
      )}

      {post.comments?.map((c) => {
        const isOwn = user && Number(c.author?.id) === Number(user.id)
        const open = reportTarget && reportTarget !== 'post' && reportTarget.commentId === c.id
        return (
          <div className="comment" key={c.id}>
            <span className="avatar sm">{c.author?.avatarChar || '?'}</span>
            <div className="body">
              <div className="comment-head">
                <div>
                  <span className="nm">{c.author?.name || '匿名'}</span>
                  {c.author?.badge && (
                    <span className="badge-mini" title={c.author.badge.name}>
                      {emojiIconName(c.author.badge.icon) ? (
                        <Icon name={emojiIconName(c.author.badge.icon)} size={13} />
                      ) : (
                        c.author.badge.icon
                      )}
                    </span>
                  )}
                  <span className="comment-time">· {timeAgo(c.createdAt)}</span>
                </div>
                <span
                  className={'comment-report' + (isOwn ? ' is-disabled' : '')}
                  onClick={() => !isOwn && openReport({ commentId: c.id })}
                  title={isOwn ? '不能举报自己的评论' : '举报该评论'}
                >
                  <Icon name="flag" size={13} />
                  举报
                </span>
              </div>
              <div className="tx">{c.content}</div>
              {open && (
                <ReportForm
                  title="举报该评论"
                  reason={reportReason}
                  setReason={setReportReason}
                  submitting={reporting}
                  onSubmit={submitReport}
                  onCancel={closeReport}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
