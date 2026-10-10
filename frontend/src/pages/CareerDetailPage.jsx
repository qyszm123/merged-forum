import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { emojiIconName } from '../utils/icons.js'
import Icon from '../components/Icon.jsx'

/** 简易 markdown 渲染 */
function renderMd(md) {
  if (!md) return null
  return md.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <h3 key={i} className="kn-h2">{line.slice(3)}</h3>
    if (line.startsWith('### ')) return <h4 key={i} className="kn-h3">{line.slice(4)}</h4>
    if (line.startsWith('**') && line.endsWith('**') && line.length > 4)
      return <p key={i} className="kn-bold">{line.slice(2, -2)}</p>
    if (line.startsWith('- ')) return <div key={i} className="kn-li">{line.slice(2)}</div>
    if (line.startsWith('|')) return <div key={i} className="kn-table">{line}</div>
    if (line.trim()) return <p key={i} className="kn-text">{line}</p>
    return null
  })
}

export default function CareerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [selected, setSelected] = useState(null)
  const [completing, setCompleting] = useState(null)
  const [toast, setToast] = useState('')

  // 结业考试
  const [exam, setExam] = useState(null) // { questions, answers }
  const [examResult, setExamResult] = useState(null)
  const [examBusy, setExamBusy] = useState(false)

  const load = () => {
    setLoading(true); setErr('')
    api.get(`/api/careers/${id}`)
      .then((d) => setData(d))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [id])

  const join = async () => {
    if (!user) return navigate('/login')
    try {
      await api.post(`/api/careers/${id}/join`)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const complete = async (sid) => {
    setCompleting(sid)
    try {
      const r = await api.post(`/api/careers/${id}/skills/${sid}/complete`)
      if (r.allDone) {
        setToast('技能已全部完成，去参加结业考试吧！')
        setTimeout(() => setToast(''), 3000)
      } else {
        setToast(r.message)
        setTimeout(() => setToast(''), 2000)
      }
      load()
    } catch (e) {
      alert(e.message)
    } finally {
      setCompleting(null)
    }
  }

  const startExam = async () => {
    setExamBusy(true)
    try {
      const r = await api.post(`/api/careers/${id}/exam/start`)
      setExam({ questions: r.questions, answers: {} })
      setExamResult(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      alert(e.message)
    } finally {
      setExamBusy(false)
    }
  }

  const submitExam = async () => {
    setExamBusy(true)
    try {
      const answers = exam.questions.map((q) => ({ questionId: q.id, answer: exam.answers[q.id] }))
      const r = await api.post(`/api/careers/${id}/exam/submit`, { answers })
      setExam(null)
      setExamResult(r)
      if (r.passed) {
        setToast(r.message)
        setTimeout(() => setToast(''), 4000)
        load()
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      alert(e.message)
    } finally {
      setExamBusy(false)
    }
  }

  if (loading) return <div className="empty">加载中…</div>
  if (err) return <div className="empty">加载失败：{err}</div>
  if (!data) return null

  const { career, skills, progress } = data
  const doneCount = progress?.doneSkills || 0
  const total = progress?.totalSkills || skills.length
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0
  const completed = !!progress?.completedAt
  const allSkillsDone = progress && total > 0 && doneCount >= total
  const showExamEntry = allSkillsDone && !completed && !exam && !examResult

  return (
    <div>
      <button className="btn-ghost" onClick={() => navigate('/careers')} style={{ marginBottom: 12 }}>
        <Icon name="arrow-left" size={15} />
        职业广场
      </button>

      {toast && (
        <div className="career-toast">
          <Icon name="check-circle" size={16} />
          {toast}
        </div>
      )}

      <div className="card" style={{ '--career-color': career.color }}>
        <div className="career-detail-head">
          <span className="career-icon-lg" style={{ background: `linear-gradient(135deg, ${career.color}, ${career.color}80)` }}>
            {emojiIconName(career.icon) ? <Icon name={emojiIconName(career.icon)} size={22} /> : career.icon}
          </span>
          <div style={{ flex: 1 }}>
            <h1 className="section-title" style={{ margin: '0 0 4px' }}>{career.name}</h1>
            <p style={{ color: 'var(--theme-text-secondary)', margin: 0, fontSize: 14 }}>{career.description}</p>
          </div>
          {completed && (
            <span className="status-badge active">
              <Icon name="check" size={12} />
              已完成 · 获得身份
            </span>
          )}
        </div>

        {!progress ? (
          <button className="btn-primary" style={{ marginTop: 14 }} onClick={join}>
            <Icon name="plus" size={15} />
            加入学习
          </button>
        ) : (
          <div className="career-progress" style={{ marginTop: 14 }}>
            <div className="exp-bar"><div className="exp-fill" style={{ width: pct + '%', background: `linear-gradient(90deg, ${career.color}, ${career.color}aa)` }} /></div>
            <div className="post-meta" style={{ marginTop: 6 }}>
              <span>进度 {doneCount}/{total}</span>
              <span>· {pct}%</span>
              {progress.completedAt && <span>· 完成于 {progress.completedAt.slice(0, 10)}</span>}
            </div>
          </div>
        )}
      </div>

      {/* 结业考试入口 */}
      {showExamEntry && (
        <div className="card exam-entry">
          <div className="exam-entry-head">
            <span className="exam-entry-icon">
              <Icon name="award" size={22} />
            </span>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 4px' }}>结业考试已解锁</h3>
              <p style={{ margin: 0, color: 'var(--theme-text-secondary)', fontSize: 13 }}>
                全部技能已完成！通过考试即可获得「{career.name}」身份认证（显示在《我的》主页）。考试内容为该职业技能的基础知识，60 分合格，不通过可重考。
              </p>
            </div>
          </div>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={startExam} disabled={examBusy}>
            {examBusy ? '出题中…' : '开始考试'}
            {!examBusy && <Icon name="arrow-right" size={15} />}
          </button>
        </div>
      )}

      {/* 考试进行中 */}
      {exam && (
        <div className="exam-section">
          <div className="sort-bar" style={{ marginBottom: 12 }}>
            <span className="tag active" style={{ cursor: 'default' }}>
              <Icon name="edit-3" size={13} />
              结业考试 · {career.name}
            </span>
            <span className="tag" style={{ cursor: 'default' }}>共 {exam.questions.length} 题</span>
            <span className="tag" style={{ cursor: 'default' }}>60 分合格</span>
          </div>
          {exam.questions.map((q, qi) => (
            <div className="card exam-q" key={q.id}>
              <div className="exam-q-title">{qi + 1}. {q.question}</div>
              <div className="exam-opts">
                {Object.entries(q.options).map(([k, v]) => (
                  <div
                    key={k}
                    className={'exam-opt' + (exam.answers[q.id] === k ? ' picked' : '')}
                    style={{ '--career-color': career.color }}
                    onClick={() => setExam((x) => ({ ...x, answers: { ...x.answers, [q.id]: k } }))}
                  >
                    <span className="opt-letter">{k}</span>
                    <span className="opt-text">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="exam-submit-row">
            <button className="btn-ghost" onClick={() => { setExam(null); setExamResult(null) }}>
              <Icon name="x" size={15} />
              放弃考试
            </button>
            <button
              className="btn-primary"
              disabled={examBusy || Object.keys(exam.answers).length < exam.questions.length}
              onClick={submitExam}
            >
              <Icon name="check" size={15} />
              {examBusy ? '批改中…' : `交卷（已答 ${Object.keys(exam.answers).length}/${exam.questions.length}）`}
            </button>
          </div>
        </div>
      )}

      {/* 考试结果 */}
      {examResult && (
        <div className="card exam-result">
          <div className="exam-score" style={{ color: examResult.passed ? 'var(--theme-success)' : 'var(--theme-error)' }}>
            {examResult.score}<small> 分</small>
          </div>
          <div className="exam-verdict">
            {examResult.passed
              ? `考试通过！答对 ${examResult.correctCount}/${examResult.total}，获得身份「${career.name}」`
              : `答对 ${examResult.correctCount}/${examResult.total}，未达 60 分合格线，再接再厉！`}
          </div>
          <div className="exam-breakdown">
            {examResult.results.map((r) => (
              <div key={r.questionId} className={'exam-bd ' + (r.correct ? 'ok' : 'bad')}>
                <div className="bd-t">
                  <Icon name={r.correct ? 'check' : 'x'} size={13} /> {r.index}. {r.question}
                </div>
                {!r.correct && <div className="bd-d">你的答案：{r.yourAnswer || '未答'} · 正确答案：{r.correctAnswer}</div>}
                {r.explanation && (
                  <div className="bd-e">
                    <Icon name="info" size={13} />
                    <span>{r.explanation}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!examResult.passed && (
            <button className="btn-primary" onClick={startExam} disabled={examBusy}>
              <Icon name="refresh-cw" size={15} />
              {examBusy ? '出题中…' : '重新考试'}
            </button>
          )}
        </div>
      )}

      <h3 className="section-title" style={{ margin: '18px 0 12px' }}>
        <Icon name="list" size={17} />
        技能路线
      </h3>
      <div className="career-grid">
        {skills.map((s, idx) => (
          <div className={'card skill-card' + (s.done ? ' done' : '')} key={s.id} style={{ '--career-color': career.color }}>
            <div className="skill-head">
              <span className="skill-icon" style={{ background: `linear-gradient(135deg, ${career.color}, ${career.color}80)` }}>
                {s.done ? (
                  <Icon name="check" size={16} />
                ) : (
                  <Icon name={emojiIconName(s.icon) || 'star'} size={16} />
                )}
              </span>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 2px' }}>{idx + 1}. {s.name}</h4>
                <div className="post-meta" style={{ margin: 0, fontSize: 12 }}>
                  {s.done ? <span className="status-badge active">已完成</span> : <span className="badge-locked">待学习</span>}
                </div>
              </div>
            </div>
            <p className="career-desc">{s.description}</p>
            <div className="skill-actions">
              {s.knowledge && (
                <button className="btn-ghost" onClick={() => setSelected(s)}>
                  <Icon name="book-open" size={15} />
                  学习知识
                </button>
              )}
              {progress && !completed && !s.done && (
                <button className="btn-primary" disabled={completing === s.id} onClick={() => complete(s.id)}>
                  <Icon name="check" size={15} />
                  {completing === s.id ? '提交中…' : '标记完成'}
                </button>
              )}
            </div>
          </div>
        ))}
        {skills.length === 0 && <div className="empty">该职业暂无技能</div>}
      </div>

      {selected && (
        <div className="knowledge-overlay" onClick={() => setSelected(null)}>
          <div className="knowledge-modal" onClick={(e) => e.stopPropagation()}>
            <div className="knowledge-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="skill-icon sm" style={{ background: `linear-gradient(135deg, ${career.color}, ${career.color}80)` }}>
                  <Icon name={emojiIconName(selected.icon) || 'star'} size={14} />
                </span>
                <h3 className="modal-title">{selected.name}</h3>
              </div>
              <button className="modal-close" onClick={() => setSelected(null)} aria-label="关闭">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="knowledge-body">{renderMd(selected.knowledge)}</div>
            <div className="knowledge-foot">
              {progress && !completed && !selected.done && (
                <button
                  className="btn-primary"
                  disabled={completing === selected.id}
                  onClick={() => { complete(selected.id); setSelected(null) }}
                >
                  <Icon name="check" size={15} />
                  {completing === selected.id ? '提交中…' : '我已掌握，标记完成'}
                </button>
              )}
              <button className="btn-ghost" onClick={() => setSelected(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
