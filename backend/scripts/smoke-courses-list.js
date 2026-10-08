const http = require('http')

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 3056,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
        }
      },
      (res) => {
        let b = ''
        res.on('data', (c) => (b += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(b))
          } catch {
            resolve({ raw: b, status: res.statusCode })
          }
        })
      }
    )
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

;(async () => {
  const login = await req('POST', '/api/auth/login', { studentNo: '2026001', password: '123456' })
  const token = login.data && login.data.token
  if (!token) {
    console.log('login fail', login)
    process.exit(1)
  }
  const courses = await req('GET', '/api/train/courses', null, token)
  const list = (courses.data && courses.data.list) || []
  console.log(
    JSON.stringify(
      {
        code: courses.code,
        message: courses.message,
        count: list.length,
        items: list.map((c) => ({ id: c.id, title: c.title, visibility: c.visibility }))
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
