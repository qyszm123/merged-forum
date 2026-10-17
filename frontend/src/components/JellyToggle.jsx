import { useEffect, useRef, useState } from 'react'

/**
 * 果冻开关（Jelly Toggle）
 *
 * 手感细节：
 *   1. 圆点开始滑动时被横向拉长（scaleX 1.32 / scaleY 0.8），像果冻被拽着走
 *   2. 滑到另一端后卸掉拉伸，用弹簧曲线弹回正圆（带一点过冲）
 *
 * 只在滑动期间加 is-moving，约 340ms 后自动移除 —— 移除那一下就是"弹回"。
 */
const MOVE_MS = 340

export default function JellyToggle({
  checked = false,
  onChange,
  label = '',
  disabled = false,
  title
}) {
  const [moving, setMoving] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const toggle = () => {
    if (disabled) return
    setMoving(true)
    onChange?.(!checked)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMoving(false), MOVE_MS)
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || title || '开关'}
      title={title || label}
      disabled={disabled}
      data-checked={checked ? 'true' : 'false'}
      className={
        'jelly-toggle' +
        (checked ? ' is-on' : '') +
        (moving ? ' is-moving' : '') +
        (disabled ? ' is-disabled' : '')
      }
      onClick={toggle}
    >
      <span className="jelly-knob" />
    </button>
  )
}
