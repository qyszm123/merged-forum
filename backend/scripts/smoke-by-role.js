/**
 * 分角色闭环验收：每个演示账号跑完其主责链路
 * node scripts/smoke-by-role.js
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'
const results = []

function pass(role, name, detail = '') {
  results.push({ ok: true, role, name, detail })
  console.log(`  ✓ [${role}] ${name}${detail ? ' — ' + detail : ''}`)
}
function fail(role, name, err) {
  const detail = err?.message || String(err)
  results.push({ ok: false, role, name, detail })
  console.log(`  ✗ [${role}] ${name} — ${detail}`)
}
function section(t) {
  console.log(`\n## ${t}`)
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
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.code !== 0) {
    const err = new Error(json.message || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return json.data
}

async function login(no) {
  return req('POST', '/auth/login', { studentNo: no, password: '123456' })
}

async function tryStep(role, name, fn) {
  try {
    const value = await fn()
    let detail = ''
    if (typeof value === 'string') detail = value
    else if (value && typeof value === 'object' && value.__detail) detail = value.__detail
    pass(role, name, detail)
    return value
  } catch (e) {
    fail(role, name, e)
    return null
  }
}

async function main() {
  console.log('\n=== 分角色闭环验收 ===\nAPI:', BASE)

  // —— 学生 2026001：从零修炼 ——
  section('学生 2026001 · 从零修炼')
  const s = await tryStep('学生', '登录', async () => {
    const d = await login('2026001')
    if (!d?.token) throw new Error('无 token')
    return {
      ...d,
      __detail: `积分 ${d.user?.points ?? d.user?.pointsBalance ?? '?'}`
    }
  })
  if (!s?.token) {
    console.log('学生登录失败，中止后续')
  } else {
    const t = s.token
    await tryStep('学生', '广场作品列表', async () => {
      const d = await req('GET', '/projects?pageSize=5', undefined, t)
      const n = d.list?.length ?? 0
      if (!n) throw new Error('无项目')
      return `${n} 条`
    })
    await tryStep('学生', '广场点子列表', async () => {
      const d = await req('GET', '/ideas?pageSize=5', undefined, t)
      return `${d.list?.length ?? 0} 条`
    })
    await tryStep('学生', '人才广场', async () => {
      const d = await req('GET', '/makers?pageSize=5', undefined, t)
      return `${d.list?.length ?? d.total ?? 0} 人`
    })
    await tryStep('学生', '论坛发帖', async () => {
      const boards = await req('GET', '/forum/boards', undefined, t)
      const slug = boards.find((b) => b.slug === 'qa')?.slug || boards[0]?.slug || 'general'
      const d = await req(
        'POST',
        '/forum/posts',
        { boardSlug: slug, title: '角色测-学生提问', content: '子网掩码怎么记？求一句话口诀。' },
        t
      )
      return `#${d.id || d.postId}`
    })
    await tryStep('学生', '官方副本目录含主线', async () => {
      const d = await req('GET', '/train/catalog', undefined, t)
      const ids = (d.paths || []).map((p) => p.id)
      for (const need of ['network', 'hardware', 'business']) {
        if (!ids.includes(need)) throw new Error(`缺 ${need}`)
      }
      return ids.filter((id) => !String(id).startsWith('c_')).join(',')
    })
    await tryStep('学生', '藏经阁课可见且不混入广场作品', async () => {
      const [cat, projects] = await Promise.all([
        req('GET', '/train/courses', undefined, t),
        req('GET', '/projects?pageSize=50', undefined, t)
      ])
      const courses = cat.list || cat.courses || []
      if (!courses.length) throw new Error('藏经阁无课')
      const titles = new Set((projects.list || []).map((p) => p.title))
      const leak = courses.filter((c) => titles.has(c.title))
      if (leak.length) throw new Error(`副本标题出现在广场: ${leak.map((c) => c.title).join(',')}`)
      return `课 ${courses.length} · 广场无泄漏`
    })
    await tryStep('学生', '官方主线闯关', async () => {
      const map = await req('GET', '/train/map/network/beginner', undefined, t)
      const node = (map.nodes || []).find((n) => n.status === 'available')
      if (!node) {
        const done = (map.nodes || []).find((n) => n.status === 'done')
        return done ? `已通 ${done.id}` : '暂无可刷'
      }
      if (node.type === 'quiz') {
        const mysql = require('mysql2/promise')
        const config = require('../src/config')
        const start = await req(
          'POST',
          '/train/quiz/start',
          {
            pathId: 'network',
            tierId: 'beginner',
            taskId: node.chapterId,
            nodeId: node.id,
            passScore: 50
          },
          t
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
          t
        )
        await req(
          'POST',
          '/train/complete',
          {
            pathId: 'network',
            tierId: 'beginner',
            nodeId: node.id,
            score: graded.score,
            quizAttemptId: start.attemptId
          },
          t
        )
        return `${node.id} via quiz`
      }
      await req(
        'POST',
        '/train/complete',
        { pathId: 'network', tierId: 'beginner', nodeId: node.id, score: 90 },
        t
      )
      return node.id
    })
    await tryStep('学生', '教师课 PBL 可拉取', async () => {
      const cat = await req('GET', '/train/courses', undefined, t)
      const listed = (cat.list || []).filter((c) => c.visibility && c.visibility !== 'draft')
      for (const course of listed.slice(0, 12)) {
        const pbl = await req('GET', `/train/pbl?pathId=${encodeURIComponent(course.id)}`, undefined, t)
        const list = Array.isArray(pbl) ? pbl : pbl.list || []
        if (list.length < 1) continue
        const withBank = list.filter((x) => (x.def?.bank || []).length >= 3)
        if (withBank.length) {
          return `${course.title} · ${list.length} 单元 · 有题库 ${withBank.length}`
        }
      }
      return '暂无已灌题库的教师课（由老师步骤创建验证）'
    })
    await tryStep('学生', '积分流水可读', async () => {
      const d = await req('GET', '/points/ledger?limit=5', undefined, t)
      const list = d.list || d || []
      return `${Array.isArray(list) ? list.length : 0} 条`
    })
  }

  // —— 点子王 2026002 ——
  section('点子王 2026002')
  const ideaUser = await tryStep('点子王', '登录', async () => {
    const d = await login('2026002')
    if (!d?.token) throw new Error('无 token')
    return { ...d, __detail: d.user?.displayName || 'ok' }
  })
  if (ideaUser?.token) {
    const t = ideaUser.token
    let ideaId
    await tryStep('点子王', '发布点子', async () => {
      const d = await req(
        'POST',
        '/ideas',
        {
          title: '角色测-校园饮水提醒',
          content: '喝水打卡防久坐，闭环测试点子内容',
          pathType: 'commission',
          openRecruit: true
        },
        t
      )
      ideaId = d.id
      return `#${d.id}`
    })
    await tryStep('点子王', '平台委托闭环', async () => {
      if (!ideaId) throw new Error('无点子')
      await req('POST', '/points/purchase', { amount: 5000 }, t)
      const d = await req('POST', `/ideas/${ideaId}/commission`, { rewardPoints: 3000 }, t)
      return `项目 #${d.projectId || d.project?.id || '?'}`
    })
  }

  // —— 项目方 2026003 ——
  section('项目方 2026003')
  const maker = await tryStep('项目方', '登录', async () => {
    const d = await login('2026003')
    if (!d?.token) throw new Error('无 token')
    return { ...d, __detail: d.user?.displayName || 'ok' }
  })
  if (maker?.token) {
    const t = maker.token
    let projectId
    await tryStep('项目方', '发布开放招募项目', async () => {
      const d = await req(
        'POST',
        '/projects',
        {
          title: '角色测-招人项目',
          summary: '缺前端',
          roles: ['前端'],
          acceptApplications: true,
          gate: 'creator'
        },
        t
      )
      projectId = d.id
      return `#${d.id}`
    })
    await tryStep('项目方', '发招人动态', async () => {
      if (!projectId) throw new Error('无项目')
      const d = await req(
        'POST',
        `/projects/${projectId}/recruit`,
        { role: '前端', body: '角色测招人说明，每周能投入 2 小时', syncPlaza: true, syncCommunity: true },
        t
      )
      if (!d.forumPostId) throw new Error('未同步社区')
      return `${d.line || 'ok'} · 社区#${d.forumPostId}`
    })
    await tryStep('项目方', '招人流可读', async () => {
      const d = await req('GET', '/projects/recruit-feed?pageSize=5', undefined, t)
      const list = d.list || d || []
      if (!list.length) throw new Error('空')
      return `${list.length} 条`
    })
    const student = await login('2026001')
    await tryStep('项目方', '学生申请→同意入队', async () => {
      if (!projectId) throw new Error('无项目')
      const app = await req('POST', `/projects/${projectId}/join`, { message: '角色测申请' }, student.token)
      const pending = await req('GET', `/projects/${projectId}/join-requests`, undefined, t)
      const reqRow =
        (pending.list || []).find((r) => r.status === 'pending') ||
        (pending.list || []).find((r) => Number(r.id) === Number(app.requestId)) ||
        pending.list?.[0]
      if (!reqRow) throw new Error('无待审申请')
      await req('POST', `/projects/${projectId}/join-requests/${reqRow.id}/approve`, {}, t)
      return `req=${reqRow.id}`
    })
    await tryStep('项目方', '回链积分', async () => {
      if (!projectId) throw new Error('无项目')
      await req('POST', `/projects/${projectId}/feedback`, { content: '角色测反馈：希望导出报告' }, t)
      const d = await req('POST', `/projects/${projectId}/backlink`, { entry: 'plaza' }, t)
      return `累计 ${d.backlinkCount ?? '?'}`
    })
  }

  // —— 信息老师 teacher ——
  section('信息老师 teacher')
  const teacher = await tryStep('老师', '登录', async () => {
    const d = await login('teacher')
    if (!d?.token) throw new Error('无 token')
    return { ...d, __detail: d.user?.displayName || d.user?.role || 'ok' }
  })
  if (teacher?.token) {
    const t = teacher.token
    let courseId
    let firstChapter
    await tryStep('老师', '创建完整副本（六单元+PBL）', async () => {
      const title = '角色测闭环课' + Date.now().toString(36).slice(-4)
      const d = await req(
        'POST',
        '/train/courses',
        {
          title,
          blurb: '角色测试自动生成',
          rewardIdentity: title + '通关',
          icon: '测',
          publish: true
        },
        t
      )
      courseId = d.id
      firstChapter = (d.chapters || [])[0]
      if ((d.chapters || []).length < 6) throw new Error(`章节不足: ${(d.chapters || []).length}`)
      const pbl = await req('GET', `/train/pbl?pathId=${encodeURIComponent(d.id)}`, undefined, t)
      const list = Array.isArray(pbl) ? pbl : []
      if (list.length < 6) throw new Error(`PBL 不足: ${list.length}`)
      return `${d.id} · ch=${d.chapters.length} · pbl=${list.length}`
    })
    await tryStep('老师', '收费设置', async () => {
      if (!courseId) throw new Error('无课')
      await req(
        'PUT',
        `/train/courses/${encodeURIComponent(courseId)}/pricing`,
        {
          pricingEnabled: true,
          freeForSchool: true,
          externalFeeYuan: 10,
          ownerSchool: '示范中学',
          setAsHomeSchool: true
        },
        t
      )
      return '10 元'
    })
    await tryStep('老师', '学生积分开通', async () => {
      if (!courseId) throw new Error('无课')
      const st = await login('2026002')
      const access0 = await req('GET', `/train/courses/${encodeURIComponent(courseId)}/access`, undefined, st.token)
      if (access0.allowed) return '已可进'
      const en = await req('POST', `/train/courses/${encodeURIComponent(courseId)}/enroll`, {}, st.token)
      return en.status || 'enrolled'
    })
    await tryStep('老师', '学生刷课第一关', async () => {
      if (!courseId || !firstChapter) throw new Error('无课')
      const st = await login('2026002')
      const node = (firstChapter.nodes || []).find((n) => n.type === 'quiz')
      if (!node) throw new Error('无 quiz 节点')
      // 教师课 complete 可能仍要求 quizAttempt；先尝试直接 complete，失败则走 quiz
      try {
        await req(
          'POST',
          '/train/complete',
          {
            pathId: courseId,
            tierId: firstChapter.tier || 'beginner',
            nodeId: node.id,
            score: 88
          },
          st.token
        )
        return node.id
      } catch (e) {
        if (!/刷题|测验|quiz/i.test(e.message)) throw e
        const mysql = require('mysql2/promise')
        const config = require('../src/config')
        const start = await req(
          'POST',
          '/train/quiz/start',
          {
            pathId: courseId,
            tierId: firstChapter.tier || 'beginner',
            taskId: firstChapter.id,
            nodeId: node.id,
            passScore: 50
          },
          st.token
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
          st.token
        )
        await req(
          'POST',
          '/train/complete',
          {
            pathId: courseId,
            tierId: firstChapter.tier || 'beginner',
            nodeId: node.id,
            score: graded.score,
            quizAttemptId: start.attemptId
          },
          st.token
        )
        return `${node.id} via quiz`
      }
    })
  }

  // —— 管理员 admin ——
  section('管理员 admin')
  const admin = await tryStep('管理员', '登录', async () => {
    const d = await login('admin')
    if (!d?.token) throw new Error('无 token')
    return { ...d, __detail: d.user?.role || 'ok' }
  })
  if (admin?.token) {
    const t = admin.token
    await tryStep('管理员', '解锁 3D 打印', async () => {
      await req('POST', '/admin/unlock-print', {}, t)
      return 'ok'
    })
    await tryStep('管理员', '学校强制开课', async () => {
      await req('POST', '/admin/school-force', { grade: '七年级', forceTrain: true }, t)
      return '七年级'
    })
    await tryStep('管理员', '手动赋身份', async () => {
      await req('POST', '/admin/grant', { studentNo: '2026001', identity: '角色测认证' }, t)
      return '2026001'
    })
    await tryStep('管理员', '黑客松导入', async () => {
      await req(
        'POST',
        '/admin/import-hackathon',
        { studentNos: ['2026001', '2026002'], tag: '黑客松选手' },
        t
      )
      return '2 人'
    })
    await tryStep('管理员', '给教师课授官方身份', async () => {
      const courses = await req('GET', '/train/courses', undefined, t)
      const list = courses.list || []
      const c = list.find((x) => String(x.id).startsWith('c_')) || list[0]
      if (!c) throw new Error('无教师课')
      await req(
        'PUT',
        `/train/courses/${encodeURIComponent(c.id)}/identity`,
        {
          rewardIdentity: c.rewardIdentity || c.title,
          identityCertified: true,
          grantsCreator: false
        },
        t
      )
      return c.title
    })
  }

  // —— 权限负向 ——
  section('权限负向')
  await tryStep('权限', '学生不可创建副本', async () => {
    const st = await login('2026001')
    try {
      await req(
        'POST',
        '/train/courses',
        { title: '非法课', blurb: 'x', rewardIdentity: 'x', publish: false },
        st.token
      )
      throw new Error('应拒绝却成功')
    } catch (e) {
      if (/应拒绝/.test(e.message)) throw e
      return e.message
    }
  })
  await tryStep('权限', '老师不可学校开课', async () => {
    const te = await login('teacher')
    try {
      await req('POST', '/admin/school-force', { grade: '八年级' }, te.token)
      throw new Error('应拒绝却成功')
    } catch (e) {
      if (/应拒绝/.test(e.message)) throw e
      return e.message
    }
  })

  const ok = results.filter((r) => r.ok).length
  const bad = results.filter((r) => !r.ok).length
  console.log(`\n=== 汇总 ===\n通过 ${ok}  · 失败 ${bad}  · 共 ${results.length}`)
  if (bad) {
    console.log('\n失败项:')
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - [${r.role}] ${r.name}: ${r.detail}`))
    process.exit(1)
  }
  console.log('分角色全部闭环通过。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
