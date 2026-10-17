import { useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

/**
 * 提交按钮三连变（Submit Morph）
 *
 * 三个状态的转换顺序：
 *   idle     → 图标 + 文案
 *   loading  → 横向收拢成直径 40px 的圆形，中间转圈（提交中，禁用点击）
 *   success  → 底色转绿，圆圈里弹出一个勾
 *
 * CSS 无法从 width:auto 过渡到 40px（浏览器按离散属性处理），
 * 所以待机态先把真实宽度量成像素值写进 style，形变才有动画起点。
 */
const MORPH_W = 40

export default function MorphButton({
  state = 'idle', // idle | loading | success
  icon,
  block = false, // 整宽按钮（width:100%）不需要量宽度，百分比可以直接过渡
  className = '',
  children,
  ...rest
}) {
  const ref = useRef(null)
  const [idleWidth, setIdleWidth] = useState(null)
  const lastLabel = useRef(children)

  // 文案变了（比如登录 ↔ 注册）就重新量一次
  useLayoutEffect(() => {
    if (lastLabel.current !== children) {
      lastLabel.current = children
      setIdleWidth(null)
    }
  })

  // 待机态量出自然宽度；两次布局效应都在绘制前完成，不会闪
  useLayoutEffect(() => {
    if (block || state !== 'idle' || idleWidth !== null) return
    const el = ref.current
    if (!el) return
    const next = Math.round(el.getBoundingClientRect().width)
    if (next > 0) setIdleWidth(next)
  })

  const morphing = state !== 'idle'
  const style = morphing
    ? { width: MORPH_W }
    : block
      ? { width: '100%' }
      : idleWidth
        ? { width: idleWidth }
        : undefined

  return (
    <button
      ref={ref}
      type="submit"
      className={
        'btn-primary morph-btn' +
        (morphing ? ' is-morphing' : '') +
        (state === 'loading' ? ' is-loading' : '') +
        (state === 'success' ? ' is-success' : '') +
        (className ? ' ' + className : '')
      }
      style={style}
      aria-busy={state === 'loading'}
      disabled={morphing || rest.disabled}
      {...rest}
    >
      {state === 'idle' && (
        <>
          {icon && <Icon name={icon} size={15} />}
          <span className="morph-label">{children}</span>
        </>
      )}
      {state === 'loading' && <span className="morph-spinner" aria-hidden="true" />}
      {state === 'success' && (
        <span className="morph-check" aria-hidden="true">
          <Icon name="check" size={20} strokeWidth={2.8} />
        </span>
      )}
    </button>
  )
}
