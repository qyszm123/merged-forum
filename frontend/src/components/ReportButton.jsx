import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Icon from './Icon.jsx'

export const REPORT_PRESETS = ['垃圾广告', '违法违规', '人身攻击', '抄袭内容', '其他']

/** 举报表单：帖子卡片 / 帖子详情 / 评论共用 */
export function ReportForm({ submitting, onSubmit, onCancel, title = '举报' }) {
  const [reason, setReason] = useState('')
  return (
    <form
      className="report-form"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault()
        if (!reason.trim()) return
        onSubmit(reason.trim())
      }}
    >
      <div className="field-label">{title}</div>
      <div className="report-presets">
        {REPORT_PRESETS.map((p) => (
          <span
            key={p}
            className={'tag' + (reason === p ? ' active' : '')}
            style={{ cursor: 'pointer' }}
            onClick={() => setReason(p)}
          >
            {p}
          </span>
        ))}
      </div>
      <textarea
        className="textarea"
        placeholder="补充说明（可选，也可直接修改上面的原因）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="report-actions">
        <button className="btn-ghost" type="button" onClick={onCancel}>
          取消
        </button>
        <button className="btn-primary danger" type="submit" disabled={submitting || !reason.trim()}>
          {submitting ? '提交中…' : '提交举报'}
        </button>
      </div>
    </form>
  )
}

/**
 * 通用举报入口按钮 + 内联表单。
 * kind: 'post' | 'comment'；id 为帖子或评论 id。
 * own 为 true 时按钮置灰（不能举报自己的内容）。
 */
export default function ReportButton({ kind, id, own = false }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const url =
    kind === 'post'
      ? `/api/forum/posts/${id}/report`
      : `/api/forum/comments/${id}/report`

  const handleClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (own) return
    if (!user) return navigate('/login')
    setOpen((v) => !v)
  }

  const submit = async (reason) => {
    setSubmitting(true)
    try {
      await api.post(url, { reason })
      alert('举报已提交，等待管理员审核')
      setOpen(false)
    } catch (error) {
      alert(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <span
        className={'act comment-report' + (own ? ' is-disabled' : '')}
        onClick={handleClick}
        title={own ? '不能举报自己的内容' : '举报'}
      >
        <Icon name="flag" size={13} />
        举报
      </span>
      {open && (
        <ReportForm
          title={kind === 'post' ? '举报该帖子' : '举报该评论'}
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  )
}
