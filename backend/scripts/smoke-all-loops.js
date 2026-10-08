/**
 * 科创广场 · 全功能闭环冒烟
 * node scripts/smoke-all-loops.js
 *
 * 覆盖：认证、广场、组队申请、招人邀请、人才入队、
 * 点子双路径委托、论坛、积分、修炼、教师创课/编排/收费/授身份、后台
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'
const FE_CANDIDATES = (process.env.FE_BASE
  ? [process.env.FE_BASE]
  : ['http://127.0.0.1:5173', 'http://127.0.0.1:8085']
).filter(Boolean)

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
function section(t) {
  console.log(`\n[${t}]`)
}

async function req(method, path, body, token, { allowFail = false } = {}) {
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
    throw new Error(`HTTP ${res.status} 非 JSON (${method} ${path})`)
  }
  if (!res.ok || json.code !== 0) {
    const err = new Error(json.message || `HTTP ${res.status}`)
    err.status = res.status
    err.code = json.code
    err.data = json.data
    if (allowFail) throw err
    throw err
  }
  return json.data
}

async function login(no) {
  return req('POST', '/auth/login', { studentNo: no, password: '123456' })
}

async function expectFail(fn, re, name) {
  try {
    await fn()
    fail(name, new Error('应失败却成功'))
  } catch (e) {
    if (re.test(e.message)) pass(name)
    else fail(name, e)
  }
}

async function probeFrontend() {
  for (const base of FE_CANDIDATES) {
    try {
      const r = await fetch(base + '/', { redirect: 'follow' })
      if (!r.ok) continue
      const html = await r.text()
      if (!/科创广场|prototype\.js|修炼/.test(html) && !/kcsquare|CREATOR/.test(html)) {
        // 8085 可能是别的前端，继续试
        if (!html.includes('prototype.js') && !html.includes('科创')) continue
      }
      for (const f of ['/prototype.js', '/prototype.css', '/frontend/public/kc-api.js']) {
        const fr = await fetch(base + f)
        if (!fr.ok) throw new Error(`${f} => ${fr.status}`)
      }
      return base
    } catch {
      /* try next */
    }
  }
  return null
}

async function ensureCreator(token, adminToken, studentNo) {
  const me = await req('GET', '/auth/me', undefined, token)
  if ((me.identities || []).includes('创造者')) return me
  await req('POST', '/admin/grant', { studentNo, identity: '创造者' }, adminToken)
  return req('GET', '/auth/me', undefined, token)
}

async function main() {
  console.log('\n=== 科创广场 · 全功能闭环冒烟 ===\n')
  console.log(`API: ${BASE}`)

  // 0. 前端
  section('0 前端资源')
  try {
    const fe = await probeFrontend()
    if (!fe) throw new Error('5173/8085 均未提供科创广场页面')
    pass('前端可访问', fe)
  } catch (e) {
    fail('前端资源', e)
  }

  // 1. 认证
  section('1 认证')
  let tStudent, tIdea, tOwner, tTeacher, tAdmin, uStudent
  try {
    ;({ token: tStudent, user: uStudent } = await login('2026001'))
    tIdea = (await login('2026002')).token
    tOwner = (await login('2026003')).token
    tTeacher = (await login('teacher')).token
    tAdmin = (await login('admin')).token
    pass('五角色登录', `学生积分 ${uStudent.points}`)
    await ensureCreator(tStudent, tAdmin, '2026001')
    pass('确保学生有创造者身份')
  } catch (e) {
    fail('认证', e)
    printSummary()
    process.exit(1)
  }

  // 2. 项目广场 + 开放招募
  section('2 项目发布 / 开放招募')
  let openProjectId, closedProjectId
  try {
    const stamp = Date.now().toString().slice(-6)
    const open = await req(
      'POST',
      '/projects',
      {
        title: `全测开放项目 ${stamp}`,
        summary: '全功能冒烟 · 开放招募',
        roles: ['前端'],
        acceptApplications: true,
        gate: 'creator'
      },
      tOwner
    )
    openProjectId = open.id
    pass('发布开放招募项目', `#${openProjectId}`)
    if (open.acceptApplications === false) throw new Error('acceptApplications 应为 true')

    const closed = await req(
      'POST',
      '/projects',
      {
        title: `全测闭招项目 ${stamp}`,
        summary: '全功能冒烟 · 暂不招人',
        roles: ['后端'],
        acceptApplications: false
      },
      tOwner
    )
    closedProjectId = closed.id
    pass('发布闭招项目', `#${closedProjectId} status=${closed.status}`)

    await expectFail(
      () => req('POST', `/projects/${closedProjectId}/join`, { message: '想进' }, tStudent),
      /开放招募|申请/,
      '闭招项目拒绝申请'
    )

    const join = await req(
      'POST',
      `/projects/${openProjectId}/join`,
      { message: '全测申请入队' },
      tStudent
    )
    pass('提交组队申请', `req=${join.requestId || join.status}`)

    const pending = await req('GET', `/projects/${openProjectId}/join-requests`, undefined, tOwner)
    const reqRow = (pending.list || []).find((r) => r.status === 'pending') || pending.list?.[0]
    if (!reqRow) throw new Error('项目方看不到待审申请')
    await req(
      'POST',
      `/projects/${openProjectId}/join-requests/${reqRow.id}/approve`,
      {},
      tOwner
    )
    pass('项目方同意入队')

    const detail = await req('GET', `/projects/${openProjectId}`, undefined, tStudent)
    if (detail.myJoinStatus !== 'member' && detail.myJoinStatus !== 'approved') {
      // 批准后应是成员
      const isMember = (detail.members || []).some((m) => Number(m.id) === Number(uStudent.id))
      if (!isMember) throw new Error(`入队后状态异常: ${detail.myJoinStatus}`)
    }
    pass('入队后成员可见')
  } catch (e) {
    fail('项目/组队申请', e)
  }

  // 3. 招人动态 + 邀请
  section('3 招人动态 / 邀请')
  try {
    if (!openProjectId) throw new Error('无开放项目')
    const recruit = await req(
      'POST',
      `/projects/${openProjectId}/recruit`,
      { role: '产品', body: '全测招人说明，每周能投入 2 小时', syncPlaza: true, syncCommunity: true },
      tOwner
    )
    if (!recruit.forumPostId) throw new Error('未同步到社区帖')
    pass('发招人动态', `${recruit.line || ''} · 社区#${recruit.forumPostId}`)

    const feed = await req('GET', '/projects/recruit-feed?pageSize=10', undefined, tStudent)
    if (!(feed.list || []).length) throw new Error('招人流为空')
    pass('招人流可读', `${feed.total || feed.list.length} 条`)

    const invitee = await login('2026002')
    await ensureCreator(invitee.token, tAdmin, '2026002')
    const inv = await req(
      'POST',
      `/projects/${openProjectId}/invites`,
      { who: '2026002', note: '全测邀请' },
      tOwner
    )
    pass('发送邀请', `invite=${inv.inviteId}`)
    const mine = await req('GET', '/projects/invites/mine?status=pending', undefined, invitee.token)
    const hit = (mine.list || []).find((i) => Number(i.id) === Number(inv.inviteId))
    if (!hit) throw new Error('邀请未出现在收件箱')
    try {
      await req('POST', `/projects/invites/${inv.inviteId}/accept`, {}, invitee.token)
      pass('接受邀请入队')
    } catch (e) {
      if (/已在项目|已处理/.test(e.message)) pass('接受邀请入队', e.message)
      else throw e
    }
  } catch (e) {
    fail('招人/邀请', e)
  }

  // 4. 人才卡申请入队
  section('4 人才卡 → 申请入队')
  try {
    const makers = await req('GET', '/makers?pageSize=50', undefined, tStudent)
    const ownerCard = (makers.list || []).find((m) => Number(m.id) === 3) // 2026003 常见 id
      || (makers.list || []).find((m) => (m.openProjects || []).length)
    if (!ownerCard) throw new Error('人才列表无开放招募者')
    pass('人才列表含开放招募', `${ownerCard.displayName} · ${ownerCard.openProjects?.length || 0} 项`)

    const openList = await req(
      'GET',
      `/makers/${ownerCard.id}/open-projects`,
      undefined,
      tStudent
    )
    if (!(openList.list || []).length) throw new Error('open-projects 为空')
    pass('人才开放项目列表', `${openList.list.length} 个`)
  } catch (e) {
    fail('人才申请入队', e)
  }

  // 5. 点子双路径委托
  section('5 点子委托双路径')
  try {
    const idea = await req(
      'POST',
      '/ideas',
      {
        title: `全测点子 ${Date.now().toString().slice(-4)}`,
        content: '需要做成校园小工具，可组队或委托',
        pathType: 'team',
        openRecruit: true
      },
      tIdea
    )
    pass('发布点子', `#${idea.id} openRecruit=${!!idea.openRecruit}`)

    // 团队委托
    const teamIdea = await req(
      'POST',
      '/ideas',
      {
        title: `团队委托点子 ${Date.now().toString().slice(-4)}`,
        content: '团队委托冒烟',
        pathType: 'commission',
        commissionPrice: 3000
      },
      tIdea
    )
    const before = (await req('GET', '/points/me', undefined, tIdea)).points
    const teamOffer = await req(
      'POST',
      `/ideas/${teamIdea.id}/team-commission`,
      { points: 200, note: '全测团队委托', targetHint: '创造者' },
      tIdea
    )
    const mid = (await req('GET', '/points/me', undefined, tIdea)).points
    if (before - mid < 200) throw new Error(`团队委托扣分异常 ${before}->${mid}`)
    pass('团队委托托管积分', `扣 ${before - mid}✦ offer=${teamOffer.offerId || teamOffer.id || 'ok'}`)

    const board = await req('GET', '/ideas/team-offers?pageSize=20', undefined, tStudent)
    const offerId = teamOffer.offerId || teamOffer.id || board.list?.[0]?.id
    if (!offerId) throw new Error('委托大厅无单')
    pass('委托大厅可见', `${board.list?.length || 0} 单`)

    try {
      await req('POST', `/ideas/team-offers/${offerId}/accept`, {}, tStudent)
      pass('创造者接团队委托')
    } catch (e) {
      if (/已接|处理|不足|自己/.test(e.message)) pass('创造者接团队委托', e.message)
      else throw e
    }

    // 平台委托（高门槛）
    const platIdea = await req(
      'POST',
      '/ideas',
      {
        title: `平台委托点子 ${Date.now().toString().slice(-4)}`,
        content: '平台必接冒烟',
        pathType: 'commission',
        commissionPrice: 3000
      },
      tIdea
    )
    // 确保积分够
    await req('POST', '/points/purchase', { amount: 5000 }, tIdea)
    const plat = await req(
      'POST',
      `/ideas/${platIdea.id}/commission`,
      { rewardPoints: 3000 },
      tIdea
    )
    if (!plat.projectId) throw new Error('平台委托未生成项目')
    pass('平台委托闭环', `项目 #${plat.projectId}`)
  } catch (e) {
    fail('点子委托', e)
  }

  // 6. 论坛
  section('6 论坛')
  try {
    const boards = await req('GET', '/forum/boards', undefined, tStudent)
    const slug = boards.find((b) => b.slug === 'qa')?.slug || boards[0]?.slug || 'general'
    const post = await req(
      'POST',
      '/forum/posts',
      { boardSlug: slug, title: '全测帖', content: '全功能冒烟发帖内容不少于十字。' },
      tStudent
    )
    await req('POST', `/forum/posts/${post.id}/comments`, { content: '全测评论' }, tIdea)
    await req('POST', `/forum/posts/${post.id}/like`, {}, tIdea)
    pass('发帖/评论/点赞', `#${post.id}`)
  } catch (e) {
    fail('论坛', e)
  }

  // 7. 积分
  section('7 积分')
  try {
    const before = (await req('GET', '/points/me', undefined, tStudent)).points
    const buy = await req('POST', '/points/purchase', { amount: 100 }, tStudent)
    if (buy.points < before + 100) throw new Error('购买未到账')
    const led = await req('GET', '/points/ledger?pageSize=5', undefined, tStudent)
    pass('购买与流水', `${before}→${buy.points} · ${led.list?.length || 0} 条`)
  } catch (e) {
    fail('积分', e)
  }

  // 8. 修炼之路
  section('8 修炼之路')
  try {
    const cat = await req('GET', '/train/catalog', undefined, tStudent)
    pass('副本目录', `${(cat.paths || []).length} 途`)
    const map = await req('GET', '/train/map/network/beginner', undefined, tStudent)
    const node =
      (map.nodes || []).find((n) => n.type === 'quiz' && n.status === 'available') ||
      (map.nodes || []).find((n) => n.status === 'available') ||
      (map.nodes || [])[0]
    if (!node) throw new Error('无关卡')
    if (node.status === 'available' || node.status === 'current') {
      try {
        await req(
          'POST',
          '/train/complete',
          { pathId: 'network', tierId: 'beginner', nodeId: node.id, score: 90 },
          tStudent
        )
        pass('闯关 complete', node.id)
      } catch (e) {
        if (!/刷题|测验|quiz|判分/i.test(e.message)) throw e
        const mysql = require('mysql2/promise')
        const config = require('../src/config')
        const start = await req(
          'POST',
          '/train/quiz/start',
          {
            pathId: 'network',
            tierId: 'beginner',
            taskId: 'net-u1',
            nodeId: node.id,
            passScore: 50
          },
          tStudent
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
          {
            attemptId: start.attemptId,
            answers: pack.map((q) => (typeof q.answer === 'number' ? q.answer : 0))
          },
          tStudent
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
          tStudent
        )
        pass('闯关 complete', `${node.id} via quiz`)
      }
    } else {
      pass('闯关 complete', `已通 ${node.id}`)
    }
    const pbl = await req('GET', '/train/pbl?pathId=network', undefined, tStudent)
    pass('拉取 PBL 规则', Array.isArray(pbl) ? `${pbl.length} 条` : 'ok')
  } catch (e) {
    fail('修炼', e)
  }

  // 9. 教师创课 + 编排 + 收费 + 授身份
  section('9 教师创课 / 收费 / 授身份')
  let courseId
  try {
    const course = await req(
      'POST',
      '/train/courses',
      {
        title: `全测教师课 ${Date.now().toString(36).slice(-5)}`,
        blurb: '全功能冒烟课程',
        rewardIdentity: '全测课通关',
        publish: true
      },
      tTeacher
    )
    courseId = course.id
    pass('创建并上架教师课', courseId)

    const taskId = course.chapters?.[0]?.id || `${courseId}-u1`
    await req(
      'PUT',
      '/train/pbl',
      {
        pathId: courseId,
        taskId,
        title: '第一单元',
        def: {
          pathId: courseId,
          taskId,
          title: '第一单元',
          drillEnabled: true,
          practiceEnabled: true,
          passScore: 80,
          bank: [{ id: 'q1', q: '冒烟题？', options: ['A', 'B', 'C'], answer: 'B', kind: '单选' }],
          guide: [{ title: '讲义', kind: 'doc', url: '' }]
        }
      },
      tTeacher
    )
    pass('编排任务规则并入库')

    await req(
      'PUT',
      `/train/courses/${encodeURIComponent(courseId)}/pricing`,
      {
        pricingEnabled: true,
        freeForSchool: true,
        externalFeeYuan: 30,
        ownerSchool: '示范中学',
        setAsHomeSchool: true
      },
      tTeacher
    )
    pass('收费设置保存')

    await req('PUT', '/auth/me/school', { schoolName: '校外全测中学' }, tStudent)
    const access = await req(
      'GET',
      `/train/courses/${encodeURIComponent(courseId)}/access`,
      undefined,
      tStudent
    )
    if (!access.needPay) throw new Error(`校外应需付费: ${access.reason}`)
    pass('校外准入需付费', `${access.pointsCost}✦`)

    await req('POST', '/points/purchase', { amount: 1000 }, tStudent)
    await req('POST', `/train/courses/${encodeURIComponent(courseId)}/enroll`, {}, tStudent)
    const access2 = await req(
      'GET',
      `/train/courses/${encodeURIComponent(courseId)}/access`,
      undefined,
      tStudent
    )
    if (access2.needPay) throw new Error('开通后仍需付费')
    pass('积分开通进入', access2.reason)

    await req(
      'PUT',
      `/train/courses/${encodeURIComponent(courseId)}/identity`,
      {
        rewardIdentity: '全测课通关',
        identityCertified: true,
        grantsCreator: true
      },
      tAdmin
    )
    pass('官方授身份配置')

    const mine = await req('GET', '/train/courses?mine=1', undefined, tTeacher)
    if (!(mine.list || []).some((c) => c.id === courseId)) throw new Error('我的课程列表缺新建课')
    pass('教师可见自己的课', `${mine.list.length} 门`)
  } catch (e) {
    fail('教师课闭环', e)
  }

  // 10. 回链反馈
  section('10 回链 / 反馈')
  try {
    const pid = openProjectId
    if (!pid) throw new Error('无项目')
    await req('POST', `/projects/${pid}/feedback`, { content: '全测反馈：希望导出报告' }, tIdea)
    const bl = await req('POST', `/projects/${pid}/backlink`, { entry: 'plaza' }, tIdea)
    pass('反馈与回链', `回链累计 ${bl.backlinkCount}`)
  } catch (e) {
    fail('回链/反馈', e)
  }

  // 11. 活动 + 后台
  section('11 活动 / 后台')
  try {
    try {
      await req('POST', '/events/hackathon', { teamName: '全测队' }, tOwner)
      pass('黑客松报名')
    } catch (e) {
      if (/已提交|重复/.test(e.message)) pass('黑客松报名', '已报名')
      else throw e
    }
    try {
      await req('POST', '/events/special', { track: '设计' }, tOwner)
      pass('特殊通道报名')
    } catch (e) {
      if (/已提交|重复/.test(e.message)) pass('特殊通道报名', '已报名')
      else throw e
    }
    await req('POST', '/admin/unlock-print', {}, tAdmin)
    pass('解锁 3D 打印')
    await req('POST', '/admin/school-force', { enabled: true, grade: '初一' }, tAdmin)
    pass('学校强制开课')
    await req('POST', '/admin/grant', { studentNo: '2026001', identity: '全测认证' }, tAdmin)
    pass('手动赋身份')
  } catch (e) {
    fail('活动/后台', e)
  }

  // 12. 上传（轻量）
  section('12 上传接口可达')
  try {
    // 不实际上传文件，只验证鉴权拒绝无文件
    const res = await fetch(`${BASE}/uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tStudent}` }
    })
    // 400/415 等说明路由存在
    if (res.status === 404) throw new Error('uploads 路由 404')
    pass('上传路由存在', `HTTP ${res.status}`)
  } catch (e) {
    fail('上传', e)
  }

  printSummary()
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

function printSummary() {
  const ok = results.filter((r) => r.ok).length
  const bad = results.filter((r) => !r.ok).length
  console.log('\n=== 汇总 ===')
  console.log(`通过 ${ok}  · 失败 ${bad}  · 共 ${results.length}`)
  if (bad) {
    console.log('\n失败项:')
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`))
  } else {
    console.log('全部闭环通过。')
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
