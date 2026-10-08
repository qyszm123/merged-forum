/**
 * 职业学习种子（仿照 qyszm skill-knowledge）
 * 3 个职业 × 3 个技能，每个技能带知识 md
 * node scripts/seed-careers.js
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

const CAREERS = [
  {
    name: '前端工程师',
    description: '掌握网页界面开发，用代码构建用户看得见的产品',
    icon: '💻',
    color: '#3b82f6',
    required_points: 0,
    skills: [
      {
        name: 'HTML 与 CSS 基础',
        icon: '🎨',
        description: '网页骨架与样式，一切界面的起点',
        knowledge: `## HTML 与 CSS 基础

### HTML 骨架
**核心标签**
- div / span：通用容器
- a / img：链接与图片
- ul / li：列表
- form / input：表单

**语义化标签**
- header / nav / main / footer
- article / section / aside
- 优点：可读性、SEO、无障碍

### CSS 盒模型
**盒子组成**
- content → padding → border → margin
- box-sizing: border-box 让宽度包含 padding 和 border

**布局方式**
- Flexbox：一维布局（行或列）
- Grid：二维布局
- 定位：static / relative / absolute / fixed / sticky

### 选择器优先级
**优先级规则**
- !important > 内联 > id > class > 标签
- 同级时后写的覆盖先写的`
      },
      {
        name: 'JavaScript 入门',
        icon: '⚡',
        description: '让网页动起来的脚本语言',
        knowledge: `## JavaScript 入门

### 变量与类型
**声明方式**
- let：可变变量
- const：常量引用
- var：已弃用（函数作用域）

**数据类型**
- 基本类型：string / number / boolean / null / undefined / symbol
- 引用类型：object / array / function

### 函数
**箭头函数**
- (a, b) => a + b
- 没有自己的 this

**高阶函数**
- 接受函数作为参数（map / filter / reduce）
- 返回函数

### 异步编程
**Promise**
- pending → fulfilled / rejected
- .then() / .catch() / .finally()

**async / await**
- 用同步写法处理异步
- try / catch 捕获错误
- await 只能在 async 函数内`
      },
      {
        name: 'React 组件开发',
        icon: '⚛️',
        description: '组件化前端框架，构建可复用 UI',
        knowledge: `## React 组件开发

### 组件与 JSX
**函数组件**
- function App() { return <div /> }
- 接收 props 作为参数

**JSX 规则**
- JavaScript 的 XML 语法扩展
- 表达式用 {} 包裹
- className 替代 class

### Hooks
**常用 Hooks**
- useState：状态管理
- useEffect：副作用（请求、订阅、定时器）
- useRef：引用 DOM 或保存可变值
- useMemo / useCallback：性能优化

**依赖数组**
- [] 仅运行一次
- [a, b] 当依赖变化时运行
- 省略则每次渲染都运行

### 组件通信
**父传子**：通过 props
**子传父**：父传回调，子调用
**跨层**：Context API`
      }
    ]
  },
  {
    name: '后端工程师',
    description: '构建服务端逻辑，处理数据与业务，支撑产品运行',
    icon: '⚙️',
    color: '#10b981',
    required_points: 0,
    skills: [
      {
        name: 'Node.js 基础',
        icon: '🟢',
        description: 'JavaScript 服务端运行时',
        knowledge: `## Node.js 基础

### 模块系统
**CommonJS**
- require() 导入
- module.exports 导出
- 同步加载

**ES Modules**
- import / export
- 异步加载
- 现代项目推荐

### 事件循环
**核心机制**
- 单线程非阻塞 I/O
- 宏任务：setTimeout / setInterval / I/O
- 微任务：Promise.then / process.nextTick
- 微任务优先级高于宏任务

### npm 与包管理
**常用命令**
- npm install：安装依赖
- npm run：执行脚本
- npx：执行本地包

**package.json**
- dependencies：运行依赖
- devDependencies：开发依赖
- scripts：自定义命令`
      },
      {
        name: 'RESTful API 设计',
        icon: '🔌',
        description: '前后端通信的接口规范',
        knowledge: `## RESTful API 设计

### HTTP 方法语义
**常用方法**
- GET：查询资源（幂等）
- POST：创建资源
- PUT / PATCH：更新资源
- DELETE：删除资源

**状态码**
- 2xx 成功（200 OK / 201 Created）
- 4xx 客户端错误（400 / 401 / 403 / 404）
- 5xx 服务端错误（500 / 502 / 503）

### 资源路由
**RESTful 约定**
- GET /users 用户列表
- GET /users/:id 单个用户
- POST /users 创建用户
- PUT /users/:id 更新
- DELETE /users/:id 删除

**嵌套路由**
- GET /users/:id/posts 用户的帖子
- 资源关系清晰

### 接口设计原则
**一致性**
- 统一前缀（如 /api/v1）
- 统一返回结构（{ code, data, message }）
- 统一错误处理

**版本管理**
- URL 版本 /api/v2
- 避免破坏性变更`
      },
      {
        name: 'SQL 与数据库',
        icon: '🗄️',
        description: '关系型数据库查询与设计',
        knowledge: `## SQL 与数据库

### 基础查询
**CRUD**
- SELECT：查询
- INSERT：插入
- UPDATE：更新
- DELETE：删除

**常用子句**
- WHERE：过滤条件
- ORDER BY：排序
- LIMIT / OFFSET：分页
- GROUP BY：分组聚合

### 关联查询
**JOIN 类型**
- INNER JOIN：交集
- LEFT JOIN：左表全部 + 右表匹配
- RIGHT JOIN：右表全部 + 左表匹配
- ON 指定关联条件

**聚合函数**
- COUNT / SUM / AVG / MAX / MIN
- 配合 GROUP BY 使用

### 表设计
**字段类型**
- INT / BIGINT：整数
- VARCHAR(n)：变长字符串
- TEXT / MEDIUMTEXT：长文本
- DATETIME：时间
- TINYINT(1)：布尔

**约束**
- PRIMARY KEY：主键
- UNIQUE：唯一
- NOT NULL：非空
- FOREIGN KEY：外键
- INDEX：索引加速查询`
      }
    ]
  },
  {
    name: '产品经理',
    description: '理解用户需求，规划产品方向，协调团队交付',
    icon: '📋',
    color: '#f59e0b',
    required_points: 0,
    skills: [
      {
        name: '需求分析',
        icon: '🔍',
        description: '挖掘真实需求，明确要解决的问题',
        knowledge: `## 需求分析

### 需求来源
**常见来源**
- 用户反馈与客诉
- 数据分析发现的问题
- 业务方提出的目标
- 竞品对标

**需求辨伪**
- 用户说要一匹更快的马（表层需求）
- 真实需求是更快的到达（本质需求）
- 多问"为什么"挖掘本质

### 需求优先级
**四象限法**
- 重要且紧急：立即做
- 重要不紧急：规划做
- 紧急不重要：委托做
- 不重要不紧急：暂不做

**KANO 模型**
- 基础需求：没有就不满
- 期望需求：越多越好
- 兴奋需求：没有也行，有了惊喜

### 需求文档
**PRD 要素**
- 背景与目标
- 用户场景
- 功能描述
- 流程图
- 验收标准`
      },
      {
        name: '原型设计',
        icon: '✏️',
        description: '用低保真原型快速验证想法',
        knowledge: `## 原型设计

### 原型层级
**低保真**
- 纸笔草图
- 线框图
- 快速验证流程

**高保真**
- 接近最终视觉
- 含交互细节
- 用于开发交接

### 设计工具
**常用工具**
- Figma：协作设计
- 墨刀：国产原型
- Axure：复杂交互

**组件库**
- 复用按钮、表单、卡片
- 保持一致性
- 提升效率

### 交互原则
**核心原则**
- 一致性：相似操作相似反馈
- 反馈：每个操作有可见响应
- 容错：可撤销、可恢复
- 简洁：减少不必要的步骤

**流程设计**
- 主流程顺畅
- 异常分支考虑
- 空状态/加载/错误状态`
      },
      {
        name: '项目管理',
        icon: '📅',
        description: '协调资源推动项目按时交付',
        knowledge: `## 项目管理

### 项目阶段
**生命周期**
- 启动：明确目标与范围
- 规划：拆解任务与排期
- 执行：分配与推进
- 监控：跟进进度与风险
- 收尾：验收与复盘

### 任务拆解
**WBS**
- 工作分解结构
- 自顶向下拆分
- 每个任务可估算、可分配

**估算方法**
- 类比法：参考历史
- 三点估算：乐观/悲观/最可能
- 留缓冲时间

### 风险管理
**风险识别**
- 技术风险：可行性未知
- 人员风险：请假/离职
- 外部风险：依赖方延期

**应对策略**
- 规避：改变计划避开
- 减轻：降低概率或影响
- 转移：外包或保险
- 接受：预留应急

### 沟通协作
**站会**
- 每日同步进度
- 15 分钟内
- 说三件事：昨天/今天/阻塞

**复盘**
- 项目结束总结
- 做得好的继续
- 做得不好的改进`
      }
    ]
  }
]

async function run() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: false
  })

  let careerCount = 0
  let skillCount = 0

  for (const c of CAREERS) {
    const [exist] = await conn.execute('SELECT id FROM careers WHERE name = ? LIMIT 1', [c.name])
    let careerId
    if (exist && exist.length) {
      careerId = exist[0].id
      await conn.execute(
        'UPDATE careers SET description=?, icon=?, color=?, required_points=?, is_active=1 WHERE id=?',
        [c.description, c.icon, c.color, c.required_points, careerId]
      )
    } else {
      const [r] = await conn.execute(
        'INSERT INTO careers (name, description, icon, color, required_points) VALUES (?,?,?,?,?)',
        [c.name, c.description, c.icon, c.color, c.required_points]
      )
      careerId = r.insertId
    }
    careerCount++

    for (let i = 0; i < c.skills.length; i++) {
      const s = c.skills[i]
      const [sExist] = await conn.execute(
        'SELECT id FROM career_skills WHERE career_id=? AND name=? LIMIT 1',
        [careerId, s.name]
      )
      if (sExist && sExist.length) {
        await conn.execute(
          'UPDATE career_skills SET description=?, icon=?, knowledge_content=?, order_num=? WHERE id=?',
          [s.description, s.icon, s.knowledge, i, sExist[0].id]
        )
      } else {
        await conn.execute(
          'INSERT INTO career_skills (career_id, name, description, icon, knowledge_content, order_num) VALUES (?,?,?,?,?,?)',
          [careerId, s.name, s.description, s.icon, s.knowledge, i]
        )
      }
      skillCount++
    }
  }

  console.log(`[seed-careers] ${careerCount} careers, ${skillCount} skills seeded`)
  await conn.end()
}

run().catch((err) => {
  console.error('[seed-careers] failed:', err.message)
  process.exit(1)
})
