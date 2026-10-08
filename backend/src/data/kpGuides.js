/**
 * 修炼关卡攻略（与 trainCatalog 节点 id 对齐）
 * 供前端同步 / 后端可选下发
 */

/** 官方主线配套 B 站网课 */
const OFFICIAL_BILI = {
  network: {
    kind: 'video',
    text: 'B站网课：4小时学会计算机基础 + Linux（零基础）',
    url: 'https://www.bilibili.com/video/BV1aA411x7Us/'
  },
  hardware: {
    kind: 'video',
    text: 'B站网课：零基础入门物联网 · ESP8266（太极创客）',
    url: 'https://www.bilibili.com/video/BV1L7411c7jw/'
  }
}

function biliCoursesForName(name) {
  const n = String(name || '')
  if (/物联|传感|RFID|MQTT|家居|ESP|智慧校园|智能/.test(n)) {
    return [OFFICIAL_BILI.hardware, OFFICIAL_BILI.network]
  }
  // 计算机 / 网络 / 商业 / 打印等通识：计算机基础课优先
  return [OFFICIAL_BILI.network, OFFICIAL_BILI.hardware]
}

/** 写入 PBL guideLines 的「标题 | video | url」行 */
function officialGuideLines(name) {
  return biliCoursesForName(name).map((g) => `${g.text} | video | ${g.url}`)
}

function quizGuide(name, q, opts, ai, _docs = []) {
  return {
    desc: `答对通关。本节对应「${name}」。不会就打开攻略视频或让 AI 讲。`,
    quiz: { q, opts },
    // 官方主线攻略：只挂 B 站网课视频
    guide: [...biliCoursesForName(name)],
    ai
  }
}

function workGuide(name, ai, _docs = []) {
  return {
    desc: `完成本节「${name}」作品任务即可通关。不会就看攻略视频或 AI。`,
    work: true,
    guide: [...biliCoursesForName(name)],
    ai
  }
}

function innovGuide(unitHint) {
  return workGuide(
    '再设计与微创新',
    `在「${unitHint}」基础上做一次小改进：换场景、加功能或优化体验，写清改了什么、为什么更好。`,
    ['微创新三问：为谁 / 改什么 / 如何验证']
  )
}

const KP_GUIDES = {
  // —— 计算机 / 互联网 ——
  'net-birth': quizGuide(
    '互联网的诞生与发展',
    '互联网最早主要服务于？',
    ['科研与军事通信需求，后逐渐民用普及', '只为游戏娱乐而生', '只用于电视直播'],
    '从阿帕网到万维网：先连起来，再让普通人用起来。记住「互联」是逐步开放的过程。'
  ),
  'net-use': quizGuide(
    '互联网的影响与使用',
    '合理使用互联网更重要的是？',
    ['辨识信息、保护隐私并文明上网', '无限制转发一切内容', '完全不使用搜索引擎'],
    '互联网改变学习、交往与生活方式；同时要有信息判断与自我保护意识。'
  ),
  'net-impact': workGuide(
    '互联网发展中的中国力量',
    '制作「中国互联网力量」策展卡片或时间轴：至少 3 个里程碑，并写清贡献点与资料出处。',
    ['策展：主题 / 展品 / 观众收获']
  ),
  'net-u1-innov': innovGuide('互联网博物馆策展'),

  'net-search': quizGuide(
    '互联网信息搜索',
    '提高搜索效果更有效的做法是？',
    ['用关键词、限定条件并交叉验证来源', '只搜一个模糊词并全信第一条', '从不换关键词'],
    '搜索像提问：关键词越准、来源越多，越容易找到可靠的文化资料。'
  ),
  'net-manage': workGuide(
    '互联网信息管理',
    '设计一套数字藏馆文件夹/标签方案（截图或表格），说明分类规则与备份策略。',
    ['管理三要素：分类、命名、备份']
  ),
  'net-process': workGuide(
    '互联网信息加工',
    '把搜集到的文化素材加工成图文/短视频脚本：写清主题、素材来源与呈现方式。',
    ['加工清单：筛选 → 整理 → 表达']
  ),
  'net-share': quizGuide(
    '互联网信息交流',
    '网络交流传播文化时更应做到？',
    ['尊重版权、标注出处并理性讨论', '随意盗用图片不署名', '人身攻击不同意见'],
    '交流不只是发出去，还包括礼仪、版权与反馈——让文化之声传得更远更可信。'
  ),
  'net-u2-innov': innovGuide('传统文化数字传播'),

  'net-web-plan': quizGuide(
    '网站的规划',
    '做非遗推广网站，规划阶段最该先明确？',
    ['目标用户、栏目结构与核心内容', '先选最炫的动画特效', '先买域名不管内容'],
    '先想清楚给谁看、看什么、怎么逛——再谈页面与美化。'
  ),
  'net-web-prep': workGuide(
    '网站开发前的准备',
    '提交网站准备包：目标用户、栏目草图、素材清单与选用工具说明。',
    ['准备：用户 / 结构 / 素材 / 工具']
  ),
  'net-web-build': workGuide(
    '网站的制作与美化',
    '完成一个非遗主题小站首页：含标题、导航、至少一块图文介绍，并说明美化思路。',
    ['制作要点：结构清晰、图文可读、风格统一']
  ),
  'net-web-publish': quizGuide(
    '网站的发布',
    '网站发布上线通常需要？',
    ['把网站文件放到可被访问的服务器/空间', '只存在本机从不上传', '关掉所有浏览器缓存即可'],
    '发布 = 让别人能通过网址访问到你的页面。先本地预览，再上传发布。'
  ),
  'net-u3-innov': innovGuide('非遗文化网站'),

  'net-interconnect': quizGuide(
    '互联网互联与互通',
    '校园网能上网，核心依赖的是？',
    ['设备互联与网络互通（含路由/交换）', '只靠教室电灯开关', '只靠黑板粉笔'],
    '互联是把设备连上，互通是让不同网络之间能通信——校园网就是典型场景。'
  ),
  'net-http': quizGuide(
    '互联网 HTTP 协议',
    '浏览器打开网页时，常用的应用层协议是？',
    ['HTTP/HTTPS', 'SMTP', '仅蓝牙'],
    'HTTP 像「点菜与上菜」：浏览器请求页面，服务器返回内容。HTTPS 多了加密保护。'
  ),
  'net-mail': workGuide(
    '互联网 SMTP/POP3 协议',
    '画一张邮件收发流程图，标注 SMTP 与 POP3/IMAP 各自职责，并配简短说明。',
    ['寄出 SMTP · 取信 POP3/IMAP']
  ),
  'net-tcpip': workGuide(
    '互联网 TCP/IP 协议',
    '画 TCP/IP 四层（或五层）示意，并用「发一条消息」例子说明数据如何向下封装。',
    ['分层：应用 → 传输 → 网络 → 链路']
  ),
  'net-u4-innov': innovGuide('校园网络系统'),

  'net-learn': quizGuide(
    '互联网学习新模式',
    '在线学习志愿服务知识体现的互联网价值是？',
    ['突破时空限制获取与分享知识', '只能线下抄黑板', '禁止使用任何视频课'],
    '慕课、直播课、知识库让「学志愿」可以随时随地发生。'
  ),
  'net-work': workGuide(
    '互联网工作新模式',
    '设计一份志愿活动「云协作」方案：工具选型、角色分工与一周日程板截图/示意。',
    ['协作：工具 + 分工 + 节奏']
  ),
  'net-travel': workGuide(
    '互联网出行新模式',
    '用地图/交通 App 规划一次志愿出行：截图路线、集合点与备用方案，并写安全注意。',
    ['出行：路线 / 时间 / 集合 / 安全']
  ),
  'net-u5-innov': innovGuide('社区志愿服务行动'),

  'net-sec-aware': quizGuide(
    '互联网安全意识',
    '下列哪项更符合安全上网意识？',
    ['警惕钓鱼链接，不轻信索要验证码', '把密码发到班级群方便大家', '随意下载未知来源安装包'],
    '防护之盾首先是意识：不点可疑链接、不泄露验证码、定期更新重要密码。'
  ),
  'net-sec-auth': workGuide(
    '互联网身份验证',
    '为班级系统画「登录与双因素验证」流程图，并说明各步防什么风险。',
    ['验证：密码 / 验证码 / 权限']
  ),
  'net-sec-crypto': quizGuide(
    '互联网信息加密',
    '信息加密更准确的理解是？',
    ['让未授权者难以读懂传输/存储的内容', '让网速永远翻倍', '删除所有日志'],
    '加密是「数据之钥」：HTTPS、端到端加密等，保护聊天与支付等内容不被窃听。'
  ),
  'net-u6-innov': innovGuide('互联网安全与防范'),

  'net-ai-code': workGuide(
    '代码生成',
    '用生成式 AI 辅助写一小段与学习助手相关的代码/伪代码，并说明你如何检查正确性。',
    ['提示词：目标 + 约束 + 验收']
  ),
  'net-ai-image': workGuide(
    '文本生成图像',
    '为「智能学习助手」展板写一段文生图提示词，并描述期望画面与风格。',
    ['提示词要素：主体、场景、风格、禁止项']
  ),
  'net-ai-ppt': workGuide(
    '演示文稿生成',
    '用 AI 辅助生成作品介绍大纲（3–5 页），并人工润色一处关键表述。',
    ['大纲：背景 → 功能 → 演示 → 收获']
  ),
  'net-u7-innov': innovGuide('生成式 AI 智能学习助手'),
  'net-boss': {
    desc: '综合通关：确认已完成全部单元后领取「网络入门」。',
    quiz: {
      q: '获得「网络入门」身份通常要求？',
      opts: ['完成计算机方向全部知识点闯关', '只改一次昵称', '只发一条帖子']
    },
    guide: [...biliCoursesForName('互联网计算机基础')],
    ai: '七个单元串起来，就是从「认识互联网」到「会用、会建、会护、会创新」。通关后解锁创造者相关能力。'
  },

  // —— 物联网 ——
  'hw-survey': quizGuide(
    '物联网的发展与应用',
    '物联网调研报告应重点写清？',
    ['发展脉络与典型应用场景', '只抄广告口号', '只写游戏攻略'],
    '先调研：物联网在哪里用、解决什么问题，再谈校园「物联化」。'
  ),
  'hw-arch': workGuide(
    '物联网的架构',
    '画校园物联改造架构图（感知/网络/应用），并标注一层设备与一层数据流。',
    ['架构：感知 → 网络 → 应用']
  ),
  'hw-u1-innov': innovGuide('校园物联化改造'),

  'hw-qr': quizGuide(
    '智能门票验证 · 二维码识别',
    '景区智能验票常用二维码，核心是？',
    ['快速识别编码信息并核验真伪/权限', '必须手工抄写票号', '只能离线永不联网'],
    '二维码把「票务信息」变成可扫的视觉编码，适合入口快速验证。'
  ),
  'hw-rfid': workGuide(
    '游客定位引导 · RFID',
    '设计景区 RFID 导览方案：标签放置、读写器位置与游客端提示流程（图或 PPT）。',
    ['RFID：标签 / 读写器 / 场景']
  ),
  'hw-ir': quizGuide(
    '人流量监测 · 红外传感',
    '红外传感用于人流监测时，主要感知？',
    ['人体/物体进出引起的红外变化', '空气中的 Wi-Fi 密码', '邮件 SMTP 报文'],
    '出入口装红外对射/热释电，可统计进出人次，辅助限流与调度。'
  ),
  'hw-multi': workGuide(
    '环境质量监测 · 多传感器融合',
    '设计多传感器环境监测方案：测什么、如何融合、告警阈值，附示意图。',
    ['融合：传感器清单 / 阈值 / 告警']
  ),
  'hw-u2-innov': innovGuide('景区智能管理 · 感知层'),

  'hw-comm': quizGuide(
    '智慧安防 · 数据通信与协议',
    '安防设备联网时需要约定？',
    ['数据通信方式与协议，保证互通可读', '只用口头传话', '禁止任何编码'],
    '摄像头、门禁要「说同一种话」——协议与通信方式决定数据能否可靠到达。'
  ),
  'hw-bt': workGuide(
    '智慧教室灯控 · 蓝牙',
    '画蓝牙灯控拓扑与控制流程（手机/网关/灯），说明距离与场景限制。',
    ['蓝牙：设备角色 / 控制流']
  ),
  'hw-wifi': quizGuide(
    '智慧校园无线网 · Wi-Fi',
    '校园 Wi-Fi 主要解决？',
    ['一定覆盖范围内的无线数据接入', '只给打印机供电', '替代全部有线安防专网（无条件）'],
    'Wi-Fi 是校园「无线底座」，支撑手机、传感器网关等接入。'
  ),
  'hw-mqtt': workGuide(
    '校园环境监测 · MQTT',
    '画 MQTT 主题树与消息流（传感→代理→应用），并给 2 个示例主题名。',
    ['MQTT：主题 / 发布 / 订阅']
  ),
  'hw-u3-innov': innovGuide('智慧校园 · 网络层'),

  'hw-local': workGuide(
    '温度超限本地报警',
    '设计本地闭环：温度超阈值 → 蜂鸣/指示灯报警。写清传感器、阈值与报警方式。',
    ['本地应用：采集 → 判断 → 就地反馈']
  ),
  'hw-remote': workGuide(
    '温度超限远程警示通知',
    '在本地报警基础上增加远程通知（App/短信/平台消息）设计说明。',
    ['远程反馈：上报云端 → 推送用户']
  ),
  'hw-control': workGuide(
    '远程开窗系统',
    '设计远程控制：手机指令 → 执行器开窗。写清指令链路与安全注意（误触/鉴权）。',
    ['远程控制：命令下发 → 执行 → 状态回传']
  ),
  'hw-smartwin': workGuide(
    '智能窗综合应用',
    '综合「感知 + 远程警示 + 远程控制」描述智能窗自动/半自动策略。',
    ['综合：超温开窗、异常告警、手动接管']
  ),
  'hw-u4-innov': innovGuide('智能家居系统实践'),

  'hw-health': workGuide(
    '健康监测物联网系统',
    '设计校园健康监测小系统方案：采集指标、上传链路与异常处置流程。',
    ['健康物联：指标 / 链路 / 处置']
  ),
  'hw-traffic': quizGuide(
    '智能交通物联网系统',
    '智能交通物联常用于？',
    ['车流监测、信号优化与出行信息发布等', '只给路灯换灯泡颜色', '取消所有传感器'],
    '路口与道路的传感数据进入平台，支撑疏导与出行决策。'
  ),
  'hw-farm': workGuide(
    '智能大棚物联网系统',
    '设计智能大棚方案：传感、执行器与自动控制逻辑，附一张系统框图。',
    ['大棚：传感 / 执行 / 策略']
  ),
  'hw-med': quizGuide(
    '智能药柜物联网系统',
    '智能药柜物联更关注？',
    ['药品存取权限、温控与过期提醒', '只展示广告海报', '随意无日志取药'],
    '医疗场景强调可追溯：谁取了药、环境是否合规、是否临期。'
  ),
  'hw-u5-innov': innovGuide('智慧城市物联网创新'),

  'hw-sec-risk': quizGuide(
    '物联网安全风险探究',
    '物联网安全风险常来自？',
    ['弱密码、未加密通信、设备裸奔上网等', '设备永远不会被攻击', '只关网页广告即可'],
    '设备多、入口多，风险面更大——先识别风险再谈防护。'
  ),
  'hw-sec-id': workGuide(
    '物联网中的虚拟身份',
    '画设备虚拟身份与权限模型，说明如何防冒充与越权。',
    ['身份：设备标识 / 认证 / 权限']
  ),
  'hw-sec-auto': quizGuide(
    '物联网的自主可控技术',
    '强调自主可控，更贴近？',
    ['关键芯片/协议/平台具备可控与可替代能力', '完全依赖未知闭源且不可审计组件', '禁止国产技术'],
    '物联网命脉在供应链与核心技术可控：安全、可持续、可演进。'
  ),
  'hw-u6-innov': innovGuide('物联网安全与发展'),
  'hw-boss': {
    desc: '综合通关：完成全部单元后领取「硬件入门」。',
    quiz: {
      q: '获得「硬件入门」通常要求？',
      opts: ['完成物联网方向全部知识点闯关', '只点亮一次 LED 照片即可永久跳过', '只注册账号']
    },
    guide: [...biliCoursesForName('物联网')],
    ai: '六单元从认识到实践再到安全：通关后具备硬件入门身份，并可解锁创造者相关能力。'
  },

  // —— 商业 / 打印（保留完整）——
  'biz-user': quizGuide(
    '用户与场景访谈',
    '做校园产品时，最先该弄清的是？',
    ['谁在什么场景下遇到什么麻烦', '先写一堆酷炫功能名', '先定融资估值'],
    '功能可以后补。先回答：谁用、在哪用、现在怎么将就。'
  ),
  'biz-pain': quizGuide(
    '槽点拆解与优先级',
    '槽点排序时更优先处理？',
    ['高频且阻碍主流程的问题', '只出现一次的吐槽表情包', '和业务无关的颜值争论'],
    '同一槽点出现多次，就该进产品待办。'
  ),
  'biz-prd': workGuide(
    '一页纸需求说明',
    '一页纸写清：谁、在哪痛、希望怎样、怎样算做成。',
    ['模板：场景 / 槽点 / 期望 / 验收']
  ),
  'biz-pitch': quizGuide(
    '30 秒电梯演讲',
    '电梯演讲最该先说清？',
    ['帮谁解决什么问题、结果是什么', '技术栈有多先进', '团队有多少人'],
    '先让对方听懂「跟我有关」，再谈技术。'
  ),
  'biz-price': quizGuide(
    '积分与定价直觉',
    '平台积分买来主要用来？',
    ['委托平台做成项目等贡献消耗', '只能兑换表情包', '必须全部捐给同学'],
    '活跃贡献得积分，不够再买——委托是把 idea 变成项目的付费通道。'
  ),
  'biz-channel': workGuide(
    '渠道与触达设计',
    '选一个真实可触达的校园场景，设计触达渠道。',
    ['渠道：班级群 / 海报 / 回链入口']
  ),
  'biz-metric': quizGuide(
    '北极星指标初识',
    '北极星指标更应该反映？',
    ['用户真实获得的核心价值', '页面按钮颜色数量', '团队开会次数'],
    '先选一个「做成了就说明有用」的数字，再围绕它迭代。'
  ),
  'biz-review': workGuide(
    '复盘与迭代节奏',
    '写一版两周复盘：做了什么 / 学到什么 / 下一步。',
    ['复盘三问']
  ),
  'biz-boss': {
    desc: '综合通关：领取「产品思维」。',
    quiz: {
      q: '商业副本通关更强调？',
      opts: ['用户价值、表达与复盘闭环', '只堆技术名词', '从不访谈用户']
    },
    guide: [...biliCoursesForName('计算机基础')],
    ai: '产品思维通关：会找问题、会说清楚、会迭代。'
  },
  'print-model': quizGuide(
    '认识切片与层高',
    '切片软件主要做什么？',
    ['把 3D 模型切成打印机可执行的层', '给模型上色滤镜', '自动写商业计划书'],
    '打印机吃的是一层一层的路径——这就是切片。'
  ),
  'print-safe': quizGuide(
    '打印安全与材料',
    '打印过程中更需要注意？',
    ['热床/喷头高温与通风', '必须戴耳机听播客', '关闭教室所有灯'],
    '先安全再出件。防烫、保持通风。'
  ),
  'print-make': workGuide(
    '完成一件小作品',
    '交作业写清：材料、层高、是否加支撑、实物是否达标。',
    ['任务：建模/选用 → 切片 → 打印 → 验收']
  ),
  'print-boss': {
    desc: '领取「DIY 打印高手」。',
    quiz: {
      q: '打印副本通关强调？',
      opts: ['安全完成从模型到实物', '只下载模型从不切片', '忽略高温风险']
    },
    guide: [...biliCoursesForName('计算机基础')],
    ai: '从模型到实物跑通一遍，就是打印入门。'
  }
}

const { KP_GUIDES_EXT } = require('./kpGuidesExt')
Object.assign(KP_GUIDES, KP_GUIDES_EXT)

/** 官方主线攻略只保留视频；并确保挂上两门 B 站网课 */
function ensureOfficialBiliVideos(entry, id) {
  if (!entry) return
  if (!Array.isArray(entry.guide)) entry.guide = []
  entry.guide = entry.guide.filter((g) => g && g.kind === 'video')
  const hasOfficial = entry.guide.some(
    (g) => g && /BV1aA411x7Us|BV1L7411c7jw/.test(String(g.url || ''))
  )
  if (hasOfficial) return
  entry.guide = entry.guide.filter((g) => {
    if (!g) return false
    const blob = `${g.text || ''}${g.url || ''}`
    return !(
      (/相关学习视频|search\.bilibili\.com|外链：.*视频/.test(blob) &&
        !/BV1aA411x7Us|BV1L7411c7jw/.test(blob))
    )
  })
  const hint = String(id || '').startsWith('hw')
    ? '物联网'
    : String(id || '').startsWith('net')
      ? '互联网计算机基础'
      : entry.guide.find((g) => g && g.text)?.text || id
  entry.guide.push(...biliCoursesForName(hint))
}

Object.keys(KP_GUIDES).forEach((id) => ensureOfficialBiliVideos(KP_GUIDES[id], id))

module.exports = { KP_GUIDES, OFFICIAL_BILI, biliCoursesForName, officialGuideLines }
