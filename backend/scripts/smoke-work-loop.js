/**
 * 作品机评 → 答辩 → 通关 烟雾测试
 * node scripts/smoke-work-loop.js
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
          if (res.statusCode >= 400) {
            reject(new Error(`${method} ${urlPath} ${res.statusCode}: ${body?.message || raw}`))
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
  console.log('login ok', login.user?.displayName || login.user?.studentNo)

  const tmp = path.join(__dirname, '_smoke-work.txt')
  fs.writeFileSync(
    tmp,
    '物联网的架构作品说明：感知层采集、网络层传输、应用层展示。本方案用于校园物联化改造，含设备清单与数据流。',
    'utf8'
  )
  const form = new FormData()
  form.append('file', fs.createReadStream(tmp), { filename: 'arch-plan.txt', contentType: 'text/plain' })
  form.append('purpose', 'quest_work')
  form.append('pathId', 'hardware')
  form.append('nodeId', 'hw-arch')
  form.append('taskId', 'hw-u1')
  // text/plain may fail type check - use png-like fake
  fs.writeFileSync(tmp, Buffer.alloc(4096, 1))
  const form2 = new FormData()
  form2.append('file', fs.createReadStream(tmp), { filename: 'arch.png', contentType: 'image/png' })
  form2.append('purpose', 'quest_work')
  form2.append('pathId', 'hardware')
  form2.append('nodeId', 'hw-arch')
  form2.append('taskId', 'hw-u1')

  const uploaded = await req('POST', '/api/uploads', { token, form: form2 })
  console.log('upload', uploaded.id, uploaded.originalName)

  const note =
    '物联网的架构：感知层温湿度传感，网络层 Wi-Fi/MQTT 上报，应用层看板告警。用于校园物联化改造验收。'
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
  console.log('work submit', submitted.status, submitted.review?.score, 'qs', submitted.defenseQuestions?.length)
  if (!submitted.review?.pass) throw new Error('machine review should pass')

  const answers = (submitted.defenseQuestions || []).map((q) => q.answer)
  const defense = await req('POST', '/api/train/defense/submit', {
    token,
    json: {
      submissionId: submitted.submissionId,
      answers,
      defensePassScore: 80
    }
  })
  console.log('defense', defense.status, defense.score)
  if (!defense.pass) throw new Error('defense should pass with correct answers')

  // Ensure previous node cleared for order - hw-survey before hw-arch
  try {
    await req('POST', '/api/train/complete', {
      token,
      json: { pathId: 'hardware', tierId: 'beginner', nodeId: 'hw-survey', score: 90 }
    })
    console.log('preclear hw-survey ok')
  } catch (e) {
    console.log('preclear hw-survey', e.message)
  }

  const done = await req('POST', '/api/train/complete', {
    token,
    json: {
      pathId: 'hardware',
      tierId: 'beginner',
      nodeId: 'hw-arch',
      score: defense.score,
      submissionId: submitted.submissionId,
      uploadId: uploaded.id
    }
  })
  console.log('complete', done.node?.name, 'points', done.pointsGain)
  fs.unlinkSync(tmp)
  console.log('SMOKE_WORK_OK')
}

main().catch((err) => {
  console.error('SMOKE_WORK_FAIL', err.message)
  process.exit(1)
})
