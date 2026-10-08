/**
 * kcsquare 修炼 / 论坛相关冒烟测试（API + 静态页关键节点）
 * 用法：node scripts/smoke-train.js
 */
const FRONT = process.env.FRONT_URL || 'http://localhost:5173'
const API = process.env.API_URL || 'http://localhost:3100/api'

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const results = []

async function step(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`✅ ${name}`)
  } catch (err) {
    results.push({ name, ok: false, error: err.message })
    console.log(`❌ ${name}: ${err.message}`)
  }
}

async function login(studentNo) {
  const { status, body } = await req(`${API}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ studentNo, password: '123456' })
  })
  assert(status === 200 && body?.code === 0, `login ${studentNo} failed: ${JSON.stringify(body)}`)
  assert(body.data?.token, 'missing token')
  return body.data.token
}

async function main() {
  console.log(`FRONT=${FRONT}`)
  console.log(`API=${API}`)
  console.log('---')

  await step('前端首页可访问', async () => {
    const { status, text } = await req(FRONT + '/')
    assert(status === 200, `status ${status}`)
    assert(String(text).includes('sect-hub-root'), '缺少 sect-hub-root')
    assert(String(text).includes('dungeon-hub-root'), '缺少选副本壳 dungeon-hub-root')
    assert(String(text).includes('dungeon-simple'), '缺少简洁选副本 dungeon-simple')
    assert(String(text).includes('hub-minimap'), '缺少功法缩略 hub-minimap')
    assert(String(text).includes('gongfa-overlay'), '缺少完整功法 overlay')
    assert(String(text).includes('view-admin-tasks'), '缺少任务编排后台')
    assert(String(text).includes('view-quest-defense'), '缺少答辩页')
    assert(String(text).includes('hub-density.css'), '未引入 hub-density.css')
    assert(String(text).includes('quest-map-thumb'), '缺少任务地图缩略')
    assert(String(text).includes('exam-quiz--work'), '缺少作品闯关排版')
  })

  await step('关键静态资源可加载', async () => {
    for (const p of [
      '/prototype.js',
      '/prototype.css',
      '/sect-path.css',
      '/hub-density.css',
      '/sect-path.js'
    ]) {
      const { status } = await req(FRONT + p)
      assert(status === 200, `${p} => ${status}`)
    }
  })

  await step('后端 health', async () => {
    const { status, body } = await req(`${API}/health`)
    assert(status === 200 && body?.code === 0, JSON.stringify(body))
  })

  let studentToken = ''
  let adminToken = ''

  await step('学生登录 2026001', async () => {
    studentToken = await login('2026001')
  })

  await step('管理员登录 admin', async () => {
    adminToken = await login('admin')
  })

  await step('写入修炼进度 PUT /train/progress', async () => {
    const cleared = ['net-birth', 'net-use', 'smoke-kp-' + Date.now()]
    const { status, body } = await req(`${API}/train/progress`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        pathId: 'network',
        cleared,
        trainTaskId: 'net-u1'
      })
    })
    assert(status === 200 && body?.code === 0, JSON.stringify(body))
    assert(Array.isArray(body.data?.cleared), 'cleared missing')
    assert(body.data.cleared.includes('net-birth'), 'cleared not saved')
  })

  await step('读取修炼进度 GET /train/progress', async () => {
    const { status, body } = await req(`${API}/train/progress?pathId=network`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    })
    assert(status === 200 && body?.code === 0, JSON.stringify(body))
    assert(body.data?.pathId === 'network', 'pathId mismatch')
    assert(body.data?.cleared?.length >= 2, 'cleared too short')
  })

  await step('读取全部进度 GET /train/progress/all', async () => {
    const { status, body } = await req(`${API}/train/progress/all`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    })
    assert(status === 200 && body?.code === 0, JSON.stringify(body))
    assert(body.data?.paths?.network, 'network path missing')
  })

  await step('学生无权写任务规则（应 403）', async () => {
    const { status, body } = await req(`${API}/train/pbl`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        pathId: 'hardware',
        taskId: 'hw-u1',
        title: '冒烟测试任务',
        def: { drillEnabled: true, passScore: 80, bank: [] }
      })
    })
    assert(status === 403 || body?.code === 403, `expected 403 got ${status} ${JSON.stringify(body)}`)
  })

  await step('管理员保存任务规则', async () => {
    const def = {
      pathId: 'hardware',
      taskId: 'hw-u1',
      title: '冒烟·初识物联网',
      kind: 'comprehensive',
      drillEnabled: true,
      practiceEnabled: true,
      passScore: 80,
      defenseEnabled: true,
      defensePassScore: 80,
      bank: [
        {
          id: 'smoke-1',
          q: '冒烟题：通关分数线默认？',
          opts: ['80 分', '60 分', '100 分'],
          answer: 0,
          kpId: 'hw-survey'
        }
      ],
      acceptTypes: ['design', 'ppt'],
      guideEnabled: true,
      guideLines: ['冒烟攻略']
    }
    const { status, body } = await req(`${API}/train/pbl`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        pathId: def.pathId,
        taskId: def.taskId,
        title: def.title,
        def
      })
    })
    assert(status === 200 && body?.code === 0, JSON.stringify(body))
  })

  await step('读取任务规则 GET /train/pbl', async () => {
    const { status, body } = await req(`${API}/train/pbl?pathId=hardware&taskId=hw-u1`)
    assert(status === 200 && body?.code === 0, JSON.stringify(body))
    assert(body.data?.taskId === 'hw-u1', 'taskId mismatch')
    assert(body.data?.def?.passScore === 80, 'passScore mismatch')
    assert(Array.isArray(body.data?.def?.bank) && body.data.def.bank.length >= 1, 'bank empty')
  })

  await step('论坛列表仍可用', async () => {
    const { status, body } = await req(`${API}/forum/posts?pageSize=5`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    })
    assert(status === 200 && body?.code === 0, JSON.stringify(body))
    assert(Array.isArray(body.data?.list) || Array.isArray(body.data), 'list missing')
  })

  await step('Vite 代理 /api 可用', async () => {
    const { status, body } = await req(`${FRONT}/api/health`)
    assert(status === 200 && body?.code === 0, JSON.stringify(body))
  })

  console.log('---')
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  console.log(`合计 ${results.length} 项：通过 ${passed}，失败 ${failed.length}`)
  if (failed.length) {
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.error}`))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
