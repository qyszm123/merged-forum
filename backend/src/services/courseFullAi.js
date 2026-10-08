/**
 * 教师/管理员新建副本：AI 生成完整课纲 + 单元内容包
 * （题库、攻略讲义、实践说明、AI 讲解）
 */
const deepseek = require('./deepseek')
const { officialGuideLines, biliCoursesForName } = require('../data/kpGuides')
const courseQuizAi = require('./courseQuizAi')
const { AI_KIND_RULE, AI_FORMAT_RULE, kindForSlot, normalizeQuestionKind, kindLabel } = require('../data/questionKinds')

function extractJson(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    /* continue */
  }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    try {
      return JSON.parse(fence[1].trim())
    } catch {
      /* continue */
    }
  }
  const objStart = raw.indexOf('{')
  const objEnd = raw.lastIndexOf('}')
  if (objStart >= 0 && objEnd > objStart) {
    try {
      return JSON.parse(raw.slice(objStart, objEnd + 1))
    } catch {
      /* continue */
    }
  }
  const arrStart = raw.indexOf('[')
  const arrEnd = raw.lastIndexOf(']')
  if (arrStart >= 0 && arrEnd > arrStart) {
    try {
      return JSON.parse(raw.slice(arrStart, arrEnd + 1))
    } catch {
      return null
    }
  }
  return null
}

function withRequires(nodes) {
  return (nodes || []).map((n, i, arr) => ({
    ...n,
    requires: Array.isArray(n.requires) ? n.requires : i ? [arr[i - 1].id] : []
  }))
}

/**
 * AI 懒人步骤二生成前的起步骨架（刷题 + 实践），非手动模式默认任务。
 * 手动精细化创课应使用空 chapters []，由教师点「＋ 加任务」自行添加。
 */
function emptyManualChapters(pathId, title) {
  const t = String(title || '本课').trim() || '本课'
  return [
    {
      id: `${pathId}-u1`,
      name: t,
      tier: 'beginner',
      nodes: withRequires([
        { id: `${pathId}-u1-q1`, name: '普通题', type: 'quiz' },
        { id: `${pathId}-u1-w1`, name: '实践题', type: 'work' }
      ])
    }
  ]
}

/** 骨架 id 固定，仅名称可被 AI 改写 */
function skeletonChapters(pathId, title) {
  const t = String(title || '本课').trim() || '本课'
  const firstUnit = /入门/u.test(t) ? `第一单元 · ${t}` : `第一单元 · ${t}入门`
  return [
    {
      id: `${pathId}-u1`,
      name: firstUnit,
      tier: 'beginner',
      nodes: [
        { id: `${pathId}-u1-q1`, name: '认识与目标', type: 'quiz' },
        { id: `${pathId}-u1-q2`, name: '基础概念', type: 'quiz' },
        { id: `${pathId}-u1-w1`, name: '入门小练', type: 'work' }
      ]
    },
    {
      id: `${pathId}-u2`,
      name: `第二单元 · 方法与工具`,
      tier: 'beginner',
      nodes: [
        { id: `${pathId}-u2-q1`, name: '方法要点', type: 'quiz' },
        { id: `${pathId}-u2-w1`, name: '工具实践', type: 'work' }
      ]
    },
    {
      id: `${pathId}-u3`,
      name: `第三单元 · 综合应用（初级）`,
      tier: 'beginner',
      nodes: [
        { id: `${pathId}-u3-q1`, name: '综合自测', type: 'quiz' },
        { id: `${pathId}-u3-w1`, name: '初级作品', type: 'work' },
        { id: `${pathId}-beginner-boss`, name: `${t} · 初阶通关`, type: 'reward' }
      ]
    },
    {
      id: `${pathId}-u4`,
      name: `第四单元 · 进阶深化`,
      tier: 'intermediate',
      nodes: [
        { id: `${pathId}-u4-q1`, name: '进阶概念', type: 'quiz' },
        { id: `${pathId}-u4-q2`, name: '案例分析', type: 'quiz' },
        { id: `${pathId}-u4-w1`, name: '进阶实践', type: 'work' }
      ]
    },
    {
      id: `${pathId}-u5`,
      name: `第五单元 · 项目实战`,
      tier: 'intermediate',
      nodes: [
        { id: `${pathId}-u5-q1`, name: '项目要点', type: 'quiz' },
        { id: `${pathId}-u5-w1`, name: '阶段作品', type: 'work' },
        { id: `${pathId}-mid-boss`, name: `${t} · 中阶通关`, type: 'reward' }
      ]
    },
    {
      id: `${pathId}-u6`,
      name: `第六单元 · 高阶创作与答辩`,
      tier: 'advanced',
      nodes: [
        { id: `${pathId}-u6-q1`, name: '高阶自测', type: 'quiz' },
        { id: `${pathId}-u6-w1`, name: '毕业作品', type: 'work' },
        { id: `${pathId}-boss`, name: `${t} · 通关认证`, type: 'reward' }
      ]
    }
  ].map((ch) => ({ ...ch, nodes: withRequires(ch.nodes) }))
}

function applyNameMap(skel, nameMap) {
  if (!nameMap || typeof nameMap !== 'object') return skel
  return skel.map((ch) => {
    const chName = String(nameMap[ch.id] || ch.name || '').trim() || ch.name
    const nodes = (ch.nodes || []).map((n) => ({
      ...n,
      name: String(nameMap[n.id] || n.name || '').trim() || n.name
    }))
    return { ...ch, name: chName, nodes: withRequires(nodes) }
  })
}

/** 保证每单元至少有一个 quiz 节点（否则无法生成刷题题库） */
function ensureChapterHasQuiz(nodes, chId) {
  const list = [...(nodes || [])]
  if (list.some((n) => n.type === 'quiz')) return list
  const workIdx = list.findIndex((n) => n.type === 'work')
  const rewardIdx = list.findIndex((n) => n.type === 'reward')
  const insertAt = workIdx >= 0 ? workIdx : rewardIdx >= 0 ? rewardIdx : list.length
  list.splice(insertAt, 0, {
    id: `${chId}-q1`,
    name: '概念自测',
    type: 'quiz'
  })
  return list
}

/**
 * 将 AI 返回的松散课纲规范化为固定 pathId 前缀的章节
 */
function normalizeAiChapters(pathId, title, parsed) {
  const src = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.chapters)
      ? parsed.chapters
      : []
  if (!src.length) return null

  const tiers = ['beginner', 'intermediate', 'advanced']
  const out = []
  src.slice(0, 8).forEach((ch, ci) => {
    if (!ch || typeof ch !== 'object') return
    const chId = `${pathId}-u${ci + 1}`
    let tier = String(ch.tier || tiers[Math.min(2, Math.floor(ci / 3))] || 'beginner').toLowerCase()
    if (!tiers.includes(tier)) tier = tiers[Math.min(2, Math.floor(ci / 3))]
    const rawNodes = Array.isArray(ch.nodes) ? ch.nodes : []
    const nodes = []
    let qi = 0
    let wi = 0
    let ri = 0
    rawNodes.slice(0, 6).forEach((n) => {
      if (!n || typeof n !== 'object') return
      let type = String(n.type || 'quiz').toLowerCase()
      if (!['quiz', 'work', 'reward'].includes(type)) type = 'quiz'
      let nid
      if (type === 'quiz') {
        qi += 1
        nid = `${chId}-q${qi}`
      } else if (type === 'work') {
        wi += 1
        nid = `${chId}-w${wi}`
      } else {
        ri += 1
        nid = ri === 1 && ci === src.length - 1 ? `${pathId}-boss` : `${chId}-r${ri}`
      }
      const name = String(n.name || n.title || '').trim() || (type === 'work' ? '实践创作' : type === 'reward' ? '通关认证' : '知识点自测')
      nodes.push({ id: nid, name: name.slice(0, 64), type })
    })
    if (!nodes.length) {
      nodes.push({ id: `${chId}-q1`, name: '概念自测', type: 'quiz' })
      nodes.push({ id: `${chId}-w1`, name: '小练实践', type: 'work' })
    }
    const name =
      String(ch.name || ch.title || '').trim() ||
      `第${ci + 1}单元 · ${String(title || '本课').slice(0, 20)}`
    out.push({
      id: chId,
      name: name.slice(0, 80),
      tier,
      nodes: withRequires(ensureChapterHasQuiz(nodes, chId))
    })
  })

  if (!out.length) return null
  // 确保末关有 reward
  const last = out[out.length - 1]
  if (!(last.nodes || []).some((n) => n.type === 'reward')) {
    last.nodes = withRequires([
      ...(last.nodes || []),
      {
        id: `${pathId}-boss`,
        name: `${String(title || '本课').slice(0, 24)} · 通关认证`,
        type: 'reward'
      }
    ])
  }
  return out
}

/**
 * AI 懒人模式：根据课程目标 + 上传/外链资源自动拆关
 */
async function generateCurriculumFromGoals({
  pathId,
  title,
  blurb,
  goals,
  resourcesBrief,
  rewardIdentity
}) {
  if (!deepseek.isConfigured()) return null

  try {
    const { text } = await deepseek.chat(
      [
        {
          role: 'system',
          content:
            '你是中学 STEM / 信息科技课程设计师，服务「科创广场」教师自建副本。' +
            '只输出一个 JSON 对象，不要 Markdown。' +
            '根据课程目标与教师提供的资源，自动拆成 3～7 个关卡单元（chapters）。' +
            '优先按资源顺序/主题拆关；资源不足时按教学目标递进（入门→方法→实践→综合）。' +
            '每个单元含 2～5 个节点；type 只能是 quiz / work / reward；末单元应有 reward。' +
            '每个单元至少 1 个 quiz（自测刷题）+ 至少 1 个 work（实践），禁止整关只有 work 没有 quiz。' +
            '节点名称具体可教学，禁止空泛套话。'
        },
        {
          role: 'user',
          content: [
            `课程：${title}`,
            blurb ? `简介：${blurb}` : '',
            goals ? `课程目标：\n${goals}` : '',
            rewardIdentity ? `通关身份：${rewardIdentity}` : '',
            resourcesBrief
              ? `教师提供的资源（请据此拆关，视频/文档/音频/B站等外链均可作为关卡素材来源）：\n${resourcesBrief}`
              : '教师暂未上传资源，请仅按目标拆关。',
            '输出 JSON 形状：',
            '{"chapters":[{"name":"第一单元 · …","tier":"beginner","nodes":[{"name":"…","type":"quiz"},{"name":"…","type":"work"}]}]}',
            'tier 取值 beginner|intermediate|advanced。不要输出 id 字段（服务端会生成）。'
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      { maxTokens: 3200, temperature: 0.4, timeoutMs: 90000 }
    )

    const parsed = extractJson(text)
    const chapters = normalizeAiChapters(pathId, title, parsed)
    if (!chapters?.length) {
      console.warn('[courseFullAi] 课纲拆分无效，将用默认结构')
      return null
    }
    return chapters
  } catch (err) {
    console.warn('[courseFullAi] 课纲拆分失败', err.message)
    return null
  }
}

async function generateCurriculumNames({ pathId, title, blurb, rewardIdentity }) {
  if (!deepseek.isConfigured()) return null
  const skel = skeletonChapters(pathId, title)
  const idList = skel
    .flatMap((ch) => [
      `单元 ${ch.id} = ${ch.name}`,
      ...ch.nodes.map((n) => `  节点 ${n.id} (${n.type}) = ${n.name}`)
    ])
    .join('\n')

  try {
    const { text } = await deepseek.chat(
      [
        {
          role: 'system',
          content:
            '你是中学 STEM / 信息科技课程设计师。只输出一个 JSON 对象：键为下方给出的 id，值为改写后的中文名称。' +
            '名称必须紧扣课程主题，具体、可教学，禁止空泛词原样保留。不要 Markdown，不要解释。'
        },
        {
          role: 'user',
          content: [
            `课程：${title}`,
            blurb ? `简介：${blurb}` : '',
            rewardIdentity ? `通关身份：${rewardIdentity}` : '',
            '请为下列 id 生成贴合本课的名称（只改名称，不要改 id）：',
            idList,
            '输出示例：{"' + pathId + '-u1":"第一单元 · ……","' + pathId + '-u1-q1":"……"}'
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      { maxTokens: 2200, temperature: 0.4, timeoutMs: 60000 }
    )

    const parsed = extractJson(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('[courseFullAi] 课纲命名无效，将用默认结构')
      return null
    }
    return applyNameMap(skel, parsed)
  } catch (err) {
    console.warn('[courseFullAi] 课纲命名失败', err.message)
    return null
  }
}

function fallbackGuides(courseTitle, chapter) {
  const lines = officialGuideLines(chapter?.name || courseTitle)
  return [
    {
      kind: 'doc',
      text: `单元导读：${chapter?.name || courseTitle}`,
      body: `本单元属于「${courseTitle}」。先看导读与视频，再完成自测/实践。抓住 2～3 个核心概念即可推进。`
    },
    ...lines.map((line) => {
      const parts = String(line).split('|').map((s) => s.trim())
      return {
        kind: 'video',
        text: parts[0] || '学习视频',
        url: parts[2] || parts[1] || ''
      }
    })
  ]
}

function fallbackWorkBriefs(courseTitle, chapter) {
  const out = {}
  ;(chapter?.nodes || [])
    .filter((n) => n.type === 'work')
    .forEach((n) => {
      out[n.id] =
        `围绕「${courseTitle}」完成本节「${n.name}」：提交可展示的作品（设计图/流程图/PPT/短视频任选），` +
        `说明里写清：做了什么、用到哪些本课知识、还有什么可改进。建议说明不少于 40 字。`
    })
  return out
}

function fallbackNodeAi(courseTitle, chapter) {
  const out = {}
  ;(chapter?.nodes || []).forEach((n) => {
    out[n.id] =
      n.type === 'work'
        ? `作品关「${n.name}」：对齐课程「${courseTitle}」的本单元目标，先列提纲再动手，上传后用说明证明你理解了关键步骤。`
        : `知识点「${n.name}」属于「${courseTitle}」。先看攻略讲义/视频，抓住定义与典型例子，再回来刷题到分数线。`
  })
  return out
}

function normalizeGuides(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((g) => {
      if (!g || typeof g !== 'object') return null
      const text0 = String(g.text || g.title || '').trim()
      if (!text0) return null
      const kind =
        /video|视频|bilibili|b站/i.test(String(g.kind || '')) ||
        /bilibili\.com/i.test(String(g.url || ''))
          ? 'video'
          : 'doc'
      return {
        kind,
        text: text0.slice(0, 120),
        url: String(g.url || g.href || '').trim(),
        body: String(g.body || g.content || '').trim().slice(0, 800)
      }
    })
    .filter(Boolean)
}

/**
 * 单单元完整内容：题库 + 攻略 + 实践说明 + 讲解
 */
async function generateChapterPack({
  pathId,
  courseTitle,
  courseBlurb,
  chapter,
  rewardIdentity,
  goals,
  resourcesBrief,
  teacherHint = '',
  questionCount
}) {
  const quizNodes = (chapter?.nodes || []).filter((n) => n.type === 'quiz')
  const workNodes = (chapter?.nodes || []).filter((n) => n.type === 'work')

  let bank = null
  let guides = null
  let workBriefs = null
  let nodeAi = null
  let unitAi = ''
  let fromAi = false

  if (deepseek.isConfigured()) {
    try {
      const nodeLines = (chapter?.nodes || [])
        .map((n) => `- ${n.id} | ${n.type} | ${n.name}`)
        .join('\n')
      const perNode = 4
      let want = Math.min(24, Math.max(6, Math.max(1, quizNodes.length) * perNode))
      const qc = Number(questionCount)
      if (Number.isFinite(qc) && qc >= 3) want = Math.min(24, Math.round(qc))
      const hint = String(teacherHint || '').trim()

      const { text } = await deepseek.chat(
        [
          {
            role: 'system',
            content:
              '你是科创广场课程内容主编。只输出一个 JSON 对象，不要 Markdown。' +
              '内容必须紧扣课程主题与本单元，禁止空泛套话（如“学习目标是什么”“打开攻略再刷题”）。' +
              '适合初中～高一。若有教师资源，攻略中优先引用这些视频/文档/链接。'
          },
          {
            role: 'user',
            content: [
              `课程：${courseTitle}`,
              courseBlurb ? `简介：${courseBlurb}` : '',
              goals ? `课程目标：${String(goals).slice(0, 800)}` : '',
              rewardIdentity ? `通关身份：${rewardIdentity}` : '',
              resourcesBrief ? `可用资源：\n${String(resourcesBrief).slice(0, 6000)}` : '',
              `单元：${chapter?.name}（${chapter?.id}）`,
              hint ? `【教师出题要求 — 必须优先满足】\n${hint.slice(0, 2000)}` : '',
              `节点列表：\n${nodeLines}`,
              quizNodes.length
                ? `请生成约 ${want} 道题（单选 + 判断 + 填空混合，覆盖所有 quiz 节点，kpId 必须等于节点 id）。${AI_KIND_RULE} ${AI_FORMAT_RULE}`
                : '本单元无 quiz，bank 输出 []。',
              '同时生成：',
              '1) guides：2～4 条攻略。每条 {kind:"doc"|"video", text, url?, body?}；doc 的 body 为 120～280 字讲义；至少 1 条 doc；若有 B 站/外链资源请写入 video 的 url。',
              '2) workBriefs：对象，键为 work 节点 id，值为 80～160 字可执行任务说明。',
              '3) nodeAi：对象，键为每个节点 id，值为 40～100 字讲解提示。',
              '4) unitAi：本单元总述 60～120 字。',
              'JSON 形状：',
              '{"bank":[{"id":"q1","kpId":"…","format":"single|truefalse|blank","q":"…","opts":["…"],"answer":0,"blankAnswers":["…"],"kind":"concept|scenario|strategy|综合"}],"guides":[…],"workBriefs":{…},"nodeAi":{…},"unitAi":"…"}'
            ]
              .filter(Boolean)
              .join('\n')
          }
        ],
        { maxTokens: 4500, temperature: 0.42, timeoutMs: 90000 }
      )

      const parsed = extractJson(text)
      if (!parsed || typeof parsed !== 'object') throw new Error('单元内容 JSON 无效')

      if (quizNodes.length) {
        bank = courseQuizAi.normalizeBank(parsed.bank, quizNodes, pathId, chapter?.id || 'ch')
      } else {
        bank = []
      }

      guides = normalizeGuides(parsed.guides)
      if (parsed.workBriefs && typeof parsed.workBriefs === 'object') {
        workBriefs = {}
        workNodes.forEach((n) => {
          const v = String(parsed.workBriefs[n.id] || '').trim()
          if (v) workBriefs[n.id] = v.slice(0, 500)
        })
      }
      if (parsed.nodeAi && typeof parsed.nodeAi === 'object') {
        nodeAi = {}
        ;(chapter?.nodes || []).forEach((n) => {
          const v = String(parsed.nodeAi[n.id] || '').trim()
          if (v) nodeAi[n.id] = v.slice(0, 400)
        })
      }
      unitAi = String(parsed.unitAi || '').trim().slice(0, 400)
      fromAi = true

      if (quizNodes.length && (!bank || bank.length < 3)) {
        throw new Error('题库过少')
      }
    } catch (err) {
      console.warn('[courseFullAi] 单元包失败，将拆分回退', chapter?.id, err.message)
      fromAi = false
      bank = null
      guides = null
      workBriefs = null
      nodeAi = null
      unitAi = ''
    }
  }

  if (quizNodes.length && (!bank || bank.length < 3)) {
    try {
      bank = await courseQuizAi.generateBankForChapter({
        pathId,
        courseTitle,
        courseBlurb,
        chapter,
        teacherHint,
        questionCount
      })
      if (bank?.length) fromAi = true
    } catch {
      bank = null
    }
  }

  if (quizNodes.length && (!bank || bank.length < 3)) {
    try {
      const courseContentSeed = require('./courseContentSeed')
      bank = courseContentSeed.bankForChapter(pathId, chapter, courseTitle)
      fromAi = false
    } catch (err) {
      console.warn('[courseFullAi] 模板题库失败', chapter?.id, err.message)
    }
  }

  if (!guides?.length) guides = fallbackGuides(courseTitle, chapter)
  else {
    const hasBili = guides.some((g) => /BV1aA411x7Us|BV1L7411c7jw/.test(String(g.url || '')))
    if (!hasBili) guides = [...guides, ...biliCoursesForName(chapter?.name || courseTitle)]
  }

  if (!workBriefs || !Object.keys(workBriefs).length) {
    workBriefs = fallbackWorkBriefs(courseTitle, chapter)
  } else {
    const fb = fallbackWorkBriefs(courseTitle, chapter)
    workNodes.forEach((n) => {
      if (!workBriefs[n.id]) workBriefs[n.id] = fb[n.id]
    })
  }

  if (!nodeAi || !Object.keys(nodeAi).length) nodeAi = fallbackNodeAi(courseTitle, chapter)
  if (!unitAi) {
    unitAi = `本单元「${chapter?.name || ''}」服务于课程「${courseTitle}」。先攻略后练习，刷题达标再交作品。`
  }

  return { bank: bank || null, guides, workBriefs, nodeAi, unitAi, fromAi }
}

/**
 * 手动精细化：根据基本设置拼一条可执行的本地建议（无 AI / AI 空返回时用）
 */
function buildBasicsGroundedSuggest({
  courseTitle,
  courseBlurb,
  goals,
  rewardIdentity,
  chapter,
  resourcesBrief
}) {
  const title = String(courseTitle || '本课').trim() || '本课'
  const blurb = String(courseBlurb || '').trim()
  const goalLines = String(goals || '')
    .split(/\n+/)
    .map((s) => s.replace(/^\s*\d+[\.、．)]\s*/u, '').trim())
    .filter(Boolean)
    .slice(0, 4)
  const chName = String(chapter?.name || '本任务').trim() || '本任务'
  const existing = (chapter?.nodes || [])
    .map((n) => String(n?.name || '').trim())
    .filter(Boolean)
  const hasQuiz = (chapter?.nodes || []).some((n) => n.type === 'quiz')
  const hasWork = (chapter?.nodes || []).some((n) => n.type === 'work')
  const hasRes = !!String(resourcesBrief || '').trim()
  const identity = String(rewardIdentity || '').trim()

  let advice
  if (!goalLines.length && !blurb) {
    advice = `「${title}」基本设置里还没有课程目标/简介。请先返回基本设置补全，再点设计建议；当前「${chName}」可按「概念自测 → 实践创作${identity ? ` → 通关身份「${identity}」` : ''}」编排。`
  } else {
    const goalBit = goalLines.length
      ? `紧扣目标「${goalLines.slice(0, 2).join('；')}」`
      : `围绕简介「${blurb.slice(0, 48)}${blurb.length > 48 ? '…' : ''}」`
    const resBit = hasRes ? '优先把基本设置里已上传/粘贴的教学资源写进攻略与实践要求。' : '基本设置尚无资源时，可先用校园场景题把概念落地。'
    const nodeBit = existing.length
      ? `已有节点「${existing.slice(0, 4).join('、')}」，建议补强薄弱环节而不是重复同质节点。`
      : '本任务还没有细化节点，建议先加自测再加实践。'
    advice = `${goalBit}设计「${chName}」。${nodeBit}${resBit}${
      identity ? `通关身份可定为「${identity}」。` : ''
    }`
  }

  const suggestedNodes = []
  const topic = goalLines[0] || blurb.slice(0, 16) || title
  if (!hasQuiz) {
    suggestedNodes.push({
      name: `${String(topic).slice(0, 18)}自测`,
      type: 'quiz',
      reason: goalLines[0] ? `检验「${goalLines[0].slice(0, 24)}」是否掌握` : '先检验本课核心概念'
    })
  }
  if (!hasWork) {
    suggestedNodes.push({
      name: goalLines[1]
        ? `${String(goalLines[1]).slice(0, 14)}实践`
        : `${String(title).slice(0, 10)}小练`,
      type: 'work',
      reason: hasRes ? '结合已上传资源完成可交付作品' : '把概念落到可展示的校园场景作品'
    })
  }
  if (!suggestedNodes.length) {
    suggestedNodes.push({
      name: `${String(topic).slice(0, 14)}进阶自测`,
      type: 'quiz',
      reason: '在现有节点上增加一层难度区分'
    })
  }

  return {
    advice: advice.slice(0, 600),
    suggestedNodes: suggestedNodes.slice(0, 4),
    sampleQuestions: [],
    groundedOnBasics: true
  }
}

function isVagueLevelAdvice(text) {
  const s = String(text || '').trim()
  if (!s || s.length < 24) return true
  return /建议先定关卡目标|先定.*目标.*再配自测|不要空话|可执行的关卡设计建议/.test(s)
}

/**
 * 手动精细化：AI 关卡设计建议（不出完整课，只给建议）
 * 必须紧扣基本设置中的目标 / 简介 / 资源 / 通关身份。
 */
async function suggestLevelDesign({
  courseTitle,
  courseBlurb,
  goals,
  rewardIdentity,
  chapter,
  resourcesBrief,
  focus
}) {
  const grounded = buildBasicsGroundedSuggest({
    courseTitle,
    courseBlurb,
    goals,
    rewardIdentity,
    chapter,
    resourcesBrief
  })

  if (!deepseek.isConfigured()) {
    return {
      ...grounded,
      advice: `未配置 DeepSeek，已按基本设置给出建议。${grounded.advice}`
    }
  }

  try {
    const goalText = String(goals || '').trim()
    const { text } = await deepseek.chat(
      [
        {
          role: 'system',
          content:
            '你是科创广场教学设计助教。只输出 JSON 对象。' +
            '建议必须紧扣教师在「基本设置」填写的课程目标、简介、通关身份与教学资源，禁止空泛套话。' +
            '禁止输出「建议先定关卡目标，再配自测与实践」这类万能句。'
        },
        {
          role: 'user',
          content: [
            '【基本设置】',
            `课程名称：${courseTitle}`,
            courseBlurb ? `课程简介：${courseBlurb}` : '课程简介：（未填）',
            rewardIdentity ? `通关身份：${rewardIdentity}` : '通关身份：（未填）',
            goalText ? `课程目标：\n${goalText.slice(0, 1200)}` : '课程目标：（未填，请在 advice 里提醒教师回基本设置补充）',
            resourcesBrief
              ? `教学资源摘要：\n${String(resourcesBrief).slice(0, 4000)}`
              : '教学资源：（暂无，建议用校园场景代替）',
            '【当前任务】',
            chapter
              ? `任务名：${chapter.name}\n已有节点：${
                  (chapter.nodes || []).map((n) => `${n.name}(${n.type})`).join('、') || '无'
                }`
              : '尚未选择任务',
            focus ? `教师额外关注：${focus}` : '',
            '请输出 JSON：',
            '1) advice：100～220 字。必须点名本课主题/目标中的具体内容，说明本任务怎么拆自测与实践；若目标为空要明确提示回基本设置。',
            '2) suggestedNodes：0～4 个 {name,type,reason}，name 要贴合本课（禁止「核心概念自测」「动手小练」等通用名），type=quiz|work',
            '3) sampleQuestions：2～4 道示例题 {q,opts,answer,kind}，题干必须出现本课主题词；opts 长度 4，answer 0-3',
            AI_KIND_RULE,
            'JSON：{"advice":"…","suggestedNodes":[…],"sampleQuestions":[…]}'
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      { maxTokens: 2200, temperature: 0.4, timeoutMs: 60000 }
    )

    const parsed = extractJson(text) || {}
    const suggestedNodes = Array.isArray(parsed.suggestedNodes)
      ? parsed.suggestedNodes
          .map((n) => ({
            name: String(n?.name || '').trim().slice(0, 64),
            type: ['quiz', 'work', 'reward'].includes(String(n?.type || '')) ? n.type : 'quiz',
            reason: String(n?.reason || '').trim().slice(0, 120)
          }))
          .filter((n) => n.name)
          .slice(0, 4)
      : []
    const sampleQuestions = Array.isArray(parsed.sampleQuestions)
      ? parsed.sampleQuestions
          .map((q, i) => {
            const opts = Array.isArray(q?.opts)
              ? q.opts.map((o) => String(o || '').trim()).filter(Boolean).slice(0, 4)
              : []
            if (!String(q?.q || '').trim() || opts.length < 3) return null
            while (opts.length < 4) opts.push(`选项${opts.length + 1}`)
            let answer = Number(q.answer)
            if (!Number.isFinite(answer) || answer < 0 || answer > 3) answer = 0
            return {
              id: `suggest-${i + 1}`,
              q: String(q.q).trim().slice(0, 300),
              opts,
              answer,
              kind: normalizeQuestionKind(q.kind, kindForSlot(i))
            }
          })
          .filter(Boolean)
          .slice(0, 4)
      : []

    let advice = String(parsed.advice || '').trim().slice(0, 600)
    if (isVagueLevelAdvice(advice)) advice = grounded.advice

    return {
      advice,
      suggestedNodes: suggestedNodes.length ? suggestedNodes : grounded.suggestedNodes,
      sampleQuestions,
      groundedOnBasics: true
    }
  } catch (err) {
    console.warn('[suggestLevelDesign] AI failed, use basics fallback', err.message || err)
    return grounded
  }
}

async function generateFullCourseContent({
  pathId,
  title,
  blurb,
  rewardIdentity,
  chapters,
  goals,
  resourcesBrief,
  preferGoalSplit = false
}) {
  let finalChapters =
    Array.isArray(chapters) && chapters.length ? chapters : skeletonChapters(pathId, title)
  let curriculumAi = false

  if (deepseek.isConfigured() && !(Array.isArray(chapters) && chapters.length)) {
    try {
      if (preferGoalSplit || goals || resourcesBrief) {
        const split = await generateCurriculumFromGoals({
          pathId,
          title,
          blurb,
          goals,
          resourcesBrief,
          rewardIdentity
        })
        if (split?.length) {
          finalChapters = split
          curriculumAi = true
        }
      } else {
        const named = await generateCurriculumNames({ pathId, title, blurb, rewardIdentity })
        if (named?.length) {
          finalChapters = named
          curriculumAi = true
        }
      }
    } catch (err) {
      console.warn('[courseFullAi] 课纲生成失败，用骨架名', err.message)
      try {
        const named = await generateCurriculumNames({ pathId, title, blurb, rewardIdentity })
        if (named?.length) {
          finalChapters = named
          curriculumAi = true
        }
      } catch (err2) {
        console.warn('[courseFullAi] 课纲命名失败', err2.message)
      }
    }
  }

  const packs = await Promise.all(
    finalChapters.map(async (ch) => {
      try {
        const pack = await generateChapterPack({
          pathId,
          courseTitle: title,
          courseBlurb: blurb || '',
          chapter: ch,
          rewardIdentity,
          goals,
          resourcesBrief
        })
        return { ch, pack, err: null }
      } catch (err) {
        return { ch, pack: null, err }
      }
    })
  )

  return { chapters: finalChapters, packs, curriculumAi }
}

function isPlaceholderQuestionStem(stem) {
  const s = String(stem || '').trim()
  if (!s) return true
  if (/^题目\s*\d+$/u.test(s)) return true
  if (/^第\s*\d+\s*题$/u.test(s)) return true
  if (s.length < 8 && !/[？?]/.test(s)) return true
  return false
}

function questionGuideContext(draft = {}) {
  const stem = String(draft.question || draft.q || '').trim()
  const format = String(draft.format || 'single').trim()
  const qKind = draft.kind ? kindLabel(draft.kind) : ''
  if (format === 'blank') {
    const blanks = Array.isArray(draft.blankAnswers)
      ? draft.blankAnswers.map((s) => String(s || '').trim()).filter(Boolean)
      : []
    const answerText = blanks.length ? `参考答案：${blanks.join(' / ')}` : ''
    return { stem, optsBlock: '', answerText, qKind, format: 'blank' }
  }
  if (format === 'truefalse') {
    const answerIdx = Number(draft.answer)
    const answerText = answerIdx === 1 ? '正确答案：错误' : '正确答案：正确'
    return {
      stem,
      optsBlock: 'A. 正确\nB. 错误',
      answerText,
      qKind,
      format: 'truefalse'
    }
  }
  const opts = Array.isArray(draft.opts) ? draft.opts.map((o) => String(o || '').trim()).filter(Boolean) : []
  const answerIdx = Number(draft.answer)
  const optsBlock =
    opts.length >= 2
      ? opts
          .map((o, i) => `${String.fromCharCode(65 + i)}. ${o}${Number.isFinite(answerIdx) && i === answerIdx ? ' ← 正确' : ''}`)
          .join('\n')
      : ''
  const answerText =
    Number.isFinite(answerIdx) && opts[answerIdx] ? `${String.fromCharCode(65 + answerIdx)}. ${opts[answerIdx]}` : ''
  return { stem, optsBlock, answerText, qKind, format: 'single' }
}

/**
 * 手动精细化：单字段 AI 辅助（题目 / 攻略 / 实践说明 / 讲解）
 */
async function assistPblField({
  kind,
  field = 'full',
  courseTitle,
  courseBlurb,
  goals,
  chapter,
  resourcesBrief,
  draft = {}
}) {
  const quizNodes = (chapter?.nodes || []).filter((n) => n.type === 'quiz')
  const workNodes = (chapter?.nodes || []).filter((n) => n.type === 'work')
  const kpId = String(draft.kpId || quizNodes[0]?.id || '').trim()
  const kpName =
    quizNodes.find((n) => n.id === kpId)?.name ||
    workNodes.find((n) => n.id === draft.nodeId)?.name ||
    '本关'

  const localFallback = () => {
    if (kind === 'question') {
      return {
        question: {
          id: draft.id || `q-${Date.now()}`,
          kpId,
          q: draft.q || `关于「${kpName}」，下列说法正确的是？`,
          opts: draft.opts?.length >= 4
            ? draft.opts.slice(0, 4)
            : ['理解核心概念并能应用', '可以跳过本知识点', '只看攻略不必练习', '与本课无关'],
          answer: Number.isFinite(Number(draft.answer)) ? Number(draft.answer) : 0,
          kind: draft.kind || 'concept'
        }
      }
    }
    if (kind === 'guide') {
      const forQuestion = draft.forQuestion === true || !!(draft.question || draft.q)
      const { stem, answerText } = questionGuideContext(draft)
      if (forQuestion && isPlaceholderQuestionStem(stem)) {
        const err = new Error('请先填写完整题干（不能是「题目 1」等占位），再生成攻略')
        err.status = 400
        throw err
      }
      const teacherHint = forQuestion
        ? `围绕题干「${stem.slice(0, 48)}」：先排除明显错误选项，再验证${answerText ? ` ${answerText.split('.')[0]}` : ' 正确项'}。`
        : draft.teacherHint || draft.body || `阅读「${kpName}」相关提示后再刷题。`
      return {
        guide: {
          teacherHint,
          docUrl: draft.docUrl || (draft.kind === 'doc' ? draft.url : '') || '',
          docName: draft.docName || draft.title || (forQuestion ? `${stem.slice(0, 16)}攻略` : `${kpName}学习文档`),
          videoUrl: draft.videoUrl || (draft.kind === 'video' ? draft.url : '') || '',
          title: draft.docName || draft.title || (forQuestion ? `${stem.slice(0, 16)}攻略` : `${kpName}学习资料`),
          kind: draft.kind || 'doc',
          url: draft.url || '',
          body: teacherHint
        }
      }
    }
    if (kind === 'workBrief') {
      return {
        text:
          draft.text ||
          `围绕「${kpName}」完成一份可展示的小作品：写清目标、步骤与交付物（设计图 / PPT / 视频均可）。`
      }
    }
    if (kind === 'nodeAi') {
      return {
        text:
          draft.text ||
          `本节点「${kpName}」：先阅读攻略，再完成刷题或作品。遇到困难可点 AI 讲解。`
      }
    }
    return {
      text:
        draft.text ||
        `本单元「${chapter?.name || ''}」服务于课程「${courseTitle}」。先攻略后练习，刷题达标再交作品。`
    }
  }

  if (!deepseek.isConfigured()) return localFallback()

  try {
  const baseCtx = [
    `课程：${courseTitle || ''}`,
    courseBlurb ? `简介：${courseBlurb}` : '',
    goals ? `目标：${String(goals).slice(0, 800)}` : '',
    chapter ? `单元：${chapter.name}（节点：${(chapter.nodes || []).map((n) => `${n.name}[${n.type}]`).join('、') || '无'}）` : '',
    resourcesBrief ? `资源：\n${String(resourcesBrief).slice(0, 3500)}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  if (kind === 'question') {
    const quizNode =
      quizNodes.find((n) => n.id === kpId) ||
      (quizNodes.length ? quizNodes[0] : { id: kpId || 'kp-1', name: kpName })
    const question = await courseQuizAi.assistQuestion({
      pathId: chapter?.pathId || '',
      courseTitle,
      courseBlurb,
      chapter,
      quizNode,
      draft: { ...draft, kpId: kpId || quizNode.id, kind: draft.kind || 'concept', format: draft.format || 'single' },
      field
    })
    if (question) {
      if (field === 'stem' && draft.q) {
        question.opts = (draft.opts || question.opts || []).slice(0, 4)
        question.answer = Number.isFinite(Number(draft.answer)) ? Number(draft.answer) : question.answer
      }
      if (field === 'opts' && draft.q) question.q = draft.q
      return { question }
    }
    return {
      question: {
        id: draft.id || `q-${Date.now()}`,
        kpId: kpId || quizNode.id || '',
        q: draft.q || `关于「${kpName}」，下列说法正确的是？`,
        opts: draft.opts?.length >= 4
          ? draft.opts.slice(0, 4)
          : ['理解核心概念并能应用', '可以跳过本知识点', '只看攻略不必练习', '与本课无关'],
        answer: Number.isFinite(Number(draft.answer)) ? Number(draft.answer) : 0,
        kind: draft.kind || 'concept'
      }
    }
  }

  if (kind === 'guide') {
    const forQuestion = draft.forQuestion === true || !!(draft.question || draft.q)
    const { stem, optsBlock, answerText, qKind } = questionGuideContext(draft)

    if (forQuestion && isPlaceholderQuestionStem(stem)) {
      const err = new Error('请先填写完整题干（不能是「题目 1」等占位），再生成攻略')
      err.status = 400
      throw err
    }

    const systemContent = forQuestion
      ? '你是中学 STEM 教学助教。只输出 JSON：{"teacherHint":"80～200字","docName":"文档名","docUrl":"","videoUrl":""}。' +
        'teacherHint 必须只针对下方这一道选择题写解题思路、关键知识点与易错点，帮助学生理解为何正确项成立、干扰项错在哪；' +
        '禁止写与本题无关的课程总述、单元概述、数学建模通用流程或空泛套话。docName 用本题主题命名（8～16字）。'
      : '你是教学资源编辑。只输出 JSON：{"teacherHint":"60～180字教师提示","docName":"文档名","docUrl":"文档链接可留空","videoUrl":"视频链接可留空"}。teacherHint 必填；至少填 docUrl 或 videoUrl 之一（可都留空仅写提示）。'

    const userContent = forQuestion
      ? [
          `课程背景（仅供参考，勿写成单元总攻略）：${courseTitle || ''}`,
          chapter ? `所属任务：${chapter.name}` : '',
          '【本题 — 攻略必须紧扣以下内容】',
          draft.format === 'blank' ? '题型：填空题' : draft.format === 'truefalse' ? '题型：判断题（正确/错误）' : '题型：单选题',
          `题干：${stem}`,
          qKind ? `考查方向：${qKind}` : '',
          optsBlock ? `选项：\n${optsBlock}` : '',
          answerText || '',
          draft.teacherHint ? `已有提示（可在此基础上改写优化）：${String(draft.teacherHint).slice(0, 400)}` : '',
          '请生成本题专属攻略：teacherHint 只解释如何思考这一道题；docUrl/videoUrl 可留空由老师后补。'
        ]
          .filter(Boolean)
          .join('\n')
      : [
          baseCtx,
          draft.question ? `关联题目：${draft.question}` : '',
          `当前：teacherHint=${draft.teacherHint || draft.body || ''} docName=${draft.docName || draft.title || ''} docUrl=${draft.docUrl || ''} videoUrl=${draft.videoUrl || ''}`,
          '生成本题攻略：含教师提示；文档/视频链接可留空由老师后补。现场讲解由学生端 AI 完成，勿写长篇讲义。'
        ]
          .filter(Boolean)
          .join('\n')

    const { text } = await deepseek.chat(
      [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ],
      { maxTokens: 900, temperature: forQuestion ? 0.35 : 0.4, timeoutMs: 40000 }
    )
    const parsed = extractJson(text) || {}
    const teacherHint = String(parsed.teacherHint || parsed.body || draft.teacherHint || draft.body || '').slice(
      0,
      2000
    )
    const docName = String(
      parsed.docName ||
        parsed.title ||
        draft.docName ||
        draft.title ||
        (forQuestion && stem ? `${stem.slice(0, 16)}攻略` : `${kpName}学习文档`)
    ).slice(0, 120)
    const docUrl = String(parsed.docUrl || draft.docUrl || '').slice(0, 1000)
    const videoUrl = String(parsed.videoUrl || draft.videoUrl || parsed.url || draft.url || '').slice(0, 1000)
    return {
      guide: {
        teacherHint,
        docUrl,
        docName,
        videoUrl,
        title: docName,
        kind: videoUrl && !docUrl ? 'video' : 'doc',
        url: docUrl || videoUrl,
        body: teacherHint
      }
    }
  }

  if (kind === 'workBrief') {
    const nodeId = String(draft.nodeId || workNodes[0]?.id || '').trim()
    const nodeName = workNodes.find((n) => n.id === nodeId)?.name || kpName
    const { text } = await deepseek.chat(
      [
        {
          role: 'system',
          content:
            '你是 PBL 任务设计师。只输出 JSON：{"text":"80～160字实践任务说明，含目标、步骤、交付物类型"}'
        },
        {
          role: 'user',
          content: [
            baseCtx,
            `实践节点：${nodeName}（id=${nodeId}）`,
            draft.text ? `当前说明：${draft.text}` : '',
            '学生需上传设计图/流程图/PPT/视频之一。'
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      { maxTokens: 700, temperature: 0.45, timeoutMs: 40000 }
    )
    const parsed = extractJson(text) || {}
    return { text: String(parsed.text || text || draft.text || '').slice(0, 500), nodeId }
  }

  if (kind === 'nodeAi') {
    const nodeId = String(draft.nodeId || kpId || '').trim()
    const { text } = await deepseek.chat(
      [
        {
          role: 'system',
          content: '你是学习助教。只输出 JSON：{"text":"60～120字，告诉学生本节点怎么学、怎么练"}'
        },
        {
          role: 'user',
          content: [baseCtx, `节点 id=${nodeId}`, draft.text ? `当前：${draft.text}` : ''].filter(Boolean).join('\n')
        }
      ],
      { maxTokens: 500, temperature: 0.4, timeoutMs: 35000 }
    )
    const parsed = extractJson(text) || {}
    return { text: String(parsed.text || text || draft.text || '').slice(0, 500), nodeId }
  }

  const { text } = await deepseek.chat(
    [
      {
        role: 'system',
        content: '你是课程助教。只输出 JSON：{"text":"80～150字单元学习路线说明"}'
      },
      {
        role: 'user',
        content: [baseCtx, draft.text ? `当前：${draft.text}` : ''].filter(Boolean).join('\n')
      }
    ],
    { maxTokens: 500, temperature: 0.4, timeoutMs: 35000 }
  )
  const parsed = extractJson(text) || {}
  return { text: String(parsed.text || text || draft.text || '').slice(0, 500) }
  } catch (err) {
    if (err && err.status === 400) throw err
    console.warn('[assistPblField] AI failed, use local fallback', err.message)
    return localFallback()
  }
}

module.exports = {
  skeletonChapters,
  emptyManualChapters,
  generateCurriculumNames,
  generateCurriculumFromGoals,
  generateChapterPack,
  generateFullCourseContent,
  suggestLevelDesign,
  assistPblField,
  normalizeAiChapters,
  fallbackGuides,
  isConfigured: () => deepseek.isConfigured()
}
