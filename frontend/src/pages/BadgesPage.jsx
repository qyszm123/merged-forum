import { useEffect, useState } from 'react'
import api from '../api.js'
import { describeBadgeCondition } from '../utils/format.js'
import { emojiIconName } from '../utils/icons.js'
import Icon from '../components/Icon.jsx'

export default function BadgesPage() {
  const [badges, setBadges] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    setLoading(true)
    setErr('')
    api
      .get('/api/badges/all')
      .then((d) => setBadges(d || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  const ownedCount = badges.filter((b) => b.owned).length

  return (
    <div>
      <h2 className="section-title">
        <Icon name="award" size={18} />
        勋章墙
      </h2>
      <p className="badge-sub">
        共 {badges.length} 枚勋章 · 已获得 {ownedCount} 枚，通过完成对应条件自动解锁
      </p>

      {loading && <div className="empty">加载中…</div>}
      {err && <div className="empty">加载失败：{err}</div>}

      <div className="badge-grid">
        {badges.map((b) => (
          <div key={b.id} className={'badge-card' + (b.owned ? ' owned' : ' locked')}>
            <div className="badge-icon">
              {emojiIconName(b.icon) ? <Icon name={emojiIconName(b.icon)} size={24} /> : b.icon}
            </div>
            <div className="badge-name">{b.name}</div>
            <div className="badge-desc">{b.description}</div>
            <div className="badge-cond">
              {b.owned ? (
                <span className="badge-earned">
                  <Icon name="check" size={13} /> 已获得
                  {b.awardedAt ? ` · ${String(b.awardedAt).slice(0, 10)}` : ''}
                  {b.isDisplayed ? ' · 佩戴中' : ''}
                </span>
              ) : (
                <span className="badge-locked">
                  {describeBadgeCondition(b.conditionType, b.conditionValue)}可获得
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
