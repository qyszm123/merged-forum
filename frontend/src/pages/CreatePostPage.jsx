import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api.js'
import Icon from '../components/Icon.jsx'
import MorphButton from '../components/MorphButton.jsx'

function fmtSize(n) {
  n = Number(n || 0)
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

export default function CreatePostPage() {
  const navigate = useNavigate()
  const [boards, setBoards] = useState([])
  const [boardSlug, setBoardSlug] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [err, setErr] = useState('')
  const [submitState, setSubmitState] = useState('idle')
  const [attIds, setAttIds] = useState([])
  const [attFiles, setAttFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    api
      .get('/api/forum/boards')
      .then((list) => {
        setBoards(list)
        if (list.length) setBoardSlug(list[0].slug)
      })
      .catch(() => setBoards([]))
  }, [])

  const pickFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('purpose', 'other')
      const r = await api.post('/api/uploads', fd)
      setAttIds((p) => [...p, r.id])
      setAttFiles((p) => [...p, { id: r.id, name: r.originalName, size: r.size, url: r.url }])
    } catch (error) {
      alert('附件上传失败：' + error.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeAtt = (id) => {
    setAttIds((p) => p.filter((x) => x !== id))
    setAttFiles((p) => p.filter((x) => x.id !== id))
  }

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!boardSlug || !title.trim() || !content.trim()) {
      setErr('请选择板块并填写标题与内容')
      return
    }
    if (submitState !== 'idle') return
    setSubmitState('loading')
    try {
      const r = await api.post('/api/forum/posts', {
        boardSlug,
        title: title.trim(),
        content: content.trim(),
        tags: tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8),
        attachments: attIds.length ? attIds : undefined
      })
      setSubmitState('success')
      setTimeout(() => navigate(`/post/${r.id}`), 520)
    } catch (error) {
      setErr(error.message)
      setSubmitState('idle')
    }
  }

  return (
    <div>
      <h2 className="section-title">
        <Icon name="edit-3" size={18} />
        发布帖子
      </h2>
      <form className="card" onSubmit={submit}>
        <label className="field-label">板块</label>
        <select className="select" value={boardSlug} onChange={(e) => setBoardSlug(e.target.value)}>
          {boards.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.title}
            </option>
          ))}
        </select>
        <label className="field-label">标题</label>
        <input
          className="input"
          placeholder="一句话说清你的话题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="field-label">内容</label>
        <textarea
          className="textarea"
          placeholder="展开说说…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <label className="field-label">标签（逗号或空格分隔，最多 8 个）</label>
        <input
          className="input"
          placeholder="如：前端, 求助, 分享"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <label className="field-label">附件（可选，最多 10 个）</label>
        <div className="upload-row">
          <button type="button" className="btn-ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Icon name="paperclip" size={15} />
            {uploading ? '上传中…' : '添加附件'}
          </button>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={pickFile} />
        </div>
        {attFiles.length > 0 && (
          <div className="file-list">
            {attFiles.map((f) => (
              <div className="file-item" key={f.id}>
                <span className="fi-ic">
                  <Icon name="paperclip" size={15} />
                </span>
                <span className="fi-name">{f.name}</span>
                <span className="fi-size">{fmtSize(f.size)}</span>
                <button type="button" className="fi-remove" onClick={() => removeAtt(f.id)} title="移除">
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {err && <div className="error-text">{err}</div>}
        <MorphButton state={submitState} icon="send">
          发布
        </MorphButton>
      </form>
    </div>
  )
}
