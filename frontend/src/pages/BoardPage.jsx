import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api.js'
import PostCard from '../components/PostCard.jsx'

export default function BoardPage() {
  const { slug } = useParams()
  const [posts, setPosts] = useState([])
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get('/api/forum/boards').then(setBoards).catch(() => setBoards([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    setErr('')
    const qs = new URLSearchParams({ pageSize: 20 })
    if (slug && slug !== 'all') qs.set('board', slug)
    api
      .get(`/api/forum/posts?${qs.toString()}`)
      .then((d) => setPosts(d.list || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [slug])

  const title =
    slug === 'all'
      ? '全部板块'
      : (boards.find((b) => b.slug === slug)?.title || slug)

  return (
    <div>
      <h2 className="section-title">{title}</h2>
      {loading && <div className="empty">加载中…</div>}
      {err && <div className="empty">加载失败：{err}</div>}
      {!loading && !err && posts.length === 0 && (
        <div className="empty">该板块还没有帖子。</div>
      )}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  )
}
