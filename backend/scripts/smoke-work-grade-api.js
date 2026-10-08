require('dotenv').config()
async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`http://127.0.0.1:3056/api${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  })
  const json = await res.json()
  if (json.code !== 0) throw new Error(`${method} ${path} => ${json.message}`)
  return json.data
}
;(async () => {
  const t = await req('POST', '/auth/login', { studentNo: 'teacher', password: '123456' })
  const list = await req('GET', '/train/work/submissions?status=pending_teacher', undefined, t.token)
  console.log('teacher pending total=', list.total)
  const s = await req('POST', '/auth/login', { studentNo: '2026001', password: '123456' })
  const latest = await req('GET', '/train/work/latest?pathId=network&nodeId=n1', undefined, s.token)
  console.log('student latest=', latest.submission?.status || null)
  console.log('ok')
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
