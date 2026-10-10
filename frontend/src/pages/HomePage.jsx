import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../api.js'
import PostCard from '../components/PostCard.jsx'
import ForumAnnounceModal from '../components/ForumAnnounceModal.jsx'
import Icon from '../components/Icon.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const SORTS = [
  { k: 'new', l: '最新' },
  { k: 'hot', l: '热门' },
  { k: 'unsolved', l: '待解答' }
]

function SkeletonCard() {
  return (
    <div className="card post-card skeleton">
      <div className="sk-line sk-title" />
      <div className="sk-line sk-body" />
      <div className="sk-line sk-body short" />
      <div className="sk-foot">
        <span className="sk-avatar" />
        <span className="sk-line sk-name" />
      </div>
    </div>
  )
}

export default function HomePage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const q = params.get('q') || ''
  const [sort, setSort] = useState('new')
  const [posts, setPosts] = useState([])
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const [announceOpen, setAnnounceOpen] = useState(false)

  // 首次进入首页自动弹出公告弹窗
  useEffect(() => {
    const seen = localStorage.getItem('fam_announce_seen')
    if (!seen) {
      setAnnounceOpen(true)
    }
  }, [])

  const closeAnnounce = () => {
    setAnnounceOpen(false)
    localStorage.setItem('fam_announce_seen', '1')
  }

  useEffect(() => {
    api.get('/api/forum/boards').then(setBoards).catch(() => setBoards([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    setErr('')
    const qs = new URLSearchParams({ sort, pageSize: 20 })
    if (q) qs.set('q', q)
    api
      .get(`/api/forum/posts?${qs.toString()}`)
      .then((d) => setPosts(d.list || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [q, sort, tick])

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6) return '夜深了'
    if (h < 12) return '早上好'
    if (h < 14) return '中午好'
    if (h < 18) return '下午好'
    return '晚上好'
  })()

  return (
    <div className="home-page">
      <ForumAnnounceModal open={announceOpen} onClose={closeAnnounce} />
      {!q && (
        <div className="home-hero">
          <div className="hero-text">
            <h1>{greeting}，{user?.displayName || '同学'}</h1>
            <p>在奇遇广场，分享灵感、组队共创、答疑解惑。</p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/create')}>
            <Icon name="edit-3" size={16} />
            发布新帖
          </button>
        </div>
      )}

      {!q && boards.length > 0 && (
        <div className="home-cats">
          <span className="home-cats-label">热门分类</span>
          {boards.slice(0, 6).map((b) => (
            <button key={b.slug} className="cat-chip" onClick={() => navigate(`/board/${b.slug}`)}>
              {b.title}
            </button>
          ))}
        </div>
      )}

      <div className="home-sort">
        {SORTS.map((s) => (
          <button
            key={s.k}
            className={'sort-tab' + (sort === s.k ? ' active' : '')}
            onClick={() => setSort(s.k)}
          >
            {s.l}
          </button>
        ))}
      </div>

      {q && <h2 className="section-title">搜索：“{q}”</h2>}

      {loading ? (
        <div className="post-list">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : err ? (
        <div className="empty">
          <div className="empty-ic"><Icon name="alert-circle" size={30} /></div>
          <p>加载失败：{err}</p>
          <button className="btn-ghost" onClick={() => setTick((t) => t + 1)}>重试</button>
        </div>
      ) : posts.length === 0 ? (
        <div className="empty">
          <div className="empty-ic">
            <Icon name={q ? 'search' : 'feather'} size={30} />
          </div>
          <p>{q ? '没有找到相关帖子，换个关键词试试' : '这里还很安静，来发第一帖吧'}</p>
          {!q && (
            <button className="btn-primary" onClick={() => navigate('/create')}>
              <Icon name="edit-3" size={16} />
              发帖
            </button>
          )}
        </div>
      ) : (
        <div className="post-list">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  )
}
