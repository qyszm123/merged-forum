/**
 * 上传一批模拟项目/点子，用于联调验收
 * 用法：在 backend 目录执行  node scripts/seed-demo-content.js
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

const PROJECTS = [
  {
    account: '2026003',
    title: '超级课程表 · 校园版',
    summary: '班级课表同步、换课投票、作业提醒，正在招后端与产品。',
    content: '已完成课表上传与基础展示。待做：换课投票、作业提醒推送。组队门槛：创造者。',
    timeline: ['v0.2 已上传，正式开招', '需要产品同学定作业提醒交互']
  },
  {
    account: '2026003',
    title: '错题星球 · 刷题小游戏',
    summary: '错题闯关 + 班级榜，可下载使用，欢迎回链提意见。',
    content: '成品开放。支持错题导入、闯关模式、班级排行榜。',
    timeline: ['开放下载', '收集回链反馈中'],
    done: true
  },
  {
    account: '2026003',
    title: '班级考勤小闸机',
    summary: '刷卡进班统计到勤，硬件方案可复用。',
    content: 'RFID + 树莓派原型。招嵌入式完善固件与后台看板。',
    timeline: ['硬件样机已通', '缺后端看板']
  },
  {
    account: '2026001',
    title: '校园失物招领小程序',
    summary: '扫码进班级空间，发布失物/招领，管理员审核后公开。',
    content: '小程序 + 云开发。需要设计优化认领流程。',
    timeline: ['原型已跑通', '等设计稿']
  },
  {
    account: '2026001',
    title: '晚自习座位预约',
    summary: '按教室/时段预约座位，减少占座纠纷。',
    content: 'Web MVP。招前端做冲突检测与管理员放行。',
    timeline: ['需求已确认']
  },
  {
    account: '2026003',
    title: '社团招新海报生成器',
    summary: '选模板填社团信息，一键导出海报 PNG。',
    content: 'Canvas 渲染。可下载使用。',
    timeline: ['上线 6 套模板'],
    done: true
  }
]

const IDEAS = [
  {
    account: '2026002',
    title: '午休教室噪音监测',
    content: '低成本噪音灯：超标变红。缺嵌入式，也可积分委托。',
    rewardPoints: 800
  },
  {
    account: '2026002',
    title: '校园二手漂流柜',
    content: '班级共享柜 + 扫码登记，想做成小硬件+小程序。',
    rewardPoints: 1200
  },
  {
    account: '2026002',
    title: '食堂窗口等待预估',
    content: '根据历史排队时长，给出各窗口预计等待分钟数。',
    rewardPoints: 600
  }
]

async function main() {
  const tokens = {}
  async function login(no) {
    if (!tokens[no]) {
      const d = await req('POST', '/auth/login', { studentNo: no, password: '123456' })
      tokens[no] = d.token
    }
    return tokens[no]
  }

  console.log('[seed] uploading projects…')
  const doneIds = []
  for (const p of PROJECTS) {
    const token = await login(p.account)
    const data = await req(
      'POST',
      '/projects',
      { title: p.title, summary: p.summary, content: p.content },
      token
    )
    for (const line of p.timeline || []) {
      await req('POST', `/projects/${data.id}/timeline`, { content: line }, token)
    }
    if (p.done) doneIds.push(data.id)
    console.log('  +', data.id, p.title)
  }

  console.log('[seed] uploading ideas…')
  for (const i of IDEAS) {
    const token = await login(i.account)
    const data = await req(
      'POST',
      '/ideas',
      { title: i.title, content: i.content, rewardPoints: i.rewardPoints },
      token
    )
    console.log('  +', data.id, i.title)
  }

  if (doneIds.length) {
    const mysql = require('mysql2/promise')
    const config = require('../src/config')
    const pool = await mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database
    })
    await pool.query(
      `UPDATE projects SET status = 'done' WHERE id IN (${doneIds.map(() => '?').join(',')})`,
      doneIds
    )
    await pool.end()
    console.log('[seed] marked done:', doneIds.join(','))
  }

  const list = await req('GET', '/projects?pageSize=50', null, await login('2026001'))
  console.log(`[seed] done. plaza projects total = ${list.total}`)
  console.log('打开 http://localhost:5173 登录后进广场查看')
}

main().catch((err) => {
  console.error('[seed] failed:', err.message)
  process.exit(1)
})
