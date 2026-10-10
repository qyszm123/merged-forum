import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { emojiIconName } from '../utils/icons.js'
import Icon from '../components/Icon.jsx'

export default function CareerSquarePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [joining, setJoining] = useState(null)

  const load = () => {
    setLoading(true); setErr('')
    api.get('/api/careers')
      .then((d) => setList(d.list || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const join = async (e, id) => {
    e.stopPropagation()
    if (!user) return navigate('/login')
    setJoining(id)
    try {
      await api.post(`/api/careers/${id}/join`)
      load()
    } catch (e) {
      alert(e.message)
    } finally {
      setJoining(null)
    }
  }

  return (
    <div>
      <h2 className="section-title">
        <Icon name="book-open" size={18} />
        职业学习
      </h2>
      <p className="badge-sub">
        选择一个职业方向，逐项掌握技能知识，通关后获得对应身份认证（显示在《我的》个人主页）。
      </p>

      {loading && <div className="empty">加载中…</div>}
      {err && <div className="empty">加载失败：{err}</div>}
      {!loading && !err && list.length === 0 && <div className="empty">暂无职业课程</div>}

      <div className="career-grid">
        {list.map((c) => (
          <div
            className="card career-card"
            key={c.id}
            style={{ '--career-color': c.color, cursor: 'pointer' }}
            onClick={() => navigate(`/career/${c.id}`)}
          >
            <div className="career-card-top">
              <span className="career-icon-lg">
                {emojiIconName(c.icon) ? <Icon name={emojiIconName(c.icon)} size={22} /> : c.icon}
              </span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px' }}>{c.name}</h3>
                <div className="post-meta" style={{ margin: 0 }}>
                  <span className="comment-time">
                    <Icon name="list" size={12} /> {c.skillCount} 项技能
                  </span>
                  {c.completed && <span className="status-badge active">已完成</span>}
                  {c.joined && !c.completed && <span className="status-badge">学习中</span>}
                </div>
              </div>
            </div>
            <p className="career-desc">{c.description}</p>
            <div className="career-card-bottom">
              {c.completed ? (
                <span className="tag active" style={{ cursor: 'default' }}>
                  <Icon name="check" size={13} />
                  已获身份
                </span>
              ) : c.joined ? (
                <button className="btn-primary" onClick={(e) => { e.stopPropagation(); navigate(`/career/${c.id}`) }}>
                  继续学习
                  <Icon name="arrow-right" size={15} />
                </button>
              ) : (
                <button className="btn-primary" disabled={joining === c.id} onClick={(e) => join(e, c.id)}>
                  <Icon name="plus" size={15} />
                  {joining === c.id ? '加入中…' : '加入学习'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
