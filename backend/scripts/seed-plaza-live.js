/**
 * 清空广场项目/点子并写入真实校园项目数据（入库）
 * 用法：node scripts/seed-plaza-live.js
 *       node scripts/seed-plaza-live.js --force   # 清空 projects/ideas 相关表后重灌
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'
const FORCE = process.argv.includes('--force')

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
    title: '执信增城 · 班级超级课表',
    summary: '同步各班课表、换课投票与作业提醒，正在招后端与产品同学。',
    content:
      '面向本校初中部：老师上传课表后学生可订阅。已完成课表导入与班级页。待做：换课投票、作业提醒推送。组队门槛：创造者。',
    tech: 'vue',
    platform: 'web',
    scene: 'campus',
    roles: ['backend', 'product'],
    timeline: ['课表导入已通，七/八年级试点班在用', '缺产品同学定作业提醒规则'],
    status: 'recruiting'
  },
  {
    account: '2026001',
    title: '错题星球 · 班级刷题榜',
    summary: '错题导入 + 闯关刷题 + 班级榜，可体验，欢迎回链提意见。',
    content:
      '结合信息课「网络入门」练习：支持拍照/粘贴错题、闯关模式与班级周榜。成品开放体验，意见进项目反馈。',
    tech: 'python',
    platform: 'web',
    scene: 'study',
    roles: [],
    timeline: ['三年级信息兴趣社已试用', '持续收集回链反馈'],
    status: 'done',
    experienceUrl: ''
  },
  {
    account: '2026003',
    title: '作业助手 · AI 步骤提示',
    summary: '拍照上传作业，AI 给步骤提示（不直接给答案），招算法与前端。',
    content:
      '服务校本作业减负：OCR 初版已通。待做：提示词策略、家长端周报。需算法与前端一起打磨。',
    tech: 'ai',
    platform: 'app',
    scene: 'study',
    roles: ['ai', 'frontend'],
    timeline: ['OCR 通路已通', '需要算法同学优化提示，避免泄题'],
    status: 'recruiting'
  },
  {
    account: '2026001',
    title: '教室考勤小闸机',
    summary: '刷卡进班统计到勤，硬件方案可复用到多教室。',
    content:
      'RFID + 树莓派原型，对应「硬件」副本实践。招嵌入式完善固件，招后端做班主任看板。',
    tech: 'hardware',
    platform: 'embedded',
    scene: 'iot',
    roles: ['hardware', 'backend'],
    timeline: ['样机在信息教室可演示', '缺后端看板与导出到勤表'],
    status: 'recruiting'
  },
  {
    account: '2026001',
    title: '校园失物招领',
    summary: '扫码进班级空间，发布失物/招领，生活老师审核后公开。',
    content:
      '小程序 + 后台审核。需要设计同学优化认领流程，前端完善消息提醒。',
    tech: 'other',
    platform: 'app',
    scene: 'campus',
    roles: ['design', 'frontend'],
    timeline: ['流程原型已跑通', '等设计稿与文案'],
    status: 'recruiting'
  },
  {
    account: '2026003',
    title: '晚自习座位预约',
    summary: '按教室/时段预约座位，减少占座纠纷，招前端。',
    content:
      'Web MVP：冲突检测、管理员放行、班级配额。数据库表已设计，缺前端实现。',
    tech: 'vue',
    platform: 'web',
    scene: 'campus',
    roles: ['frontend'],
    timeline: ['政教处已确认需求', '欢迎有创造者身份的前端加入'],
    status: 'recruiting'
  },
  {
    account: '2026002',
    title: '社团招新海报工坊',
    summary: '选模板填社团信息，一键导出海报，已开放下载。',
    content:
      'Canvas 渲染，内置 6 套校园风格模板。社团部可用，持续收模板建议。',
    tech: 'other',
    platform: 'web',
    scene: 'campus',
    roles: [],
    timeline: ['已上线 6 套模板', '招新季使用中'],
    status: 'done',
    experienceUrl: ''
  },
  {
    account: '2026001',
    title: '校园气象站投屏看板',
    summary: '楼顶温湿度与空气质量采集，教室投屏，招嵌入式与前端。',
    content:
      '传感器节点 + MQTT，对应物联网实践场景。主题命名待统一，看板 UI 待做。',
    tech: 'hardware',
    platform: 'embedded',
    scene: 'iot',
    roles: ['hardware', 'frontend'],
    timeline: ['信息楼楼顶节点已上电', 'MQTT 主题与看板 UI 待共创'],
    status: 'recruiting'
  },
  {
    account: '2026003',
    title: '实验室器材借用台账',
    summary: '扫码借还实验器材，到期提醒，招后端与产品。',
    content:
      '物理/化学实验室共用。已完成器材编码方案，待做：借还记录、逾期催还、学期统计。',
    tech: 'vue',
    platform: 'web',
    scene: 'campus',
    roles: ['backend', 'product'],
    timeline: ['编码规则已与实验员对齐', '缺后端接口与简单管理页'],
    status: 'recruiting'
  },
  {
    account: '2026002',
    title: '校园跑团打卡地图',
    summary: '放学跑圈打卡上地图，周榜激励，招前端与设计。',
    content:
      '结合体育课课外锻炼：GPS 打卡、路线分享、班级周榜。需前端与视觉一起打磨。',
    tech: 'other',
    platform: 'app',
    scene: 'campus',
    roles: ['frontend', 'design'],
    timeline: ['跑团已有 30+ 人意向', '缺地图页与打卡防作弊策略'],
    status: 'recruiting'
  }
]

const IDEAS = [
  {
    account: '2026002',
    title: '午休教室噪音灯',
    content: '低成本噪音灯：超标变红变绿。缺嵌入式，也可积分委托外包。想先在七八年级试点。',
    rewardPoints: 800
  },
  {
    account: '2026002',
    title: '校园二手漂流柜',
    content: '班级共享柜 + 扫码登记借还旧书旧物，想做成小硬件+小程序。',
    rewardPoints: 1200
  },
  {
    account: '2026002',
    title: '食堂窗口等待预估',
    content: '根据历史排队与就餐高峰，给出各窗口预计等待分钟数，先验证再上线。',
    rewardPoints: 600
  },
  {
    account: '2026003',
    title: '课间借书互助墙',
    content: '班级图书漂流：扫码登记借还、逾期提醒，想找人做小程序。',
    rewardPoints: 500
  },
  {
    account: '2026001',
    title: '体育课心率数据看板',
    content: '把现有心率带数据接到教室大屏，方便老师看运动强度。',
    rewardPoints: 900
  },
  {
    account: '2026002',
    title: '雨天走廊拥堵提示',
    content: '雨天放学走廊易堵，想做简易人流提示灯或广播文案系统。',
    rewardPoints: 700
  }
]

async function clearPlazaTables(pool) {
  console.log('[seed] --force: clearing plaza tables…')
  await pool.query('SET FOREIGN_KEY_CHECKS=0')
  for (const t of [
    'project_feedback',
    'backlink_events',
    'project_timeline',
    'project_members',
    'projects',
    'ideas',
    'forum_likes',
    'forum_comments',
    'forum_posts'
  ]) {
    try {
      await pool.query(`DELETE FROM ${t}`)
      console.log('  cleared', t)
    } catch (e) {
      console.warn('  skip', t, e.message)
    }
  }
  await pool.query('SET FOREIGN_KEY_CHECKS=1')
}

async function main() {
  const pool = await mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true
  })

  if (FORCE) await clearPlazaTables(pool)

  const tokens = {}
  async function login(no) {
    if (!tokens[no]) {
      const d = await req('POST', '/auth/login', { studentNo: no, password: '123456' })
      tokens[no] = d.token
    }
    return tokens[no]
  }

  // 确保演示账号有创造者身份（便于组队联调）
  for (const no of ['2026001', '2026002', '2026003']) {
    const [u] = await pool.query(`SELECT id FROM users WHERE student_no = ? LIMIT 1`, [no])
    if (u[0]) {
      await pool.query(
        `INSERT IGNORE INTO user_identities (user_id, identity, source) VALUES (?, '创造者', 'seed')`,
        [u[0].id]
      )
      await pool.query(
        `INSERT IGNORE INTO user_identities (user_id, identity, source) VALUES (?, '网络入门', 'seed')`,
        [u[0].id]
      )
    }
  }

  console.log('[seed] projects…')
  const doneIds = []
  const owners = ['2026001', '2026002', '2026003']
  for (let pi = 0; pi < PROJECTS.length; pi++) {
    const p = PROJECTS[pi]
    const account = owners[pi % owners.length]
    const token = await login(account)
    const data = await req(
      'POST',
      '/projects',
      {
        title: p.title,
        summary: p.summary,
        content: p.content,
        tech: p.tech,
        platform: p.platform,
        scene: p.scene,
        roles: p.roles || [],
        experienceUrl: p.experienceUrl || null,
        gate: 'creator',
        backlinkCommitted: true,
        status: 'recruiting'
      },
      token
    )
    for (const line of p.timeline || []) {
      await req('POST', `/projects/${data.id}/timeline`, { content: line }, token)
    }
    if (p.status === 'done') doneIds.push(data.id)
    console.log('  +', data.id, p.title, '→', account)
  }

  if (doneIds.length) {
    await pool.query(
      `UPDATE projects SET status = 'done' WHERE id IN (${doneIds.map(() => '?').join(',')})`,
      doneIds
    )
    console.log('[seed] marked done:', doneIds.join(','))
  }

  // 归属各账号「我的发布」（均分，不设 showcase）
  await pool.query(`UPDATE projects SET is_showcase = 0`)

  console.log('[seed] ideas…')
  for (let ii = 0; ii < IDEAS.length; ii++) {
    const i = IDEAS[ii]
    const account = owners[ii % owners.length]
    const token = await login(account)
    const data = await req(
      'POST',
      '/ideas',
      { title: i.title, content: i.content, rewardPoints: i.rewardPoints },
      token
    )
    console.log('  +', data.id, i.title, '→', account)
  }

  await pool.query(`UPDATE ideas SET is_showcase = 0`)
  console.log('[seed] projects/ideas owned evenly (not showcase)')

  const FORUM_POSTS = [
    {
      account: '2026003',
      boardSlug: 'project',
      title: '班级超级课表招后端 / 产品，创造者来组队',
      content:
        '执信增城试点班已在用课表导入。换课投票和作业提醒还缺后端与产品。组队门槛是创造者，欢迎来项目广场申请。',
      tags: ['招人', 'Vue', '校园']
    },
    {
      account: '2026001',
      boardSlug: 'share',
      title: '错题星球开放体验，欢迎回链提意见',
      content: '信息兴趣社已试用。意见会进项目反馈，回链会给成员加积分。',
      tags: ['Python', '成品', '回链']
    },
    {
      account: '2026002',
      boardSlug: 'help',
      title: '食堂窗口等待预估：有没有现成的人流做法？',
      content: '点子已在广场。想先验证可行性，有做过排队预估或统计的同学求带。',
      tags: ['求助', '数据', '校园']
    },
    {
      account: '2026001',
      boardSlug: 'qa',
      title: '校园气象站 MQTT 主题怎么约定比较稳？',
      content: '信息楼楼顶节点准备接 MQTT。想听听主题命名和 QoS 实践，项目也在广场招人。',
      tags: ['硬件', 'MQTT', '物联网']
    },
    {
      account: '2026003',
      boardSlug: 'campus',
      title: '晚自习座位预约上线前，想先收集各班痛点',
      content: '占座纠纷太多。已开招前端，也欢迎直接在帖子里说你们班的规则。',
      tags: ['校园', '产品']
    },
    {
      account: '2026002',
      boardSlug: 'project',
      title: '校园跑团打卡地图招前端 / 设计',
      content: '放学跑圈打卡上地图，周榜激励。已有跑团意向，缺地图页与视觉。',
      tags: ['招人', '运动', '地图']
    }
  ]

  console.log('[seed] forum…')
  for (const p of FORUM_POSTS) {
    const token = await login(p.account)
    const data = await req(
      'POST',
      '/forum/posts',
      {
        boardSlug: p.boardSlug,
        title: p.title,
        content: p.content,
        tags: p.tags
      },
      token
    )
    console.log('  +', data.id, p.title)
  }

  const list = await req('GET', '/projects?pageSize=50', null, await login('2026001'))
  const ideas = await req('GET', '/ideas?pageSize=50', null, await login('2026001'))
  const makers = await req('GET', '/makers?pageSize=50', null, await login('2026001'))
  const forum = await req('GET', '/forum/posts?pageSize=50', null, await login('2026001'))
  await pool.end()

  console.log(
    `[seed] done. projects=${list.total} ideas=${ideas.total ?? ideas.list?.length} makers=${makers.total} forum=${forum.total ?? forum.list?.length}`
  )
  console.log('打开 http://localhost:5173 进入广场查看真实数据')
}

main().catch((err) => {
  console.error('[seed] failed:', err.message)
  process.exit(1)
})
