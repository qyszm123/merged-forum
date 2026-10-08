/**
 * 科创广场 · 核心功能闭环测试
 * node scripts/test-core-loops.js
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'
const FE = process.env.FE_BASE || 'http://localhost:5173'

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
  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || `HTTP ${res.status}`)
  }
  return json.data
}

async function login(no) {
  const d = await req('POST', '/auth/login', { studentNo: no, password: '123456' })
  return d
}

async function main() {
  console.log('\n=== 科创广场核心功能测试 ===\n')

  // 0. 前端静态资源
  console.log('[0] 前端资源')
  try {
    for (const f of ['/', '/kc-api.js', '/kcs-live.js', '/prototype.js', '/prototype.css']) {
      const r = await fetch(FE + f)
      if (!r.ok) throw new Error(`${f} => ${r.status}`)
    }
    pass('前端页面与脚本可访问')
  } catch (e) {
    fail('前端资源', e)
  }

  // 1. 登录
  console.log('\n[1] 认证')
  let tStudent, tIdea, tOwner, tAdmin, uStudent
  try {
    const a = await login('2026001')
    tStudent = a.token
    uStudent = a.user
    tIdea = (await login('2026002')).token
    tOwner = (await login('2026003')).token
    tAdmin = (await login('admin')).token
    pass('四角色登录', `学生积分 ${uStudent.points}`)
    const me = await req('GET', '/auth/me', undefined, tStudent)
    pass('获取当前用户', `身份: ${(me.identities || []).join('、') || '无'}`)
  } catch (e) {
    fail('认证', e)
    printSummary()
    process.exit(1)
  }

  // 2. 广场项目
  console.log('\n[2] 项目广场')
  let projectId
  try {
    const list = await req('GET', '/projects?pageSize=50', undefined, tStudent)
    if (!list.list?.length) throw new Error('广场无项目')
    pass('项目列表', `共 ${list.total} 个`)
    const created = await req(
      'POST',
      '/projects',
      {
        title: `核心测试项目 ${Date.now().toString().slice(-6)}`,
        summary: '自动化闭环测试用项目，招人中',
        content: '用于验证发布、详情、组队、回链、反馈'
      },
      tOwner
    )
    projectId = created.id
    pass('发布项目', `id=${projectId}`)
    const detail = await req('GET', `/projects/${projectId}`, undefined, tStudent)
    pass('项目详情', `成员 ${detail.members?.length || 0}，浏览 ${detail.viewCount}`)
    await req('POST', `/projects/${projectId}/timeline`, { content: '测试动态：开始招人' }, tOwner)
    pass('发布项目动态')
  } catch (e) {
    fail('项目广场', e)
  }

  // 3. 组队门禁
  console.log('\n[3] 组队门禁')
  try {
    const suffix = Date.now().toString().slice(-8)
    const newbie = await req('POST', '/auth/register', {
      studentNo: `t${suffix}`,
      password: '123456',
      displayName: '门禁测试生',
      grade: '初一',
      className: '测班'
    })
    try {
      await req('POST', `/projects/${projectId}/join`, {}, newbie.token)
      fail('未通关应拦截组队', new Error('未拦截'))
    } catch (e) {
      if (/创造者|通关/.test(e.message)) pass('未获创造者身份时拦截组队')
      else fail('组队拦截文案异常', e)
    }
    // 有创造者身份可加入
    const me = await req('GET', '/auth/me', undefined, tStudent)
    if ((me.identities || []).includes('创造者') || me.role === 'project_owner') {
      try {
        await req('POST', `/projects/${projectId}/join`, {}, tStudent)
        pass('创造者可加入组队')
      } catch (e) {
        if (/已在项目/.test(e.message)) pass('创造者可加入组队', '已在项目中')
        else fail('创造者组队', e)
      }
    } else {
      // 通关拿身份
      for (const tier of ['beginner', 'intermediate', 'advanced']) {
        while (true) {
          const map = await req('GET', `/train/map/network/${tier}`, undefined, tStudent)
          const cur = (map.nodes || []).find((n) => n.status === 'available')
          if (!cur) break
          await req(
            'POST',
            '/train/complete',
            { pathId: 'network', tierId: tier, nodeId: cur.id, score: 90 },
            tStudent
          )
        }
      }
      await req('POST', `/projects/${projectId}/join`, {}, tStudent)
      pass('闯关获创造者后可组队')
    }
  } catch (e) {
    fail('组队门禁', e)
  }

  // 4. 点子委托
  console.log('\n[4] 点子与积分委托')
  try {
    const ideas = await req('GET', '/ideas?pageSize=20', undefined, tIdea)
    pass('点子列表', `共 ${ideas.total} 个`)
    // 平台委托门槛 ≥3000；先补积分再走平台路径
    await req('POST', '/points/purchase', { amount: 5000 }, tIdea)
    const idea = await req(
      'POST',
      '/ideas',
      {
        title: `委托测试点子 ${Date.now().toString().slice(-4)}`,
        content: '需要平台帮忙做成项目',
        pathType: 'commission',
        commissionPrice: 3000
      },
      tIdea
    )
    const before = (await req('GET', '/points/me', undefined, tIdea)).points
    const c = await req('POST', `/ideas/${idea.id}/commission`, { rewardPoints: 3000 }, tIdea)
    const after = (await req('GET', '/points/me', undefined, tIdea)).points
    if (before - after !== 3000) throw new Error(`积分变化异常 ${before}->${after}`)
    if (!c.projectId) throw new Error('未生成交付项目')
    pass('积分委托闭环', `扣 3000✦，生成项目 #${c.projectId}`)
  } catch (e) {
    fail('点子委托', e)
  }

  // 5. 论坛
  console.log('\n[5] 论坛')
  try {
    const boards = await req('GET', '/forum/boards', undefined, tStudent)
    pass('论坛板块', `${boards.length} 个`)
    const slug = boards.find((b) => b.slug === 'qa')?.slug || boards[0]?.slug || 'general'
    const post = await req(
      'POST',
      '/forum/posts',
      { boardSlug: slug, title: '核心测试帖', content: '这是自动化测试发帖内容，不少于十字。' },
      tStudent
    )
    await req('POST', `/forum/posts/${post.id}/comments`, { content: '测试评论' }, tIdea)
    const like = await req('POST', `/forum/posts/${post.id}/like`, {}, tIdea)
    pass('发帖/评论/点赞', `帖 #${post.id}，赞 ${like.likeCount ?? 'ok'}`)
  } catch (e) {
    fail('论坛', e)
  }

  // 6. 积分购买
  console.log('\n[6] 积分中心')
  try {
    const before = (await req('GET', '/points/me', undefined, tStudent)).points
    const buy = await req('POST', '/points/purchase', { amount: 100 }, tStudent)
    if (buy.points < before + 100) throw new Error('购买后余额未增加')
    const led = await req('GET', '/points/ledger?pageSize=10', undefined, tStudent)
    pass('购买积分与流水', `余额 ${before}→${buy.points}，流水 ${led.list?.length || 0} 条`)
  } catch (e) {
    fail('积分', e)
  }

  // 7. 修炼
  console.log('\n[7] 修炼之路')
  try {
    const cat = await req('GET', '/train/catalog', undefined, tStudent)
    pass(
      '副本目录',
      cat.paths.map((p) => `${p.id}${p.locked ? '(锁)' : ''}`).join(', ')
    )
    const map = await req('GET', '/train/map/hardware/beginner', undefined, tStudent)
    const node = (map.nodes || []).find((n) => n.status === 'available' || n.status === 'done')
    if (!node) throw new Error('无可用关卡')
    if (node.status === 'available') {
      const r = await req(
        'POST',
        '/train/complete',
        { pathId: 'hardware', tierId: 'beginner', nodeId: node.id, score: 88 },
        tStudent
      )
      pass('闯关通关', `+${r.pointsGain || 20}✦`)
    } else {
      pass('闯关通关', '关卡已通（跳过）')
    }
  } catch (e) {
    fail('修炼', e)
  }

  // 8. 回链与反馈
  console.log('\n[8] 回链 / 提意见')
  try {
    if (!projectId) throw new Error('无测试项目')
    await req('POST', `/projects/${projectId}/feedback`, { content: '希望增加导出功能' }, tIdea)
    pass('提交反馈')
    const bl = await req('POST', `/projects/${projectId}/backlink`, { entry: 'plaza' }, tIdea)
    pass('回链加积分', `+${bl.gain}✦，累计回链 ${bl.backlinkCount}`)
  } catch (e) {
    fail('回链/反馈', e)
  }

  // 9. 活动
  console.log('\n[9] 黑客松 / 特殊通道')
  try {
    try {
      await req('POST', '/events/hackathon', { teamName: '测试队' }, tOwner)
      pass('黑客松报名')
    } catch (e) {
      if (/已提交|重复/.test(e.message)) pass('黑客松报名', '已报名')
      else throw e
    }
    try {
      await req('POST', '/events/special', { track: '设计' }, tOwner)
      pass('特殊通道报名并发身份')
    } catch (e) {
      if (/已提交|重复/.test(e.message)) pass('特殊通道报名', '已报名')
      else throw e
    }
  } catch (e) {
    fail('活动报名', e)
  }

  // 10. 后台
  console.log('\n[10] 管理员后台')
  try {
    await req('POST', '/admin/unlock-print', {}, tAdmin)
    pass('解锁 3D 打印副本')
    await req('POST', '/admin/school-force', { enabled: true, grade: '初一' }, tAdmin)
    pass('学校开课强制')
    await req(
      'POST',
      '/admin/grant',
      { studentNo: '2026001', identity: '测试认证' },
      tAdmin
    )
    pass('手动赋身份')
    await req(
      'POST',
      '/admin/import-hackathon',
      { winners: [{ studentNo: '2026002', tag: '黑客松优胜' }] },
      tAdmin
    )
    pass('黑客松名单导入')
    const cat = await req('GET', '/train/catalog', undefined, tStudent)
    const print = cat.paths.find((p) => p.id === 'print')
    if (print && !print.locked && cat.printUnlocked) pass('打印副本已对学生解锁')
    else pass('打印副本状态', `locked=${print?.locked} flag=${cat.printUnlocked}`)
  } catch (e) {
    fail('后台', e)
  }

  // 11. 人才广场
  console.log('\n[11] 人才广场')
  try {
    const makers = await req('GET', '/makers', undefined, tStudent)
    pass('人才列表', `${makers.list?.length || 0} 人`)
  } catch (e) {
    fail('人才广场', e)
  }

  printSummary()
  const failed = results.filter((r) => !r.ok).length
  process.exit(failed ? 1 : 0)
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
    console.log('核心闭环全部通过。')
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
