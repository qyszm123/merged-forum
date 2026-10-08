import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api.js'

const META = {
  projects: { label: '项目广场', icon: '🚀', ep: '/api/projects' },
  ideas: { label: '点子集市', icon: '💡', ep: '/api/ideas' },
  points: { label: '积分中心', icon: '⭐', ep: '/api/points/me' },
  train: { label: '修炼之路', icon: '🎓', ep: '/api/train/banks' },
  makers: { label: '人才广场', icon: '👥', ep: '/api/makers' },
  events: { label: '活动报名', icon: '📅', ep: '/api/events/my' }
}

function pickTitle(item) {
  return item.title || item.name || item.display_name || item.summary || item.label || '(无标题)'
}
function pickDesc(item) {
  return item.summary || item.content || item.description || item.note || item.bio || ''
}

export default function ModulesPage() {
  const { name } = useParams()
  const meta = META[name] || { label: name, icon: '📦', ep: `/api/${name}` }
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    setLoading(true)
    setErr('')
    api
      .get(meta.ep)
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.list || d?.data || d?.items || []
        let arr = Array.isArray(list) ? list : []
        // 修炼模块返回的是统计而非列表
        if (d && d.taskCount !== undefined) {
          arr = [
            {
              id: 'overview',
              title: `${meta.label} · 体系总览`,
              summary: `共 ${d.taskCount} 个闯关任务 · ${d.kpCount} 个知识点，覆盖 PBL 项目式学习与刷题闯关。`
            }
          ]
        }
        // 积分模块返回余额而非列表
        if (d && d.points !== undefined) {
          arr = [
            {
              id: 'balance',
              title: '我的积分余额',
              summary: `当前积分 ${d.points}，可通过项目交付、论坛互动与修炼闯关获取。`
            }
          ]
        }
        setItems(arr)
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [meta.ep])

  return (
    <div>
      <h2 className="section-title">
        {meta.icon} {meta.label}
      </h2>
      <p style={{ color: 'var(--theme-text-secondary)', fontSize: 13, marginTop: -8, marginBottom: 14 }}>
        浏览本模块内容列表。若暂无数据，可在后台或种子脚本中补充。
      </p>
      {loading && <div className="empty">加载中…</div>}
      {err && <div className="empty">加载失败：{err}</div>}
      {!loading && !err && items.length === 0 && (
        <div className="empty">暂无内容（可能需要在 MySQL 中灌入对应种子数据）。</div>
      )}
      <div className="module-grid">
        {items.slice(0, 50).map((it, i) => (
          <div className="module-card" key={it.id || i}>
            <h4>{pickTitle(it)}</h4>
            {pickDesc(it) && <p>{String(pickDesc(it)).slice(0, 120)}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
