/**
 * 修炼副本目录
 * - network / 计算机 ← 互联网教材（七单元）
 * - hardware / 物联网 ← 物联网教材（六单元）
 * 级别：初级(beginner) / 中级(intermediate) / 高级(advanced)
 */

const TIERS = [
  { id: 'beginner', name: '初级', short: '初', desc: '打基础，建立核心概念' },
  { id: 'intermediate', name: '中级', short: '中', desc: '综合练习，串联知识' },
  { id: 'advanced', name: '高级', short: '高', desc: '进阶挑战，创新应用' }
]

const PATHS = [
  {
    id: 'network',
    title: '计算机',
    badge: '网络入门',
    blurb: '互联网影响、信息处理、网站制作、协议原理、创新应用、安全与生成式 AI',
    rewardIdentity: '网络入门',
    icon: '计'
  },
  {
    id: 'hardware',
    title: '物联网',
    badge: '硬件入门',
    blurb: '物联架构、感知层、网络层、系统实践、行业创新与安全发展',
    rewardIdentity: '硬件入门',
    icon: '物'
  },
  {
    id: 'business',
    title: '商业',
    badge: '产品思维',
    blurb: '产品、销售与校园触达',
    rewardIdentity: '产品思维',
    requiresAny: ['硬件入门', '网络入门', '创造者'],
    icon: '商'
  },
  {
    id: 'print',
    title: '3D 打印',
    badge: 'DIY 打印高手',
    blurb: '从模型到实物的扩展副本',
    rewardIdentity: 'DIY 打印高手',
    requiresUnlock: 'print',
    icon: '印'
  }
]

/** 教材单元（章） */
const CHAPTERS = {
  network: [
    {
      id: 'net-u1',
      name: '第一单元 · “互联网博物馆”策展——互联网及其影响',
      tier: 'beginner',
      nodes: [
        { id: 'net-birth', name: '互联网的诞生与发展', type: 'quiz' },
        { id: 'net-use', name: '互联网的影响与使用', type: 'quiz' },
        { id: 'net-impact', name: '互联网发展中的中国力量', type: 'work' },
        { id: 'net-u1-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'net-u2',
      name: '第二单元 · 中华优秀传统文化数字传播——互联网信息处理',
      tier: 'beginner',
      nodes: [
        { id: 'net-search', name: '互联网信息搜索', type: 'quiz' },
        { id: 'net-manage', name: '互联网信息管理', type: 'work' },
        { id: 'net-process', name: '互联网信息加工', type: 'work' },
        { id: 'net-share', name: '互联网信息交流', type: 'quiz' },
        { id: 'net-u2-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'net-u3',
      name: '第三单元 · 利用互联网推广中国非遗文化——网站制作',
      tier: 'intermediate',
      nodes: [
        { id: 'net-web-plan', name: '网站的规划', type: 'quiz' },
        { id: 'net-web-prep', name: '网站开发前的准备', type: 'work' },
        { id: 'net-web-build', name: '网站的制作与美化', type: 'work' },
        { id: 'net-web-publish', name: '网站的发布', type: 'quiz' },
        { id: 'net-u3-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'net-u4',
      name: '第四单元 · 搭建校园网络系统——互联网的基本原理',
      tier: 'intermediate',
      nodes: [
        { id: 'net-interconnect', name: '互联网互联与互通', type: 'quiz' },
        { id: 'net-http', name: '互联网 HTTP 协议', type: 'quiz' },
        { id: 'net-mail', name: '互联网 SMTP/POP3 协议', type: 'work' },
        { id: 'net-tcpip', name: '互联网 TCP/IP 协议', type: 'work' },
        { id: 'net-u4-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'net-u5',
      name: '第五单元 · 社区志愿服务行动——互联网创新应用',
      tier: 'intermediate',
      nodes: [
        { id: 'net-learn', name: '互联网学习新模式', type: 'quiz' },
        { id: 'net-work', name: '互联网工作新模式', type: 'work' },
        { id: 'net-travel', name: '互联网出行新模式', type: 'work' },
        { id: 'net-u5-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'net-u6',
      name: '第六单元 · 共同守护在线生活——互联网安全与防范',
      tier: 'advanced',
      nodes: [
        { id: 'net-sec-aware', name: '互联网安全意识', type: 'quiz' },
        { id: 'net-sec-auth', name: '互联网身份验证', type: 'work' },
        { id: 'net-sec-crypto', name: '互联网信息加密', type: 'quiz' },
        { id: 'net-u6-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'net-u7',
      name: '第七单元 · 智能学习助手——生成式 AI 赋能互联网创新',
      tier: 'advanced',
      nodes: [
        { id: 'net-ai-code', name: '代码生成', type: 'work' },
        { id: 'net-ai-image', name: '文本生成图像', type: 'work' },
        { id: 'net-ai-ppt', name: '演示文稿生成', type: 'work' },
        { id: 'net-u7-innov', name: '再设计与微创新', type: 'work' },
        { id: 'net-boss', name: '网络入门 · 通关', type: 'reward' }
      ]
    }
  ],
  hardware: [
    {
      id: 'hw-u1',
      name: '第一单元 · 校园“物联化”改造——初识物联网',
      tier: 'beginner',
      nodes: [
        { id: 'hw-survey', name: '物联网的发展与应用', type: 'quiz' },
        { id: 'hw-arch', name: '物联网的架构', type: 'work' },
        { id: 'hw-u1-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'hw-u2',
      name: '第二单元 · 景区智能管理系统——感知层初体验',
      tier: 'beginner',
      nodes: [
        { id: 'hw-qr', name: '智能门票验证 · 二维码识别', type: 'quiz' },
        { id: 'hw-rfid', name: '游客定位引导 · RFID', type: 'work' },
        { id: 'hw-ir', name: '人流量监测 · 红外传感', type: 'quiz' },
        { id: 'hw-multi', name: '环境质量监测 · 多传感器融合', type: 'work' },
        { id: 'hw-u2-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'hw-u3',
      name: '第三单元 · 智慧校园系统——网络层初体验',
      tier: 'intermediate',
      nodes: [
        { id: 'hw-comm', name: '智慧安防 · 数据通信与协议', type: 'quiz' },
        { id: 'hw-bt', name: '智慧教室灯控 · 蓝牙', type: 'work' },
        { id: 'hw-wifi', name: '智慧校园无线网 · Wi-Fi', type: 'quiz' },
        { id: 'hw-mqtt', name: '校园环境监测 · MQTT', type: 'work' },
        { id: 'hw-u3-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'hw-u4',
      name: '第四单元 · 智能家居系统——物联网系统实践',
      tier: 'intermediate',
      nodes: [
        { id: 'hw-local', name: '温度超限本地报警', type: 'work' },
        { id: 'hw-remote', name: '温度超限远程警示通知', type: 'work' },
        { id: 'hw-control', name: '远程开窗系统', type: 'work' },
        { id: 'hw-smartwin', name: '智能窗综合应用', type: 'work' },
        { id: 'hw-u4-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'hw-u5',
      name: '第五单元 · 智慧城市物联网设计——物联网创新应用',
      tier: 'advanced',
      nodes: [
        { id: 'hw-health', name: '健康监测物联网系统', type: 'work' },
        { id: 'hw-traffic', name: '智能交通物联网系统', type: 'quiz' },
        { id: 'hw-farm', name: '智能大棚物联网系统', type: 'work' },
        { id: 'hw-med', name: '智能药柜物联网系统', type: 'quiz' },
        { id: 'hw-u5-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'hw-u6',
      name: '第六单元 · 物联网安全保卫战——物联网安全与发展',
      tier: 'advanced',
      nodes: [
        { id: 'hw-sec-risk', name: '物联网安全风险探究', type: 'quiz' },
        { id: 'hw-sec-id', name: '物联网中的虚拟身份', type: 'work' },
        { id: 'hw-sec-auto', name: '物联网的自主可控技术', type: 'quiz' },
        { id: 'hw-u6-innov', name: '再设计与微创新', type: 'work' },
        { id: 'hw-boss', name: '硬件入门 · 通关', type: 'reward' }
      ]
    }
  ],
  business: require('./trainExtChapters').business,
  print: require('./trainExtChapters').print
}

/** 扁平 NODES：兼容旧 map API */
const NODES = {}
for (const [pathId, chapters] of Object.entries(CHAPTERS)) {
  NODES[pathId] = { beginner: [], intermediate: [], advanced: [] }
  for (const ch of chapters) {
    const tier = ch.tier || 'beginner'
    if (!NODES[pathId][tier]) NODES[pathId][tier] = []
    for (const n of ch.nodes) {
      NODES[pathId][tier].push({ ...n, chapterId: ch.id, chapterName: ch.name })
    }
  }
}

function getPath(pathId) {
  return PATHS.find((p) => p.id === pathId) || null
}

function listNodes(pathId, tierId) {
  return NODES[pathId]?.[tierId] || []
}

function listChapters(pathId, tierId) {
  const list = CHAPTERS[pathId] || []
  if (!tierId) return list
  return list.filter((ch) => ch.tier === tierId)
}

function allNodeKeys(pathId) {
  const out = []
  for (const tier of TIERS) {
    for (const node of listNodes(pathId, tier.id)) {
      out.push({ pathId, tierId: tier.id, nodeId: node.id, ...node })
    }
  }
  return out
}

/** 判断某级别是否全部通关（不含未出现的空级别） */
function tierNodeIds(pathId, tierId) {
  return listNodes(pathId, tierId).map((n) => n.id)
}

module.exports = {
  PATHS,
  TIERS,
  CHAPTERS,
  NODES,
  getPath,
  listNodes,
  listChapters,
  allNodeKeys,
  tierNodeIds
}
