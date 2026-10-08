/**
 * 论坛演示数据：多板块帖子 + 回复 + 热度
 * 用法：node scripts/seed-forum.js
 *       node scripts/seed-forum.js --force   # 清空论坛表后重灌
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

const POSTS = [
  {
    account: 'admin',
    boardSlug: 'campus',
    title: '【公告】科创广场论坛使用规范',
    content:
      '欢迎使用论坛。请文明发言、不发人身攻击；技术求助请附环境与报错；招人帖请写清技术栈与时间。违规帖将被隐藏。',
    tags: ['公告', '规范'],
    hot: true,
    pinned: true,
    likes: 42,
    views: 520,
    comments: [
      { account: 'teacher', content: '各班信息课可把本帖设为收藏，方便学生对照。' },
      { account: '2026001', content: '收到，发帖前会先看规范。' }
    ]
  },
  {
    account: 'teacher',
    boardSlug: 'help',
    title: '本周信息课答疑：MQTT / 串口问题集中回复',
    content:
      '周三晚自习前把问题发到本帖或「技术问答」。优先回答已写清设备型号、波特率与报错原文的同学。',
    tags: ['答疑', '教师', '硬件'],
    hot: true,
    pinned: true,
    likes: 31,
    views: 280,
    comments: [
      { account: '2026001', content: '老师，树莓派 USB 转串口丢包问题我也遇到了，已另开帖。' },
      { account: 'admin', content: '实验室设备清单已更新，需要借用的同学找王老师登记。' }
    ]
  },
  {
    account: '2026003',
    boardSlug: 'project',
    title: '超级课程表招后端 / 产品，有创造者一起吗？',
    content:
      '项目已在广场上架。换课投票和作业提醒还缺后端与产品。组队门槛是创造者，欢迎来项目主页申请。',
    tags: ['招人', 'Vue', '校园'],
    hot: true,
    likes: 18,
    views: 126,
    comments: [
      { account: '2026001', content: '我可以先看一下现有接口文档，周末有空。' },
      { account: '2026002', content: '产品侧我可以帮忙梳理换课投票流程。' },
      { account: 'teacher', content: '建议先把接口文档放到项目动态，方便审核组队质量。' }
    ]
  },
  {
    account: '2026001',
    boardSlug: 'share',
    title: '错题星球开放体验，欢迎回链提意见',
    content: '刷题小游戏已开放体验链接。意见会进项目反馈与讨论，回链会给成员加积分。',
    tags: ['Python', '成品', '回链'],
    hot: true,
    likes: 24,
    views: 210,
    comments: [
      { account: '2026003', content: '闯关节奏不错，建议加班级周榜。' },
      { account: 'teacher', content: '可以和信息课作业打通，周五我帮看一版评分表。' }
    ]
  },
  {
    account: '2026002',
    boardSlug: 'help',
    title: '食堂窗口等待预估：有没有现成的人流数据源？',
    content: '点子已发到广场。想先验证可行性，有做过排队预估或摄像头统计的同学求带。',
    tags: ['求助', '数据', '校园'],
    likes: 6,
    views: 88,
    comments: [{ account: 'admin', content: '校园开放数据目录在后台「学校开课」旁有说明，可先看是否有人流接口。' }]
  },
  {
    account: '2026001',
    boardSlug: 'qa',
    title: '物联网气象站 MQTT 主题怎么约定比较稳？',
    content: '教室外温湿度节点准备接 MQTT。想听听大家主题命名和 QoS 的实践，项目也在广场招人。',
    tags: ['硬件', 'MQTT', '物联网'],
    hot: true,
    likes: 15,
    views: 143,
    comments: [
      { account: '2026003', content: '建议 campus/{building}/{room}/sensor/{type}，QoS 1 足够。' },
      { account: 'teacher', content: '同意上述命名。实验室 Broker 账号找我开通，不要用默认密码。' }
    ]
  },
  {
    account: '2026003',
    boardSlug: 'campus',
    title: '晚自习座位预约上线前，想先收集各班痛点',
    content: '占座纠纷太多。项目方已开招前端，也欢迎直接在帖子里说你们班的规则。',
    tags: ['校园', '产品'],
    likes: 9,
    views: 97,
    comments: [{ account: '2026002', content: '我们班希望能按「先到先得 + 迟到释放」。' }]
  },
  {
    account: '2026002',
    boardSlug: 'qa',
    title: 'Vue 路由跳转后白屏，控制台报 Failed to resolve component',
    content: '本地开发时偶发，刷新又能好。怀疑异步组件和 keep-alive 冲突，求排查思路。',
    tags: ['Vue', '网络'],
    hot: true,
    likes: 21,
    views: 188,
    comments: [
      { account: '2026001', content: '先确认组件名和路由 name 是否一致，再看懒加载路径大小写。' },
      { account: '2026003', content: '我也遇到过，关掉 keep-alive 后稳定了。' }
    ]
  },
  {
    account: '2026001',
    boardSlug: 'help',
    title: 'RFID 闸机串口读卡偶发丢包，有人踩过坑吗？',
    content: '树莓派 + USB 转串口，波特率 9600。连续刷卡时大约 1/20 丢帧。',
    tags: ['硬件', '求助'],
    likes: 4,
    views: 62,
    comments: [{ account: 'teacher', content: '先换线与供电再测；仍丢包可把波特率降到 4800 做对照。' }]
  },
  {
    account: '2026003',
    boardSlug: 'share',
    title: 'Git 提交信息怎么写，新人友好版约定',
    content: '我们组用 feat/fix/docs 前缀，附带关联项目编号。欢迎补充你们班的规范。',
    tags: ['网络', '分享'],
    likes: 11,
    views: 134,
    comments: [
      { account: '2026002', content: '建议再加 chore，杂项别混进 feat。' },
      { account: 'admin', content: '后台导入名单脚本也建议用 docs: 前缀写变更说明。' }
    ]
  },
  {
    account: '2026002',
    boardSlug: 'rant',
    title: '吐槽：班级群文件找不到最新版课表',
    content: '每次都是「课表最终最终版(3).xlsx」。有没有自动同步到项目广场的方案？',
    tags: ['产品槽点', '校园'],
    likes: 27,
    views: 256,
    comments: [
      { account: '2026001', content: '可以做成项目：群机器人监听文件更新并回链到广场。' },
      { account: 'teacher', content: '做成点子发到广场，周五课上我们可以一起评审可行性。' }
    ]
  },
  {
    account: '2026001',
    boardSlug: 'project',
    title: '作业助手招算法 / 前端，OCR 通路已通',
    content: 'AI 批改只给步骤提示不给答案。缺提示词策略和家长端报告页，创造者优先。',
    tags: ['招人', 'AI', 'App'],
    hot: true,
    likes: 16,
    views: 171,
    comments: [{ account: '2026003', content: '前端我可以接家长端报告，私聊对一下接口。' }]
  },
  {
    account: '2026003',
    boardSlug: 'campus',
    title: '周末黑客松报名通道开了吗？',
    content: '想组队做「座位预约 + 课表」联动，有同学一起吗？',
    tags: ['校园', '招人'],
    likes: 8,
    views: 79,
    comments: [{ account: 'admin', content: '报名已开，名单由后台导入；未进名单的同学找信息老师登记。' }]
  },
  {
    account: '2026002',
    boardSlug: 'qa',
    title: '错题难度曲线怎么调才不会劝退？',
    content: '做刷题副本时，连续错 3 题就想退。有没有你们测出来的过关率？',
    tags: ['Python', '产品'],
    likes: 7,
    views: 91,
    comments: [{ account: '2026001', content: '我们按 70% 首通调，错题池再给一次降级题。' }]
  }
]

async function clearForum(pool) {
  console.log('[seed-forum] --force: clearing forum tables…')
  await pool.query('SET FOREIGN_KEY_CHECKS=0')
  for (const t of ['forum_likes', 'forum_comments', 'forum_posts']) {
    await pool.query(`DELETE FROM ${t}`)
    console.log('  cleared', t)
  }
  await pool.query('SET FOREIGN_KEY_CHECKS=1')
}

async function main() {
  const pool = await mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  })

  if (FORCE) await clearForum(pool)

  const tokens = {}
  async function login(no) {
    if (!tokens[no]) {
      const d = await req('POST', '/auth/login', { studentNo: no, password: '123456' })
      tokens[no] = d.token
    }
    return tokens[no]
  }

  console.log('[seed-forum] posts…')
  const created = []
  for (const p of POSTS) {
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
    created.push({ id: data.id, ...p })
    console.log('  +', data.id, p.title)

    for (const c of p.comments || []) {
      await req(
        'POST',
        `/forum/posts/${data.id}/comments`,
        { content: c.content },
        await login(c.account)
      )
    }

    await pool.query(
      `UPDATE forum_posts
       SET like_count = ?, view_count = ?, is_hot = ?, is_pinned = ?
       WHERE id = ?`,
      [p.likes || 0, p.views || 0, p.hot ? 1 : 0, p.pinned ? 1 : 0, data.id]
    )
  }

  const forum = await req('GET', '/forum/posts?pageSize=50&sort=hot', null, await login('2026001'))
  await pool.end()
  console.log(`[seed-forum] done. total=${forum.total} list=${forum.list?.length || 0}`)
  console.log('打开论坛页刷新即可看到帖子')
}

main().catch((err) => {
  console.error('[seed-forum] failed:', err.message)
  process.exit(1)
})
