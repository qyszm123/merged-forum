import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({
    studentNo: '', password: '', displayName: '', className: '', grade: '', inviteCode: ''
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (tab === 'login') {
        await login(form.studentNo.trim(), form.password)
      } else {
        await register({
          studentNo: form.studentNo.trim(),
          password: form.password,
          displayName: form.displayName.trim(),
          className: form.className.trim() || undefined,
          grade: form.grade.trim() || undefined
        })
      }
      navigate('/')
    } catch (error) {
      setErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  const fillDemo = (no) => setForm((f) => ({ ...f, studentNo: no, password: '123456' }))

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>奇遇广场</h1>
        <p className="sub">qyszm 风格 × kcsquare 架构 · 两论坛融合</p>
        <div className="auth-tabs">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>
            登录
          </button>
          <button className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')}>
            注册
          </button>
        </div>
        <form onSubmit={submit}>
          <label className="field-label">学号 / 账号</label>
          <input
            className="input"
            placeholder={tab === 'register' ? '设置登录账号' : '如 2026001'}
            value={form.studentNo}
            onChange={set('studentNo')}
          />
          <label className="field-label">密码</label>
          <input
            className="input"
            type="password"
            placeholder="至少 6 位"
            value={form.password}
            onChange={set('password')}
          />
          {tab === 'register' && (
            <>
              <label className="field-label">邀请码 <span style={{color: 'var(--theme-error)'}}>*</span></label>
              <input
                className="input"
                placeholder="请输入管理员发放的邀请码"
                value={form.inviteCode}
                onChange={set('inviteCode')}
              />
              <label className="field-label">昵称</label>
              <input className="input" placeholder="展示昵称" value={form.displayName} onChange={set('displayName')} />
              <label className="field-label">班级 / 年级（可选）</label>
              <input className="input" placeholder="如 七年级3班" value={form.className} onChange={set('className')} />
            </>
          )}
          {err && <div className="error-text">{err}</div>}
          <button className="btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? '处理中…' : tab === 'login' ? '登录' : '注册并进入'}
          </button>
        </form>
        {tab === 'login' && (
          <div className="hint">
            演示账号（密码均为 123456）：<br />
            <span style={{ cursor: 'pointer', color: 'var(--theme-accent)' }} onClick={() => fillDemo('2026001')}>2026001</span>
            {' · '}
            <span style={{ cursor: 'pointer', color: 'var(--theme-accent)' }} onClick={() => fillDemo('2026002')}>2026002</span>
            {' · '}
            <span style={{ cursor: 'pointer', color: 'var(--theme-accent)' }} onClick={() => fillDemo('2026003')}>2026003</span>
            {' · '}
            <span style={{ cursor: 'pointer', color: 'var(--theme-accent)' }} onClick={() => fillDemo('teacher')}>teacher</span>
            {' · '}
            <span style={{ cursor: 'pointer', color: 'var(--theme-accent)' }} onClick={() => fillDemo('admin')}>admin</span>
          </div>
        )}
      </div>
    </div>
  )
}
