/**
 * 为演示灌入若干「委托其他团队」开放单，填满委托大厅
 * 用法：API_BASE=http://127.0.0.1:3056/api node scripts/seed-team-offers.js
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
  return data.token
}

const SEEDS = [
  {
    account: '2026002',
    preferTitle: '食堂',
    points: 500,
    targetHint: '前端 / 数据',
    note: '想先做窗口等待预估原型，欢迎有数据或前端经验的同学接单。'
  },
  {
    account: '2026001',
    preferTitle: '雨天',
    points: 400,
    targetHint: '产品 / 硬件',
    note: '雨天走廊拥堵提示，需要产品同学定规则，也可带简单硬件方案。'
  },
  {
    account: '2026003',
    preferTitle: '',
    points: 600,
    targetHint: '全栈创造者',
    note: '积分已托管，接单后生成项目并到账，欢迎组队实现。'
  }
]

async function main() {
  const board = await req('GET', '/ideas/team-offers?pageSize=5')
  if ((board.list || []).length >= 2) {
    console.log(`[seed-team-offers] already have ${board.list.length} open offers, skip`)
    return
  }

  for (const seed of SEEDS) {
    const token = await login(seed.account)
    const mine = await req('GET', '/ideas/mine?pageSize=40', undefined, token)
    const candidates = (mine.list || []).filter(
      (i) => i.status === 'open' || i.status === 'team_open' || !i.status
    )
    let idea =
      (seed.preferTitle
        ? candidates.find((i) => String(i.title || '').includes(seed.preferTitle))
        : null) || candidates[0]
    if (!idea) {
      console.log(`[skip] ${seed.account} no open idea`)
      continue
    }
    if (idea.status === 'team_open') {
      console.log(`[skip] ${seed.account} idea#${idea.id} already team_open`)
      continue
    }
    try {
      const r = await req(
        'POST',
        `/ideas/${idea.id}/team-commission`,
        {
          points: seed.points,
          targetHint: seed.targetHint,
          note: seed.note
        },
        token
      )
      console.log(`[ok] offer#${r.offerId} idea#${idea.id} ${idea.title} ← ${seed.account} ${seed.points}✦`)
    } catch (err) {
      console.log(`[fail] ${seed.account} idea#${idea.id}: ${err.message}`)
    }
  }

  const after = await req('GET', '/ideas/team-offers?pageSize=20')
  console.log(`[seed-team-offers] open offers now: ${after.total ?? (after.list || []).length}`)
  for (const o of after.list || []) {
    console.log(`  - #${o.id} ${o.ideaTitle} ${o.points}✦ by ${o.owner?.name}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
