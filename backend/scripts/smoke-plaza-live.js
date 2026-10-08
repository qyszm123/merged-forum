/**
 * 广场真实数据冒烟：列表 / 组队 / 时间线 / 反馈 / 回链 / 积分 / 人才 / 论坛
 */
require('dotenv').config()
const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'

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

async function main() {
  const a = await req('POST', '/auth/login', { studentNo: '2026001', password: '123456' })
  const b = await req('POST', '/auth/login', { studentNo: '2026002', password: '123456' })
  const projects = await req('GET', '/projects?pageSize=50', null, a.token)
  const ideas = await req('GET', '/ideas?pageSize=50', null, a.token)
  const makers = await req('GET', '/makers?pageSize=50', null, a.token)
  const forum = await req('GET', '/forum/posts?pageSize=50', null, a.token)
  if (!projects.list?.length) throw new Error('projects empty')
  if (!ideas.list?.length) throw new Error('ideas empty')
  if (!makers.list?.length) throw new Error('makers empty')
  if (!forum.list?.length) throw new Error('forum empty')

  // 选「开放招募且非 2026002 自己的项目」，避免误测到「你已是项目方」
  const recruit =
    projects.list.find(
      (p) =>
        p.status === 'recruiting' &&
        Number(p.ownerId || p.owner?.id) !== Number(b.user?.id)
    ) ||
    projects.list.find((p) => Number(p.ownerId || p.owner?.id) !== Number(b.user?.id)) ||
    projects.list[0]
  await req('POST', `/projects/${recruit.id}/timeline`, { content: '冒烟：时间线写入' }, a.token)
  await req('POST', `/projects/${recruit.id}/feedback`, { content: '冒烟：反馈内容足够长' }, b.token)
  const back = await req('POST', `/projects/${recruit.id}/backlink`, { entry: 'plaza' }, b.token)
  if (!back.backlinkCount) throw new Error('backlink not recorded')

  // 2026002 加入别人的项目（若已在/已是项目方则忽略）
  try {
    await req('POST', `/projects/${recruit.id}/join`, {}, b.token)
  } catch (e) {
    if (!/已在项目中|已是项目方|已是成员/.test(e.message)) throw e
  }

  const bought = await req('POST', '/points/purchase', { amount: 100 }, a.token)
  if (bought.added !== 100) throw new Error('purchase failed')

  console.log('[smoke-plaza] ok', {
    projects: projects.total,
    ideas: ideas.total,
    makers: makers.total,
    forum: forum.total,
    sample: recruit.title,
    backlinkCount: back.backlinkCount
  })
}

main().catch((err) => {
  console.error('[smoke-plaza] failed:', err.message)
  process.exit(1)
})
