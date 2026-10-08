/**
 * 职业结业考试题库种子（基于职业技能基础知识 md 出题）
 * node scripts/seed-career-exam.js
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

const QUESTIONS = {
  前端工程师: [
    {
      question: 'CSS 盒模型中设置 box-sizing: border-box 后，元素的 width 包含哪些部分？',
      options: { A: '仅内容 content', B: '内容 + 内边距 padding + 边框 border', C: '内容 + 外边距 margin', D: '仅内容 + 内边距' },
      answer: 'B',
      explanation: 'border-box 让宽度包含 padding 和 border，布局更直观'
    },
    {
      question: '下列哪组都是 HTML 的语义化标签？',
      options: { A: 'div / span', B: 'table / tr / td', C: 'header / nav / main / footer', D: 'script / style' },
      answer: 'C',
      explanation: '语义化标签优点：可读性强、利于 SEO、支持无障碍'
    },
    {
      question: '关于 var 声明的变量，下列说法正确的是？',
      options: { A: '具有块级作用域', B: '声明的是常量', C: '函数作用域，已被弃用', D: '不能重新赋值' },
      answer: 'C',
      explanation: 'var 是函数作用域且允许重复声明，现代开发用 let / const 替代'
    },
    {
      question: 'Promise 的状态流转是？',
      options: { A: 'pending → fulfilled / rejected', B: 'fulfilled → pending', C: 'rejected → fulfilled', D: '可以在三个状态间循环' },
      answer: 'A',
      explanation: 'Promise 从 pending 出发，只能单向变为 fulfilled 或 rejected'
    },
    {
      question: 'React 中 useEffect(fn, []) 的含义是？',
      options: { A: '每次渲染都执行', B: '任意状态变化时执行', C: '仅在组件挂载后执行一次', D: '永远不会执行' },
      answer: 'C',
      explanation: '空依赖数组 [] 表示副作用只在挂载时运行一次'
    }
  ],
  后端工程师: [
    {
      question: 'Node.js 事件循环中，微任务与宏任务的执行优先级是？',
      options: { A: '宏任务优先', B: '微任务优先（如 Promise.then 先于 setTimeout）', C: '同时执行', D: '随机顺序' },
      answer: 'B',
      explanation: '微任务（Promise.then / process.nextTick）优先级高于宏任务（setTimeout / I/O）'
    },
    {
      question: 'HTTP GET 方法的语义是？',
      options: { A: '创建资源', B: '更新资源', C: '查询资源（幂等）', D: '删除资源' },
      answer: 'C',
      explanation: 'GET 用于查询资源，天然幂等，不应产生副作用'
    },
    {
      question: '状态码 401 表示？',
      options: { A: '服务器内部错误', B: '未认证（未登录或凭证无效）', C: '已登录但无权限', D: '资源不存在' },
      answer: 'B',
      explanation: '401 未认证，403 已认证但无权限，404 资源不存在'
    },
    {
      question: 'SQL 中 LEFT JOIN 的结果集是？',
      options: { A: '仅两表都匹配的行', B: '左表全部行 + 右表匹配行（无匹配则 NULL）', C: '右表全部行', D: '两表的笛卡尔积' },
      answer: 'B',
      explanation: 'LEFT JOIN 保留左表全部行，右表无匹配时补 NULL'
    },
    {
      question: 'CommonJS 模块规范中，导出使用？',
      options: { A: 'export default', B: 'module.exports / exports', C: 'import', D: 'export const' },
      answer: 'B',
      explanation: 'CommonJS 用 require() 导入、module.exports 导出；import/export 属于 ES Modules'
    }
  ],
  产品经理: [
    {
      question: 'KANO 模型中“基础需求”的特点是？',
      options: { A: '有了会让用户惊喜', B: '没有就会不满，有了也觉得理所当然', C: '越多越好', D: '可有可无' },
      answer: 'B',
      explanation: '基础需求是默认预期：缺失引发强烈不满，满足也不加分'
    },
    {
      question: '用户说“我要一匹更快的马”，产品经理正确的做法是？',
      options: { A: '立刻去找更快的马', B: '多问为什么，挖掘“更快到达”的本质需求', C: '直接拒绝该需求', D: '按用户字面意思照做' },
      answer: 'B',
      explanation: '表层诉求背后是本质需求，多问“为什么”才能辨伪和挖掘真需求'
    },
    {
      question: '需求四象限法中，“重要且紧急”的需求应该？',
      options: { A: '立即做', B: '规划后做', C: '委托他人做', D: '暂不做' },
      answer: 'A',
      explanation: '重要且紧急 → 立即做；重要不紧急 → 规划做；紧急不重要 → 委托做'
    },
    {
      question: '每日站会需要说清楚的三件事是？',
      options: { A: '昨天做了什么 / 今天计划做什么 / 遇到的阻塞', B: '心情 / 天气 / 午饭', C: '只汇报进度', D: '只提问题' },
      answer: 'A',
      explanation: '站会三件事：昨天、今天、阻塞，控制在 15 分钟内'
    },
    {
      question: 'WBS 的含义是？',
      options: { A: '工作分解结构，自顶向下拆分任务', B: '一种数据库索引', C: '周报系统', D: '自动化测试框架' },
      answer: 'A',
      explanation: 'WBS（Work Breakdown Structure）自顶向下拆分，使每个任务可估算、可分配'
    }
  ]
}

async function run() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  })

  let count = 0
  for (const [careerName, list] of Object.entries(QUESTIONS)) {
    const [cs] = await conn.execute('SELECT id FROM careers WHERE name = ? LIMIT 1', [careerName])
    if (!cs || !cs.length) {
      console.warn(`[seed-career-exam] 职业不存在，跳过: ${careerName}`)
      continue
    }
    const careerId = cs[0].id
    for (const q of list) {
      const [exist] = await conn.execute(
        'SELECT id FROM career_questions WHERE career_id = ? AND question = ? LIMIT 1',
        [careerId, q.question]
      )
      if (exist && exist.length) {
        await conn.execute('UPDATE career_questions SET options=?, answer=?, explanation=? WHERE id=?', [
          JSON.stringify(q.options), q.answer, q.explanation, exist[0].id
        ])
      } else {
        await conn.execute(
          'INSERT INTO career_questions (career_id, question, options, answer, explanation) VALUES (?,?,?,?,?)',
          [careerId, q.question, JSON.stringify(q.options), q.answer, q.explanation]
        )
      }
      count++
    }
  }

  console.log(`[seed-career-exam] ${count} questions seeded`)
  await conn.end()
}

run().catch((err) => {
  console.error('[seed-career-exam] failed:', err.message)
  process.exit(1)
})
