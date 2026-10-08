/**
 * 验证：规则无法判定主题时，走 DeepSeek 内容分
 * node scripts/smoke-work-ai-review.js
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const http = require('http')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3100'

function req(method, urlPath, { token, json, form } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE)
    const headers = { ...(form ? form.getHeaders() : { 'Content-Type': 'application/json' }) }
    if (token) headers.Authorization = `Bearer ${token}`
    const r = http.request(
      u,
      { method, headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let body = null
          try {
            body = JSON.parse(raw)
          } catch {
            body = { raw }
          }
          if (res.statusCode >= 400 || (body && body.code && body.code !== 0)) {
            reject(new Error(`${method} ${urlPath}: ${body?.message || raw}`))
            return
          }
          resolve(body?.data !== undefined ? body.data : body)
        })
      }
    )
    r.on('error', reject)
    if (form) form.pipe(r)
    else {
      r.write(JSON.stringify(json || {}))
      r.end()
    }
  })
}

async function main() {
  const login = await req('POST', '/api/auth/login', {
    json: { studentNo: '2026001', password: '123456' }
  })
  const token = login.token

  const tmp = path.join(__dirname, '_smoke-ai-work.bin')
  fs.writeFileSync(tmp, Buffer.alloc(4096, 7))
  const form = new FormData()
  form.append('file', fs.createReadStream(tmp), { filename: 'plan.png', contentType: 'image/png' })
  form.append('purpose', 'quest_work')
  form.append('pathId', 'hardware')
  form.append('nodeId', 'hw-arch')
  form.append('taskId', 'hw-u1')
  const uploaded = await req('POST', '/api/uploads', { token, form })

  // 故意不用关卡标题关键词，让规则 note_topic 判不定 → 触发 AI
  const note =
    '本次交付是一份校园场景下的分层示意与数据流草图：终端采集后经网关汇总，再到看板展示告警。说明了设备清单、接口约定与验收方式，方便老师检查是否可落地。'

  const submitted = await req('POST', '/api/train/work/submit', {
    token,
    json: {
      pathId: 'hardware',
      tierId: 'beginner',
      taskId: 'hw-u1',
      nodeId: 'hw-arch',
      uploadId: uploaded.id,
      note,
      requiresDefense: true,
      machinePassScore: 70
    }
  })

  const review = submitted.review || {}
  console.log('[smoke-work-ai]', {
    status: submitted.status,
    score: review.score,
    pass: review.pass,
    source: review.source,
    model: review.model || null,
    needsAi: review.needsAi,
    summary: review.summary,
    checks: (review.checks || []).map((c) => c.text)
  })

  if (review.source !== 'deepseek') {
    throw new Error(`期望 source=deepseek，实际 ${review.source}（请确认 DEEPSEEK_API_KEY）`)
  }
  console.log('[smoke-work-ai] ok')
  try {
    fs.unlinkSync(tmp)
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error('[smoke-work-ai] failed:', err.message)
  process.exit(1)
})
