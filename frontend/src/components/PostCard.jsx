import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { timeAgo, isOnline, stripMarkdown } from '../utils/format.js'
import { emojiIconName } from '../utils/icons.js'
import Icon from './Icon.jsx'
import LikeBurst from './LikeBurst.jsx'
import ReportButton from './ReportButton.jsx'

export default function PostCard({ post }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(post.likeCount || 0)
  const [bookmarked, setBookmarked] = useState(false)
  const [bookmarkCount, setBookmarkCount] = useState(post.bookmarkCount || 0)

  const openPost = () => navigate(`/post/${post.id}`)

  const toggleLike = async (e) => {
    e.stopPropagation()
    if (!user) return navigate('/login')
    try {
      const r = await api.post(`/api/forum/posts/${post.id}/like`)
      setLiked(r.liked)
      setLikeCount(r.likeCount)
    } catch (err) {
      alert(err.message)
    }
  }

  const toggleBookmark = async (e) => {
    e.stopPropagation()
    if (!user) return navigate('/login')
    try {
      const r = await api.post(`/api/forum/posts/${post.id}/bookmark`)
      setBookmarked(r.bookmarked)
      setBookmarkCount(r.bookmarkCount)
    } catch (err) {
      alert(err.message)
    }
  }

  const excerpt = stripMarkdown(post.content || '')
  const author = post.author || {}
  const online = isOnline(author.id)
  const isOwn = !!user && Number(author.id) === Number(user.id)
  const badgeName = emojiIconName(author.badge?.icon)

  return (
    <article className="card post-card" onClick={openPost}>
      <div className="post-card-top">
        <div className="post-card-titlerow">
          {post.isPinned && (
            <span className="flag flag-pin" title="置顶">
              <Icon name="map-pin" size={11} />
              置顶
            </span>
          )}
          {post.isHot && (
            <span className="flag flag-hot" title="热门">
              <Icon name="trending-up" size={11} />
              热门
            </span>
          )}
          <h3 className="post-title">{post.title}</h3>
        </div>
        {excerpt && <p className="post-excerpt">{excerpt}</p>}
      </div>

      {post.tags && post.tags.length > 0 && (
        <div className="post-tags">
          {post.tags.map((t, i) => (
            <span key={i}>#{t}</span>
          ))}
        </div>
      )}

      <div className="post-card-foot">
        <div className="post-card-author">
          <span
            className={'avatar sm' + (online ? ' is-online' : ' is-offline')}
            title={online ? `${author.name || '匿名'} · 在线` : `${author.name || '匿名'} · 离线`}
          >
            {author.avatarChar || '?'}
          </span>
          <span className="author-name">{author.name || '匿名'}</span>
          {author.badge && (
            <span className="badge-mini" title={author.badge.name}>
              {badgeName ? <Icon name={badgeName} size={13} /> : author.badge.icon}
            </span>
          )}
          <span className="board-pill">{post.board?.title || '综合'}</span>
        </div>
        <div className="post-card-meta">
          <span className="time">{timeAgo(post.createdAt)}</span>
          <LikeBurst liked={liked} count={likeCount} onToggle={toggleLike} size={15} />
          <span
            className={'act' + (bookmarked ? ' bookmarked' : '')}
            onClick={toggleBookmark}
            title="收藏"
          >
            <Icon name="bookmark" size={15} strokeWidth={bookmarked ? 2.4 : 2} />
            {bookmarkCount}
          </span>
          <span className="act" title="评论数">
            <Icon name="message-circle" size={15} />
            {post.commentCount || 0}
          </span>
          <span className="act" title="浏览数">
            <Icon name="eye" size={15} />
            {post.viewCount || 0}
          </span>
          <ReportButton kind="post" id={post.id} own={isOwn} />
        </div>
      </div>
    </article>
  )
}
