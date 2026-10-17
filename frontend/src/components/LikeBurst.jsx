import { useState } from 'react'
import Icon from './Icon.jsx'
import RollingNumber from './RollingNumber.jsx'

/**
 * 点赞爆粒子（Like Burst）
 *
 * 点击后的动作顺序：
 *   1. 爱心先压扁（scale 0.72）再弹起（scale 1.28）—— 420ms 弹簧曲线
 *   2. 同时从爱心中心向四周炸开 8 个小圆点，每个延迟略有差别
 *   3. 数字用里程表方式向上滚动到新值
 *
 * 取消点赞只回滚数字，不播放爆裂（避免"点赞特效"被当成取消也有效果）。
 */
const PARTICLES = 8
const DIST = 17 // 粒子飞散半径 px

export default function LikeBurst({
  liked = false,
  count = 0,
  onToggle,
  size = 16,
  title = '点赞'
}) {
  // 每次点赞 +1，用 key 让动画元素重新挂载从而重播动画
  const [burst, setBurst] = useState(0)

  const handle = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (!liked) setBurst((b) => b + 1)
    onToggle?.(e)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handle(e)
    }
  }

  const bursting = burst > 0 && liked

  return (
    <span
      className={
        'act like-burst' +
        (liked ? ' is-liked' : '') +
        (bursting ? ' is-bursting' : '')
      }
      style={{ '--heart': size + 'px' }}
      onClick={handle}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      title={title}
      aria-pressed={liked}
    >
      <span className="like-heart" key={'h' + burst} aria-hidden="true">
        <Icon
          name="heart"
          size={size}
          fill={liked ? 'currentColor' : 'none'}
          strokeWidth={liked ? 2.2 : 2}
        />
      </span>

      {bursting && (
        <span className="like-particles" key={'p' + burst} aria-hidden="true">
          {Array.from({ length: PARTICLES }).map((_, i) => {
            const angle = (i * (360 / PARTICLES) * Math.PI) / 180
            return (
              <i
                key={i}
                style={{
                  '--tx': `${(Math.cos(angle) * DIST).toFixed(1)}px`,
                  '--ty': `${(Math.sin(angle) * DIST).toFixed(1)}px`,
                  '--d': `${i * 14}ms`
                }}
              />
            )
          })}
        </span>
      )}

      <RollingNumber value={count} />
    </span>
  )
}
