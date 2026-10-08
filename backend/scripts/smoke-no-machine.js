const http = require('http')
const mysql = require('mysql2/promise')

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
  const token = login.data && (login.data.token || login.data.accessToken)
  if (!token) {
    console.log('login fail', login)
    process.exit(1)
  }
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'kcsquare',
    password: 'KcSq3181_Deploy!',
    database: 'kcsquare'
  })
  const [ups] = await conn.query(
    `SELECT id, path_id, node_id FROM uploads
     WHERE user_id=(SELECT id FROM users WHERE student_no=?)
     ORDER BY id DESC LIMIT 1`,
    ['2026001']
  )
  if (!ups.length) {
    console.log('no upload for student')
    await conn.end()
    process.exit(0)
  }
  const u = ups[0]
  const sub = await req(
    'POST',
    '/api/train/work/submit',
    {
      pathId: u.path_id || 'network',
      tierId: 'beginner',
      nodeId: u.node_id || 'net-b1-w1',
      uploadId: u.id,
      note: 'teacher-only smoke',
      requiresDefense: false
    },
    token
  )
  console.log(
    JSON.stringify(
      {
        code: sub.code,
        message: sub.message,
        status: sub.data?.status,
        awaitsTeacher: sub.data?.awaitsTeacher,
        summary: sub.data?.review?.summary
      },
      null,
      2
    )
  )
  await conn.end()
  if (sub.data?.status !== 'pending_teacher') process.exit(1)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
