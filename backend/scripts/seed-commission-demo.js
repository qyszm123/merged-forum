/**
 * 灌入「委托进度 / 交付项目」演示数据
 * - 保证至少 1 条 team_open 挂单（委托进度可看）
 * - 保证至少 1 条 commissioned + delivered_project（查看交付项目可点）
 *
 * 用法：
 *   API_BASE=http://127.0.0.1:3056/api node scripts/seed-commission-demo.js
 */
require('dotenv').config()

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 3056}/api`

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  })
  const json = await res.json()
  if (json.code !== 0) throw new Error(`${method} ${path} => ${json.message}`)
  return json.data
}

async function login(studentNo) {
  const data = await req('POST', '/auth/login', { studentNo, password: '123456' })
  return { token: data.token, user: data.user }
}

async function main() {
  console.log('[seed-commission-demo] base=', BASE)

  const a = await login('2026001') // 阿宁
  const b = await login('2026002') // 小夏
  const c = await login('2026003')

  const ideas = await req('GET', '/ideas?pageSize=40')
  const list = ideas.list || []
  const openOffers = await req('GET', '/ideas/team-offers?pageSize=40')
  const offers = openOffers.list || []

  const commissioned = list.filter((i) => i.status === 'commissioned' && i.deliveredProjectId)
  const teamOpen = list.filter((i) => i.status === 'team_open')

  console.log(
    `[state] ideas=${list.length} team_open=${teamOpen.length} commissioned_with_project=${commissioned.length} open_offers=${offers.length}`
  )

  // 1) 确保有开放挂单（委托进度）
  if (offers.length < 1) {
    const mine = await req('GET', '/ideas/mine?pageSize=40', undefined, a.token)
    const candidate =
      (mine.list || []).find((i) => i.status === 'open') ||
      (mine.list || []).find((i) => i.status !== 'commissioned' && i.status !== 'team_open')
    if (!candidate) {
      const created = await req(
        'POST',
        '/ideas',
        {
          title: '演示·课间饮水点位优化',
          summary: '统计高峰饮水拥堵，做简易提示牌方案。',
          pathType: 'commission',
          openRecruit: false
        },
        a.token
      )
      await req(
        'POST',
        `/ideas/${created.id}/team-commission`,
        {
          points: 350,
          targetHint: '产品 / 设计',
          note: '演示挂单：用于查看委托进度。'
        },
        a.token
      )
      console.log('[ok] created team_open offer for idea#', created.id)
    } else if (candidate.status !== 'team_open') {
      await req(
        'POST',
        `/ideas/${candidate.id}/team-commission`,
        {
          points: 350,
          targetHint: '产品 / 设计',
          note: '演示挂单：用于查看委托进度。'
        },
        a.token
      )
      console.log('[ok] posted team offer for idea#', candidate.id)
    }
  } else {
    console.log('[skip] open offers already exist:', offers.map((o) => `#${o.id}:${o.ideaTitle}`).join(', '))
  }

  // 2) 确保有「已交付」点子：找一条 open/team_open 让另一人接单
  const afterIdeas = await req('GET', '/ideas?pageSize=40')
  const afterList = afterIdeas.list || []
  let delivered = afterList.filter((i) => i.status === 'commissioned' && i.deliveredProjectId)
  if (delivered.length < 1) {
    let board = await req('GET', '/ideas/team-offers?pageSize=40')
    let offer = (board.list || [])[0]
    if (!offer) {
      const mineB = await req('GET', '/ideas/mine?pageSize=40', undefined, b.token)
      const idea =
        (mineB.list || []).find((i) => i.status === 'open') ||
        (await req(
          'POST',
          '/ideas',
          {
            title: '演示·教室投影线材收纳',
            summary: '减少线材缠绕，做简易收纳支架。',
            pathType: 'commission'
          },
          b.token
        ))
      const ideaId = idea.id || idea
      offer = await req(
        'POST',
        `/ideas/${ideaId}/team-commission`,
        { points: 280, targetHint: '硬件 / 动手', note: '演示接单交付链路。' },
        b.token
      )
      // team-commission returns offerId
      board = await req('GET', '/ideas/team-offers?pageSize=40')
      offer = (board.list || []).find((o) => Number(o.id) === Number(offer.offerId)) || (board.list || [])[0]
    }
    // 用非 owner 账号接单
    const ownerId = Number(offer.owner?.id || 0)
    const acceptorToken =
      ownerId === Number(a.user?.id) ? c.token : ownerId === Number(b.user?.id) ? a.token : a.token
    const result = await req('POST', `/ideas/team-offers/${offer.id}/accept`, {}, acceptorToken)
    console.log('[ok] accepted offer#', offer.id, '→ project#', result.projectId, 'idea#', result.ideaId)
    delivered = [{ id: result.ideaId, deliveredProjectId: result.projectId, title: offer.ideaTitle }]
  } else {
    console.log(
      '[skip] commissioned demos:',
      delivered.map((i) => `#${i.id}→p${i.deliveredProjectId}:${i.title}`).join(', ')
    )
  }

  // 3) 校验交付项目可拉取
  for (const row of delivered.slice(0, 3)) {
    const p = await req('GET', `/projects/${row.deliveredProjectId}`)
    console.log('[check] project#', p.id, p.title, 'status=', p.status)
  }

  const finalBoard = await req('GET', '/ideas/team-offers?pageSize=20')
  const finalIdeas = await req('GET', '/ideas?pageSize=40')
  const finalDelivered = (finalIdeas.list || []).filter(
    (i) => i.status === 'commissioned' && i.deliveredProjectId
  )
  console.log(
    `[done] open_offers=${(finalBoard.list || []).length} commissioned_with_project=${finalDelivered.length}`
  )
  finalDelivered.forEach((i) => {
    console.log(`  - idea#${i.id}「${i.title}」→ 查看交付项目 project#${i.deliveredProjectId}`)
  })
  ;(finalBoard.list || []).forEach((o) => {
    console.log(`  - offer#${o.id}「${o.ideaTitle}」→ 查看委托进度 idea#${o.ideaId}`)
  })
}

main().catch((e) => {
  console.error('[seed-commission-demo] failed:', e.message)
  process.exit(1)
})
