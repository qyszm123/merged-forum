import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api.js'
import Icon from '../components/Icon.jsx'

const META = {
  projects: { label: '项目广场', icon: 'layers', ep: '/api/projects' },
  ideas: { label: '点子集市', icon: 'zap', ep: '/api/ideas' },
  points: { label: '积分中心', icon: 'star', ep: '/api/points/me' },
  train: { label: '修炼之路', icon: 'target', ep: '/api/train/banks' },
  makers: { label: '人才广场', icon: 'users', ep: '/api/makers' },
  events: { label: '活动报名', icon: 'calendar', ep: '/api/events/my' }
}

function pickTitle(item) {
  return item.title || item.name || item.display_name || item.summary || item.label || '(无标题)'
}
function pickDesc(item) {
  return item.summary || item.content || item.description || item.note || item.bio || ''
}

export default function ModulesPage() {
  const { name } = useParams()
  const meta = META[name] || { label: name, icon: 'package', ep: `/api/${name}` }
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
  }, [meta.ep, meta.label])

  return (
    <div>
      <h2 className="section-title">
        <Icon name={meta.icon} size={18} />
        {meta.label}
      </h2>
      <p className="badge-sub">
        浏览本模块内容列表。若暂无数据，可在后台或种子脚本中补充。
      </p>

      {loading && <div className="empty">加载中…</div>}
      {err && (
        <div className="empty">
          <div className="empty-ic">
            <Icon name="alert-circle" size={30} />
          </div>
          加载失败：{err}
        </div>
      )}
      {!loading && !err && items.length === 0 && (
        <div className="empty">
          <div className="empty-ic">
            <Icon name="inbox" size={30} />
          </div>
          暂无内容（可能需要在 MySQL 中灌入对应种子数据）。
        </div>
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
