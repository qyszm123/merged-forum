/**
 * 修炼之路全功能闭环测试
 * node scripts/smoke-train-full.js
 */
const FRONT = process.env.FRONT_URL || 'http://127.0.0.1:5173'
const API = process.env.API_URL || 'http://127.0.0.1:3100/api'
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const http = require('http')
const { CHAPTERS, allNodeKeys } = require('../src/data/trainCatalog')

const results = []
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}
async function step(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail: detail || '' })
    console.log(`✅ ${name}${detail ? ' — ' + detail : ''}`)
  } catch (err) {
    results.push({ name, ok: false, detail: err.message })
    console.log(`❌ ${name}: ${err.message}`)
  }
}

async function req(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, ok: res.ok, body, text }
}

async function api(method, p, token, body) {
  const { status, body: json } = await req(`${API}${p}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  if (status === 429) {
    await new Promise((r) => setTimeout(r, 1000))
    return api(method, p, token, body)
  }
  if (!json || json.code !== 0) {
    throw new Error(json?.message || `HTTP ${status}`)
  }
  return json.data
}

async function login(studentNo) {
  const d = await api('POST', '/auth/login', null, { studentNo, password: '123456' })
  assert(d.token, 'no token')
  return d.token
}

async function registerFresh() {
  const no = `7${Date.now().toString().slice(-9)}`
  try {
    return await api('POST', '/auth/register', null, {
      studentNo: no,
      password: '123456',
      displayName: `闭环测-${no.slice(-4)}`
    })
  } catch {
    return api('POST', '/auth/login', null, { studentNo: no, password: '123456' })
  }
}

function uploadFile(token, meta) {
  const tmp = path.join(__dirname, `_full_${Date.now()}.png`)
  fs.writeFileSync(tmp, Buffer.alloc(meta.tiny ? 100 : 4096, 9))
  const form = new FormData()
  form.append('file', fs.createReadStream(tmp), {
    filename: meta.name || 'work.png',
    contentType: meta.mime || 'image/png'
  })
  form.append('purpose', 'quest_work')
  form.append('pathId', meta.pathId)
  form.append('nodeId', meta.nodeId)
  if (meta.taskId) form.append('taskId', meta.taskId)
  const root = API.replace(/\/api\/?$/, '')
  return new Promise((resolve, reject) => {
    const u = new URL('/api/uploads', root)
    const r = http.request(
      u,
      { method: 'POST', headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` } },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            fs.unlinkSync(tmp)
          } catch {
            /* ignore */
          }
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (res.statusCode >= 400 || json.code !== 0) {
              reject(new Error(json.message || `upload ${res.statusCode}`))
              return
            }
            resolve(json.data)
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    r.on('error', reject)
    form.pipe(r)
  })
}

async function main() {
  console.log(`\n=== 修炼之路全功能闭环 ===\nFRONT=${FRONT}\nAPI=${API}\n`)

  let studentToken = ''
  let adminToken = ''
  let freshToken = ''

  await step('前端首页关键节点', async () => {
    const { status, text } = await req(FRONT + '/')
    assert(status === 200, `status ${status}`)
    const need = [
      'sect-hub-root',
      'view-identity-select',
      'hub-task-list',
      'hub-today-list',
      'view-quest',
      'view-quest-work',
      'view-quest-defense',
      'quest-map-thumb',
      'spirit-well',
      'gongfa-overlay',
      'view-admin-tasks',
      'hub-density.css',
      'train-question-banks.js'
    ]
    const miss = need.filter((k) => !String(text).includes(k))
    assert(!miss.length, `缺少: ${miss.join(', ')}`)
    return `${need.length} 节点齐`
  })

  await step('静态资源可加载', async () => {
    for (const p of [
      '/prototype.js',
      '/prototype.css',
      '/sect-path.css',
      '/hub-density.css',
      '/sect-path.js',
      '/train-question-banks.js'
    ]) {
      const { status } = await req(FRONT + p)
      assert(status === 200, `${p} => ${status}`)
    }
  })

  await step('前端 JS 含作品/答辩闭环关键字', async () => {
    const { text } = await req(FRONT + '/prototype.js')
    const keys = [
      '/train/work/submit',
      '/train/defense/submit',
      '/train/quiz/start',
      '/train/quiz/submit',
      'startQuizAttempt',
      'submitKpChallenge',
      'completeKpOnServer',
      '/train/explain',
      '/train/complete'
    ]
    const miss = keys.filter((k) => !String(text).includes(k))
    assert(!miss.length, `prototype.js 缺少: ${miss.join(', ')}`)
  })

  await step('Vite 代理 /api', async () => {
    const { status, body } = await req(`${FRONT}/api/health`)
    assert(status === 200 && body?.code === 0, JSON.stringify(body))
  })

  await step('学生/管理员登录', async () => {
    studentToken = await login('2026001')
    adminToken = await login('admin')
    const fresh = await registerFresh()
    freshToken = fresh.token
  })

  await step('目录 catalog 含计算机/物联网章节', async () => {
    const cat = await api('GET', '/train/catalog', freshToken)
    const net = cat.paths.find((p) => p.id === 'network')
    const hw = cat.paths.find((p) => p.id === 'hardware')
    assert(net?.chapters?.length === 7, `network chapters ${net?.chapters?.length}`)
    assert(hw?.chapters?.length === 6, `hardware chapters ${hw?.chapters?.length}`)
    const netKeys = allNodeKeys('network')
    const hwKeys = allNodeKeys('hardware')
    const netWork = CHAPTERS.network.flatMap((c) => c.nodes).filter((n) => n.type === 'work').length
    const hwWork = CHAPTERS.hardware.flatMap((c) => c.nodes).filter((n) => n.type === 'work').length
    assert(netWork >= 15, `计算机作品关过少 ${netWork}`)
    assert(hwWork >= 15, `物联网作品关过少 ${hwWork}`)
    return `网 ${netKeys.length}关/${netWork}作品 · 物 ${hwKeys.length}关/${hwWork}作品`
  })

  await step('地图 map + 顺序锁定', async () => {
    const map = await api('GET', '/train/map/hardware/beginner', freshToken)
    assert(Array.isArray(map.nodes) && map.nodes.length >= 3, 'map nodes')
    const first = map.nodes[0]
    assert(first.status === 'available' || first.status === 'done', `首关 status=${first.status}`)
    try {
      await api('POST', '/train/complete', freshToken, {
        pathId: 'hardware',
        tierId: 'beginner',
        nodeId: map.nodes[1].id,
        score: 90
      })
      throw new Error('乱序应失败')
    } catch (e) {
      if (String(e.message).includes('乱序应失败')) throw e
      return e.message
    }
  })

  await step('刷题关通关 complete(quiz) 需服务端测验', async () => {
    const start = await api('POST', '/train/quiz/start', freshToken, {
      pathId: 'hardware',
      tierId: 'beginner',
      taskId: 'hw-u1',
      nodeId: 'hw-survey',
      passScore: 50
    })
    assert(start.attemptId, 'attemptId')
    assert(!start.questions.some((q) => q.answer != null), 'answers leaked')
    // 读库取标准答案（仅测试）
    const mysql = require('mysql2/promise')
    const config = require('../src/config')
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
    const pack = JSON.parse(rows[0].questions_json)
    const graded = await api('POST', '/train/quiz/submit', freshToken, {
      attemptId: start.attemptId,
      answers: pack.map((q) => q.answer)
    })
    assert(graded.pass, 'should pass')
    const r = await api('POST', '/train/complete', freshToken, {
      pathId: 'hardware',
      tierId: 'beginner',
      nodeId: 'hw-survey',
      score: graded.score,
      quizAttemptId: start.attemptId
    })
    assert(r.node?.id === 'hw-survey', 'node mismatch')
    assert(r.pointsGain >= 20, 'points')
    return `+${r.pointsGain}✦`
  })

  await step('作品关无提交直接 complete 应拒绝', async () => {
    try {
      await api('POST', '/train/complete', freshToken, {
        pathId: 'hardware',
        tierId: 'beginner',
        nodeId: 'hw-arch',
        score: 90
      })
      throw new Error('应拒绝无作品通关')
    } catch (e) {
      if (String(e.message).includes('应拒绝')) throw e
      return e.message
    }
  })

  await step('机评失败（说明过短）', async () => {
    const up = await uploadFile(freshToken, { pathId: 'hardware', nodeId: 'hw-arch', taskId: 'hw-u1' })
    const sub = await api('POST', '/train/work/submit', freshToken, {
      pathId: 'hardware',
      tierId: 'beginner',
      taskId: 'hw-u1',
      nodeId: 'hw-arch',
      uploadId: up.id,
      note: '太短',
      requiresDefense: true
    })
    assert(sub.status === 'machine_failed', `status=${sub.status}`)
    assert(sub.review?.pass === false, 'should fail')
    return sub.review.summary
  })

  let workSubmissionId = 0
  let workUploadId = 0
  let defenseQs = []

  await step('机评通过 → 生成答辩题', async () => {
    const up = await uploadFile(freshToken, { pathId: 'hardware', nodeId: 'hw-arch', taskId: 'hw-u1' })
    workUploadId = up.id
    const note =
      '物联网的架构作品：感知层采集温湿度，网络层 Wi-Fi/MQTT 上报，应用层看板告警，用于校园物联化改造。'
    const sub = await api('POST', '/train/work/submit', freshToken, {
      pathId: 'hardware',
      tierId: 'beginner',
      taskId: 'hw-u1',
      nodeId: 'hw-arch',
      uploadId: up.id,
      note,
      requiresDefense: true,
      machinePassScore: 70
    })
    assert(sub.review?.pass, sub.review?.summary || 'machine fail')
    assert(sub.status === 'pending_defense', `status=${sub.status}`)
    assert(Array.isArray(sub.defenseQuestions) && sub.defenseQuestions.length >= 3, 'no defense qs')
    // 答案不应全是 0（已打乱）
    const answers = sub.defenseQuestions.map((q) => q.answer)
    workSubmissionId = sub.submissionId
    defenseQs = sub.defenseQuestions
    return `机评 ${sub.review.score} · 答辩 ${defenseQs.length} 题 · answers=${answers.join(',')}`
  })

  await step('答辩错题 → 不通过', async () => {
    const wrong = defenseQs.map((q) => (q.answer + 1) % (q.opts?.length || 3))
    const d = await api('POST', '/train/defense/submit', freshToken, {
      submissionId: workSubmissionId,
      answers: wrong,
      defensePassScore: 80
    })
    assert(d.pass === false, 'should fail')
    assert(d.status === 'defense_failed', d.status)
    return `${d.score} 分`
  })

  await step('答辩全对 → 通关', async () => {
    // 重新提交作品拿新 submission（失败态也可再答？接口允许 defense_failed 再交）
    const right = defenseQs.map((q) => q.answer)
    let d
    try {
      d = await api('POST', '/train/defense/submit', freshToken, {
        submissionId: workSubmissionId,
        answers: right,
        defensePassScore: 80
      })
    } catch {
      const up = await uploadFile(freshToken, { pathId: 'hardware', nodeId: 'hw-arch', taskId: 'hw-u1' })
      const note =
        '物联网的架构作品：感知层采集温湿度，网络层 Wi-Fi/MQTT 上报，应用层看板告警，用于校园物联化改造。'
      const sub = await api('POST', '/train/work/submit', freshToken, {
        pathId: 'hardware',
        tierId: 'beginner',
        taskId: 'hw-u1',
        nodeId: 'hw-arch',
        uploadId: up.id,
        note,
        requiresDefense: true
      })
      workSubmissionId = sub.submissionId
      workUploadId = up.id
      defenseQs = sub.defenseQuestions
      d = await api('POST', '/train/defense/submit', freshToken, {
        submissionId: workSubmissionId,
        answers: defenseQs.map((q) => q.answer),
        defensePassScore: 80
      })
    }
    assert(d.pass, `defense ${d.score}`)
    const done = await api('POST', '/train/complete', freshToken, {
      pathId: 'hardware',
      tierId: 'beginner',
      nodeId: 'hw-arch',
      score: d.score,
      submissionId: workSubmissionId,
      uploadId: workUploadId
    })
    assert(done.node?.id === 'hw-arch', 'complete node')
    return `答辩 ${d.score} → 通关 +${done.pointsGain}`
  })

  await step('AI 讲解 explain', async () => {
    const ex = await api('POST', '/train/explain', studentToken, {
      pathId: 'hardware',
      nodeId: 'hw-survey'
    })
    assert(ex.text && String(ex.text).length > 20, 'empty explain')
    return `${ex.source || '?'} · ${String(ex.text).slice(0, 40)}…`
  })

  await step('教材题库 banks', async () => {
    const all = await api('GET', '/train/banks', studentToken)
    assert((all.kpCount || 0) > 0 || (all.taskCount || 0) > 0, 'banks empty')
    const kp = await api('GET', '/train/banks?kpId=hw-survey', studentToken)
    assert(Array.isArray(kp.bank), 'kp bank')
    return `kpCount=${all.kpCount} taskCount=${all.taskCount} hw-survey=${kp.bank.length}`
  })

  await step('进度 progress 读写', async () => {
    await api('PUT', '/train/progress', studentToken, {
      pathId: 'network',
      cleared: ['net-birth', 'net-use'],
      trainTaskId: 'net-u1'
    })
    const g = await api('GET', '/train/progress?pathId=network', studentToken)
    assert(g.cleared?.includes('net-birth'), 'cleared')
    const all = await api('GET', '/train/progress/all', studentToken)
    assert(all.paths?.network, 'paths.network')
  })

  await step('PBL 管理：学生禁写 / 管理员可写可读', async () => {
    const { status } = await req(`${API}/train/pbl`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        pathId: 'hardware',
        taskId: 'hw-u1',
        title: 'x',
        def: { passScore: 80 }
      })
    })
    assert(status === 403, `student put => ${status}`)
    await api('PUT', '/train/pbl', adminToken, {
      pathId: 'hardware',
      taskId: 'hw-u1',
      title: '闭环·初识物联网',
      def: {
        kind: 'comprehensive',
        drillEnabled: true,
        practiceEnabled: true,
        defenseEnabled: true,
        passScore: 80,
        bank: [{ id: 'c1', q: '测', opts: ['a', 'b', 'c'], answer: 0 }]
      }
    })
    const got = await api('GET', '/train/pbl?pathId=hardware&taskId=hw-u1', studentToken)
    assert(got?.def?.passScore === 80, 'pbl read')
  })

  await step('商业副本无身份门禁', async () => {
    try {
      await api('POST', '/train/complete', freshToken, {
        pathId: 'business',
        tierId: 'beginner',
        nodeId: 'biz-user',
        score: 80
      })
      throw new Error('应拒绝')
    } catch (e) {
      if (String(e.message).includes('应拒绝')) throw e
      return e.message
    }
  })

  console.log('\n---')
  const ok = results.filter((r) => r.ok).length
  const bad = results.filter((r) => !r.ok)
  console.log(`合计 ${results.length}：通过 ${ok}，失败 ${bad.length}`)
  if (bad.length) {
    bad.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`))
    process.exit(1)
  }
  console.log('SMOKE_TRAIN_FULL_OK\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
