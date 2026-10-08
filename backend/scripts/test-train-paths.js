/**
 * 计算机 + 物联网 全路径闯关闭环测试
 * node scripts/test-train-paths.js
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'
const { CHAPTERS, allNodeKeys, listNodes } = require('../src/data/trainCatalog')

const results = []
function pass(name, detail = '') {
  results.push({ ok: true, name, detail })
  console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`)
}
function fail(name, err) {
  const detail = err?.message || String(err)
  results.push({ ok: false, name, detail })
  console.log(`  ✗ ${name} — ${detail}`)
}

async function req(method, path, body, token) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  let json
  try {
    json = await res.json()
  } catch {
    throw new Error(`HTTP ${res.status} 非 JSON`)
  }
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1200))
    return req(method, path, body, token)
  }
  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || `HTTP ${res.status}`)
  }
  return json.data
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const http = require('http')

async function uploadPng(token, { pathId, nodeId, taskId }) {
  const tmp = path.join(__dirname, `_tp_${Date.now()}.png`)
  fs.writeFileSync(tmp, Buffer.alloc(4096, 7))
  const form = new FormData()
  form.append('file', fs.createReadStream(tmp), { filename: 'work.png', contentType: 'image/png' })
  form.append('purpose', 'quest_work')
  form.append('pathId', pathId)
  form.append('nodeId', nodeId)
  if (taskId) form.append('taskId', taskId)
  const apiRoot = BASE.replace(/\/api\/?$/, '')
  const data = await new Promise((resolve, reject) => {
    const u = new URL('/api/uploads', apiRoot || 'http://127.0.0.1:3100')
    const r = http.request(
      u,
      { method: 'POST', headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` } },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (res.statusCode >= 400 || json.code !== 0) {
              reject(new Error(json.message || `upload ${res.statusCode}`))
              return
            }
            resolve(json.data)
          } catch (e) {
            reject(e)
          } finally {
            try {
              fs.unlinkSync(tmp)
            } catch {
              /* ignore */
            }
          }
        })
      }
    )
    r.on('error', reject)
    form.pipe(r)
  })
  return data
}

async function completeQuizNode(token, { pathId, tierId, nodeId, taskId }) {
  const mysql = require('mysql2/promise')
  const config = require('../src/config')
  const start = await req(
    'POST',
    '/train/quiz/start',
    {
      pathId,
      tierId,
      taskId: taskId || nodeId,
      nodeId,
      passScore: 50
    },
    token
  )
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  })
  const [rows] = await conn.query(`SELECT questions_json FROM train_quiz_attempts WHERE id=?`, [
    start.attemptId
  ])
  await conn.end()
  const pack = JSON.parse(rows[0].questions_json || '[]')
  const graded = await req(
    'POST',
    '/train/quiz/submit',
    { attemptId: start.attemptId, answers: pack.map((q) => q.answer) },
    token
  )
  if (!graded.pass) throw new Error(`刷题未通过 ${nodeId}: ${graded.score}`)
  return { quizAttemptId: start.attemptId, score: graded.score }
}

async function completeWorkNode(token, { pathId, tierId, nodeId, nodeName }) {
  const uploaded = await uploadPng(token, { pathId, nodeId })
  const note = `${nodeName || nodeId}：本关作品说明包含目标、做法与交付物，用于机评点题与答辩生成。长度足够。`
  const submitted = await req(
    'POST',
    '/train/work/submit',
    {
      pathId,
      tierId,
      nodeId,
      uploadId: uploaded.id,
      note,
      requiresDefense: true,
      machinePassScore: 70
    },
    token
  )
  if (!submitted.review?.pass) {
    throw new Error(`机评未通过 ${nodeId}: ${submitted.review?.summary || submitted.status}`)
  }
  let status = submitted.status
  let score = submitted.review.score
  if (status === 'pending_defense') {
    const answers = (submitted.defenseQuestions || []).map((q) => q.answer)
    const defense = await req(
      'POST',
      '/train/defense/submit',
      { submissionId: submitted.submissionId, answers, defensePassScore: 80 },
      token
    )
    if (!defense.pass) throw new Error(`答辩未通过 ${nodeId}: ${defense.score}`)
    status = defense.status
    score = defense.score
  }
  return { submissionId: submitted.submissionId, uploadId: uploaded.id, score, status }
}

async function ensureFreshUser(adminToken, studentNo) {
  // 注册新号；若已存在则登录后用管理员无法清进度时，换时间戳账号
  const password = '123456'
  const no = studentNo
  try {
    const d = await req('POST', '/auth/register', {
      studentNo: no,
      password,
      displayName: `教材测-${no.slice(-4)}`
    })
    return d
  } catch {
    try {
      return await req('POST', '/auth/login', { studentNo: no, password })
    } catch (e) {
      throw e
    }
  }
}

async function clearProgressViaDb(userId) {
  // 可选：若有管理接口则跳过；本测试用全新学号避免旧进度
  return userId
}

async function runPath(token, pathId, expectBadge) {
  const catalog = await req('GET', '/train/catalog', undefined, token)
  const pathMeta = catalog.paths.find((p) => p.id === pathId)
  if (!pathMeta) throw new Error(`catalog 无 ${pathId}`)
  if (!pathMeta.chapters?.length) throw new Error(`${pathId} 未下发 chapters`)
  pass(`${pathId} catalog 章节`, `${pathMeta.chapters.length} 单元`)

  // 章节名应含教材关键词
  const nameBlob = pathMeta.chapters.map((c) => c.name).join('|')
  if (pathId === 'network') {
    if (!nameBlob.includes('互联网') && !nameBlob.includes('非遗') && !nameBlob.includes('生成式')) {
      throw new Error('计算机章节名未体现教材主题')
    }
  }
  if (pathId === 'hardware') {
    if (!nameBlob.includes('物联网') && !nameBlob.includes('感知')) {
      throw new Error('物联网章节名未体现教材主题')
    }
  }

  const keys = allNodeKeys(pathId)
  let lastEarned = []
  let pointsBefore = (await req('GET', '/auth/me', undefined, token)).points

  // 未完成初级时，中级应锁定
  const midMap = await req('GET', `/train/map/${pathId}/intermediate`, undefined, token)
  const midLocked = midMap.nodes.every((n) => n.status === 'locked' || n.status === 'done')
  const beginnerDone = listNodes(pathId, 'beginner').every((n) =>
    (catalog.progress || []).some((p) => p.pathId === pathId && p.nodeId === n.id && p.status === 'done')
  )
  if (!beginnerDone) {
    const firstMid = midMap.nodes[0]
    if (firstMid && firstMid.status === 'available') {
      throw new Error('初级未通时中级首关不应 available')
    }
    pass(`${pathId} 跨级别锁定`, '初级未通 → 中级锁定')
  } else {
    pass(`${pathId} 跨级别锁定`, '初级已通，跳过锁定检查')
  }

  // 乱序：跳过第一关直接打第二关应失败（若第一关未完成）
  const beg = listNodes(pathId, 'beginner')
  if (beg.length >= 2) {
    const doneIds = new Set(
      (catalog.progress || []).filter((p) => p.pathId === pathId && p.status === 'done').map((p) => p.nodeId)
    )
    if (!doneIds.has(beg[0].id) && !doneIds.has(beg[1].id)) {
      try {
        await req(
          'POST',
          '/train/complete',
          { pathId, tierId: 'beginner', nodeId: beg[1].id, score: 90 },
          token
        )
        throw new Error('乱序闯关应被拒绝')
      } catch (e) {
        if (String(e.message).includes('乱序闯关应被拒绝')) throw e
        pass(`${pathId} 顺序校验`, e.message)
      }
    }
  }

  for (const k of keys) {
    const map = await req('GET', `/train/map/${pathId}/${k.tierId}`, undefined, token)
    const node = map.nodes.find((n) => n.id === k.nodeId)
    if (!node) throw new Error(`地图缺少 ${k.nodeId}`)
    if (node.status === 'done') continue
    if (node.status === 'locked') {
      throw new Error(`关卡仍锁定: ${k.tierId}/${k.nodeId}`)
    }

    let score = 90
    let submissionId
    let uploadId
    let quizAttemptId
    // 刷题关：必须先服务端组卷判分
    if (node.type === 'quiz') {
      const closed = await completeQuizNode(token, {
        pathId,
        tierId: k.tierId,
        nodeId: k.nodeId,
        taskId: node.chapterId || k.chapterId
      })
      score = closed.score
      quizAttemptId = closed.quizAttemptId
    }
    // 作品关：必须先机评(+答辩)再通关
    if (node.type === 'work') {
      const closed = await completeWorkNode(token, {
        pathId,
        tierId: k.tierId,
        nodeId: k.nodeId,
        nodeName: node.name
      })
      score = closed.score
      submissionId = closed.submissionId
      uploadId = closed.uploadId
    }

    const payload = { pathId, tierId: k.tierId, nodeId: k.nodeId, score }
    if (submissionId) payload.submissionId = submissionId
    if (uploadId) payload.uploadId = uploadId
    if (quizAttemptId) payload.quizAttemptId = quizAttemptId
    const r = await req('POST', '/train/complete', payload, token)
    if (r.earned?.length) lastEarned = r.earned
    if (k.nodeId === keys[keys.length - 1].nodeId) {
      if (!r.pathDone) throw new Error('最后一关后 pathDone 应为 true')
      if (!r.earned?.includes(expectBadge)) {
        throw new Error(`未发放身份 ${expectBadge}，实际 ${JSON.stringify(r.earned)}`)
      }
      if (!r.earned?.includes('创造者')) throw new Error('未发放创造者')
    }
    await sleep(20)
  }

  const me = await req('GET', '/auth/me', undefined, token)
  if (!me.identities?.includes(expectBadge)) throw new Error(`me 无 ${expectBadge}`)
  if (!me.identities?.includes('创造者')) throw new Error('me 无创造者')
  const gain = me.points - pointsBefore
  pass(`${pathId} 全路径通关`, `身份 ${expectBadge}+创造者，积分 +${gain}`)

  // 通关后可组队验证（需有招人项目）
  const list = await req('GET', '/projects?pageSize=50', undefined, token)
  const joinable = (list.list || []).find((p) => p.status === 'recruiting')
  if (joinable) {
    try {
      await req('POST', `/projects/${joinable.id}/join`, {}, token)
      pass(`${pathId} 通关后组队`, `加入项目 ${joinable.id}`)
    } catch (e) {
      if (/已在|重复/.test(e.message)) pass(`${pathId} 通关后组队`, e.message)
      else throw e
    }
  } else {
    pass(`${pathId} 通关后组队`, '暂无招募项目，跳过入队')
  }

  return { lastEarned, points: me.points }
}

async function main() {
  console.log('\n=== 教材副本全路径测试（计算机 / 物联网）===\n')

  let admin
  try {
    admin = await req('POST', '/auth/login', { studentNo: 'admin', password: '123456' })
    pass('管理员登录')
  } catch (e) {
    fail('管理员登录', e)
    process.exit(1)
  }

  const stamp = Date.now().toString().slice(-8)
  const netNo = `9${stamp}1`.slice(0, 10)
  const hwNo = `9${stamp}2`.slice(0, 10)

  console.log('\n[1] 目录一致性')
  try {
    const netCh = CHAPTERS.network.length
    const hwCh = CHAPTERS.hardware.length
    if (netCh !== 7) throw new Error(`计算机应为 7 单元，实际 ${netCh}`)
    if (hwCh !== 6) throw new Error(`物联网应为 6 单元，实际 ${hwCh}`)
    const netNodes = allNodeKeys('network').length
    const hwNodes = allNodeKeys('hardware').length
    pass('教材单元数', `计算机 ${netCh} 单元 / ${netNodes} 关；物联网 ${hwCh} 单元 / ${hwNodes} 关`)
  } catch (e) {
    fail('目录一致性', e)
  }

  console.log('\n[2] 计算机全路径')
  try {
    const netUser = await ensureFreshUser(admin.token, netNo)
    await clearProgressViaDb(netUser.user?.id)
    await runPath(netUser.token, 'network', '网络入门')
  } catch (e) {
    fail('计算机全路径', e)
  }

  console.log('\n[3] 物联网全路径')
  try {
    const hwUser = await ensureFreshUser(admin.token, hwNo)
    await runPath(hwUser.token, 'hardware', '硬件入门')
  } catch (e) {
    fail('物联网全路径', e)
  }

  console.log('\n[4] 跨路径门禁')
  try {
    const stamp2 = Date.now().toString().slice(-7)
    const u = await ensureFreshUser(admin.token, `8${stamp2}`)
    const token = u.token
    // 商业副本应拒绝（无入门身份）
    try {
      await req(
        'POST',
        '/train/complete',
        { pathId: 'business', tierId: 'beginner', nodeId: 'biz-user', score: 80 },
        token
      )
      throw new Error('无身份不应通商业关')
    } catch (e) {
      if (String(e.message).includes('无身份不应')) throw e
      pass('商业副本门禁', e.message)
    }
  } catch (e) {
    fail('跨路径门禁', e)
  }

  const ok = results.filter((r) => r.ok).length
  const bad = results.filter((r) => !r.ok).length
  console.log(`\n=== 结果：${ok} 通过 / ${bad} 失败 ===\n`)
  process.exit(bad ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
