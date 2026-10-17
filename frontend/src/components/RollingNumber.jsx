import { useEffect, useRef, useState } from 'react'

/**
 * 数字滚动（里程表 / odometer）
 *
 * 每一位是一列 0–9 的竖条，通过 translateY 滚到目标数字，
 * 数值变化时数字向上滚动而不是直接跳变。
 */
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export default function RollingNumber({ value, className = '' }) {
  const n = Math.max(0, Number(value) || 0)
  const str = String(n)

  // 位数变化时（9→10）整列重挂载，避免不同位数的列错位
  const lenRef = useRef(str.length)
  const [len, setLen] = useState(str.length)
  useEffect(() => {
    if (lenRef.current !== str.length) {
      lenRef.current = str.length
      setLen(str.length)
    }
  }, [str.length])

  return (
    <span className={'roll-num' + (className ? ' ' + className : '')} aria-label={str}>
      <span className="roll-sr">{str}</span>
      {str.split('').map((ch, i) => (
        <span className="roll-digit" key={`${len}-${i}`} aria-hidden="true">
          <span
            className="roll-track"
            style={{ transform: `translateY(-${Number(ch) * 10}%)` }}
          >
            {DIGITS.map((d) => (
              <span className="roll-cell" key={d}>
                {d}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}
