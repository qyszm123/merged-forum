/**
 * 上传闭环冒烟
 * node scripts/smoke-upload.js
 */
const API = process.env.API_URL || 'http://127.0.0.1:3100/api'
const fs = require('fs')
const path = require('path')
const { Blob } = require('buffer')

async function main() {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentNo: '2026001', password: '123456' })
  })
  const loginJson = await loginRes.json()
  if (!loginRes.ok || loginJson.code !== 0) throw new Error('login failed: ' + JSON.stringify(loginJson))
  const token = loginJson.data.token

  const tmp = path.join(__dirname, '../uploads/_smoke.txt')
  fs.mkdirSync(path.dirname(tmp), { recursive: true })
  fs.writeFileSync(tmp, `smoke upload ${new Date().toISOString()}\n`, 'utf8')
  const buf = fs.readFileSync(tmp)
  const fd = new FormData()
  // purpose 等字段先于 file，兼容旧逻辑；服务端也会在落盘后按 purpose 挪目录
  fd.append('purpose', 'quest_work')
  fd.append('pathId', 'hardware')
  fd.append('nodeId', 'hw-smoke')
  fd.append('taskId', 'hw-u1')
  fd.append('file', new Blob([buf], { type: 'text/plain' }), 'smoke-work.txt')

  const upRes = await fetch(`${API}/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd
  })
  const upJson = await upRes.json()
  if (!upRes.ok || upJson.code !== 0) throw new Error('upload failed: ' + JSON.stringify(upJson))
  console.log('upload ok', upJson.data)

  const fileRes = await fetch(`${API}/uploads/${upJson.data.id}/file`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!fileRes.ok) throw new Error('download failed ' + fileRes.status)
  const text = await fileRes.text()
  if (!text.includes('smoke upload')) throw new Error('file content mismatch')
  console.log('download ok, bytes', text.length)

  const mine = await fetch(`${API}/uploads/mine?purpose=quest_work`, {
    headers: { Authorization: `Bearer ${token}` }
  }).then((r) => r.json())
  if (mine.code !== 0 || !mine.data.list?.length) throw new Error('mine list empty')
  console.log('mine ok', mine.data.list.length)

  fs.unlinkSync(tmp)
  console.log('SMOKE UPLOAD PASS')
}

main().catch((e) => {
  console.error('SMOKE UPLOAD FAIL', e.message)
  process.exit(1)
})
