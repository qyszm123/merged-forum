/**
 * 教师创建副本时写入「接近官方主线」的完整内容：
 * - AI 课纲命名（6 单元）
 * - 每单元：题库 + 攻略讲义 + 实践说明 + AI 讲解
 * - 失败时回退模板，保证可玩
 */
const { query } = require('../db/pool')
const courseQuizAi = require('./courseQuizAi')
const courseFullAi = require('./courseFullAi')
const courseCatalog = require('./courseCatalog')
const courseResources = require('./courseResources')
const { officialGuideLines } = require('../data/kpGuides')
const {
  kindForSlot,
  formatForSlot,
  ensureBankFormatMix,
  convertBankItemFormat
} = require('../data/questionKinds')

function parseJson(raw, fallback) {
  if (raw && typeof raw === 'object') return raw
  try {
    return JSON.parse(raw || '')
  } catch {
    return fallback
  }
}

function withRequires(nodes) {
  return (nodes || []).map((n, i, arr) => ({
    ...n,
    requires: Array.isArray(n.requires) ? n.requires : i ? [arr[i - 1].id] : []
  }))
}

/** 完整默认章节（结构对齐官方主线密度） */
function fullDefaultChapters(pathId, title) {
  return courseFullAi.skeletonChapters(pathId, title)
}

function mkQuestion(id, kpId, q, opts, answer = 0, kind = 'concept', format = 'single') {
  return convertBankItemFormat({ id, kpId, q, opts, answer, kind }, format)
}

/** 为每个 quiz 节点生成可玩题库（足够刷到 80 分）— AI 不可用时的回退 */
function bankForChapter(pathId, chapter, courseTitle) {
  const title = courseTitle || chapter.name || '本课'
  const quizNodes = (chapter.nodes || []).filter((n) => n.type === 'quiz')
  const bank = []
  quizNodes.forEach((node, qi) => {
    const kp = node.id
    const label = node.name || `知识点${qi + 1}`
    const stems = [
      [`在「${title}」的「${label}」环节，下列哪项更符合学习目标？`, [`理解「${label}」核心概念，并能联系「${title}」后续实践`, '只看视频不用练习', '跳过测验直接通关', '与本课无关的闲聊'], 0],
      [`完成「${label}」自测时，更合理的做法是？`, [`结合「${title}」材料弄清题意后再作答，刷到分数线`, '随便点选项提交即可', '不看题目直接交卷', '只做一题就结束'], 0],
      [`若你在「${label}」相关情景中遇到实际问题，应优先？`, [`运用「${label}」所学分析原因并给出可行方案`, '忽略问题继续往下学', '直接抄他人答案', '退出副本'], 0],
      [`关于「${title}」中「${label}」的说法，正确的是？`, ['需要理解原理，并能用到后续实践 / 作品', '记住选项字母就够，不必理解', '与实践创作完全无关', '只有教师账号才能学习'], 0],
      [`若「${label}」题目不会做，更合适的策略是？`, [`先阅读本单元攻略中关于「${label}」的讲义/视频，再回来作答`, '反复乱点直到碰巧通过', '直接放弃本副本', '改用别人账号通关'], 0],
      [`「${title}」副本中，「${label}」与其他知识点如何配合？`, ['本关概念为后续实践与综合题打基础', '彼此完全独立、无需联系', '只用于排行榜计分', '仅教师可见'], 0]
    ]
    stems.forEach(([q, opts, answer], si) => {
      bank.push(mkQuestion(`${kp}-${si + 1}`, kp, q, opts, answer, kindForSlot(si), formatForSlot(si)))
    })
  })
  return ensureBankFormatMix(bank)
}

function serializeGuideLine(g) {
  if (!g) return ''
  if (typeof g === 'string') return g
  const kind = g.kind || 'doc'
  const url = g.url || ''
  const text = g.text || '学习资料'
  const body = String(g.body || '').replace(/\s*\n+\s*/g, ' ').trim()
  if (body) return `${text} | ${kind} | ${url} | ${body}`
  if (url) return `${text} | ${kind} | ${url}`
  return `${text} | ${kind}`
}

function buildCoursePblDef(pathId, chapter, courseTitle, packOrBank = null) {
  const quizNodes = (chapter.nodes || []).filter((n) => n.type === 'quiz')
  const workNodes = (chapter.nodes || []).filter((n) => n.type === 'work')
  const hasQuiz = quizNodes.length > 0
  const hasWork = workNodes.length > 0
  if (!hasQuiz && !hasWork) return null

  // 兼容旧调用：第 4 参直接传 bank 数组
  const pack = Array.isArray(packOrBank)
    ? { bank: packOrBank, fromAi: true }
    : packOrBank && typeof packOrBank === 'object'
      ? packOrBank
      : null

  const bankOverride = pack?.bank
  const fromAi = !!(hasQuiz && Array.isArray(bankOverride) && bankOverride.length && pack?.fromAi !== false)
  let bank = Array.isArray(bankOverride) && bankOverride.length
    ? bankOverride
    : hasQuiz
      ? bankForChapter(pathId, chapter, courseTitle)
      : []
  if (bank.length) bank = ensureBankFormatMix(bank)

  let guideLines
  if (Array.isArray(pack?.guides) && pack.guides.length) {
    guideLines = pack.guides.map(serializeGuideLine).filter(Boolean)
  } else if (Array.isArray(pack?.guideLines) && pack.guideLines.length) {
    guideLines = pack.guideLines
  } else {
    guideLines = officialGuideLines(chapter.name || courseTitle || pathId)
  }

  return {
    pathId,
    taskId: chapter.id,
    title: chapter.name,
    kind: 'comprehensive',
    drillEnabled: hasQuiz,
    practiceEnabled: hasWork || !hasQuiz,
    passScore: 80,
    guideEnabled: true,
    guideLines,
    workBriefs: pack?.workBriefs || {},
    nodeAi: pack?.nodeAi || {},
    unitAi: pack?.unitAi || '',
    bank,
    acceptTypes: ['design', 'flowchart', 'ppt', 'video'],
    defenseEnabled: hasWork,
    defensePassScore: 80,
    countClear: true,
    source: fromAi ? 'course-ai-full-v1' : 'course-default-v1',
    updatedAt: Date.now()
  }
}

/**
 * 为新建 / 补全的教师课写入全部 PBL 规则
 * @returns {Promise<object>}
 */
async function seedCoursePblDefs(pathId, chapters, courseTitle, userId, courseBlurb = '', opts = {}) {
  const rewardIdentity = opts.rewardIdentity || ''
  const goals = opts.goals || ''
  const resourcesBrief = opts.resourcesBrief || ''
  const createMode = opts.createMode === 'manual' ? 'manual' : 'ai_lazy'
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null
  const report = (p) => onProgress && onProgress(p)
  let upserted = 0
  let aiChapters = 0
  let fallbackChapters = 0
  let curriculumAi = !!opts.curriculumAi
  let guideAiChapters = 0
  let workAiChapters = 0
  let totalQuestions = 0
  let quizChapters = 0

  let workingChapters =
    Array.isArray(chapters)
      ? chapters
      : createMode === 'manual'
        ? courseFullAi.emptyManualChapters(pathId, courseTitle)
        : fullDefaultChapters(pathId, courseTitle)

  // 手动模式：不跑全量 AI，只写可编辑空壳/起步关
  if (createMode === 'manual' || opts.skipFullAi) {
    for (const ch of workingChapters) {
      const def = buildCoursePblDef(pathId, ch, courseTitle, {
        bank: [],
        fromAi: false,
        guides: [],
        workBriefs: {},
        nodeAi: {},
        unitAi: ''
      })
      if (!def) continue
      // 手动起步关：写入空题库壳，教师再用 AI 辅助出题
      def.bank = []
      def.source = 'course-manual-v1'
      await query(
        `INSERT INTO pbl_task_defs (path_id, task_id, title, def_json, updated_by)
         VALUES (:pathId, :taskId, :title, :def, :uid)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           def_json = VALUES(def_json),
           updated_by = VALUES(updated_by)`,
        {
          pathId,
          taskId: ch.id,
          title: ch.name || '',
          def: JSON.stringify(def),
          uid: userId || null
        }
      )
      upserted += 1
      fallbackChapters += 1
    }
    return {
      upserted,
      aiChapters: 0,
      fallbackChapters,
      curriculumAi: false,
      guideAiChapters: 0,
      workAiChapters: 0,
      totalQuestions: 0,
      quizChapters: 0,
      chapters: workingChapters,
      createMode
    }
  }

  // AI 懒人：优先按目标+资源拆关（未钉死课纲时）
  if (!opts.skipCurriculumAi && courseFullAi.isConfigured() && !opts.chaptersPinned) {
    report({ phase: 'curriculum', percent: 10, message: 'AI 规划课纲与关卡结构…' })
    try {
      if (goals || resourcesBrief || opts.preferGoalSplit) {
        const split = await courseFullAi.generateCurriculumFromGoals({
          pathId,
          title: courseTitle,
          blurb: courseBlurb,
          goals,
          resourcesBrief,
          rewardIdentity
        })
        if (split?.length) {
          workingChapters = split
          curriculumAi = true
        }
      } else {
        const named = await courseFullAi.generateCurriculumNames({
          pathId,
          title: courseTitle,
          blurb: courseBlurb,
          rewardIdentity
        })
        if (named?.length) {
          workingChapters = named
          curriculumAi = true
        }
      }
    } catch (err) {
      console.warn('[courseContentSeed] 课纲 AI 失败', err.message)
    }
    report({
      phase: 'curriculum',
      percent: 22,
      message: curriculumAi ? '课纲已生成，开始逐单元灌内容…' : '课纲就绪，开始逐单元灌内容…'
    })
  }

  const totalChapters = workingChapters.length
  let finishedPacks = 0
  const concurrency = Math.min(2, Math.max(1, totalChapters))
  const prepared = new Array(totalChapters)
  let nextIdx = 0

  async function runOneChapterPack() {
    while (nextIdx < totalChapters) {
      const idx = nextIdx
      nextIdx += 1
      const ch = workingChapters[idx]
      report({
        phase: 'chapter',
        percent: 24 + Math.round((idx / Math.max(totalChapters, 1)) * 2),
        message: `生成第 ${idx + 1}/${totalChapters} 单元…`,
        current: idx + 1,
        total: totalChapters
      })
      let pack = null
      try {
        pack = await courseFullAi.generateChapterPack({
          pathId,
          courseTitle,
          courseBlurb,
          chapter: ch,
          rewardIdentity,
          goals,
          resourcesBrief
        })
      } catch (err) {
        console.warn('[courseContentSeed] 单元包失败', ch.id, err.message)
        pack = null
      }
      // 确保 quiz 关必有可玩题库（AI 全失败时用模板）
      if ((ch.nodes || []).some((n) => n.type === 'quiz') && !(pack?.bank || []).length) {
        pack = {
          ...(pack || {}),
          bank: bankForChapter(pathId, ch, courseTitle),
          fromAi: false,
          guides: pack?.guides || null,
          workBriefs: pack?.workBriefs || null,
          nodeAi: pack?.nodeAi || null,
          unitAi: pack?.unitAi || ''
        }
      }
      prepared[idx] = { ch, pack }
      finishedPacks += 1
      report({
        phase: 'chapter',
        percent: 25 + Math.round((finishedPacks / Math.max(totalChapters, 1)) * 65),
        message: `已完成 ${finishedPacks}/${totalChapters} 单元（${ch.name || '单元'}）`,
        current: finishedPacks,
        total: totalChapters
      })
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runOneChapterPack()))

  report({ phase: 'write', percent: 92, message: '写入题库、攻略与实践说明…' })
  for (const { ch, pack } of prepared) {
    const hasQuiz = (ch.nodes || []).some((n) => n.type === 'quiz')
    if (hasQuiz && pack?.fromAi && pack?.bank?.length) aiChapters += 1
    else if (hasQuiz) fallbackChapters += 1
    if (pack?.guides?.some((g) => g.body)) guideAiChapters += 1
    if (pack?.workBriefs && Object.keys(pack.workBriefs).length) workAiChapters += 1

    let def = buildCoursePblDef(pathId, ch, courseTitle, pack)
    if (!def) continue
    if (def.bank?.length && pack?.guides?.length) {
      def.bank = attachGuidesToBankItems(def.bank, pack.guides)
      const fromBank = guideLinesFromBankItems(def.bank)
      if (fromBank.length) def.guideLines = fromBank
    }
    if (def.drillEnabled) {
      quizChapters += 1
      totalQuestions += (def.bank || []).length
    }
    if (def.drillEnabled && !def.bank.length) {
      def.bank = bankForChapter(pathId, ch, courseTitle)
      totalQuestions += (def.bank || []).length
    }
    await query(
      `INSERT INTO pbl_task_defs (path_id, task_id, title, def_json, updated_by)
       VALUES (:pathId, :taskId, :title, :def, :uid)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         def_json = VALUES(def_json),
         updated_by = VALUES(updated_by)`,
      {
        pathId,
        taskId: ch.id,
        title: ch.name || '',
        def: JSON.stringify(def),
        uid: userId || null
      }
    )
    upserted += 1
  }

  return {
    upserted,
    aiChapters,
    fallbackChapters,
    curriculumAi,
    guideAiChapters,
    workAiChapters,
    totalQuestions,
    quizChapters,
    chapters: workingChapters,
    createMode
  }
}

/**
 * 统计副本可玩性：有刷题关且题库非空的单元数
 */
async function assessCoursePlayable(pathId) {
  const row = await courseCatalog.findCourseRow(pathId, { includeDraft: true })
  if (!row) return { ok: false, chapters: 0, quizChapters: 0, withBank: 0 }
  const chapters = courseCatalog.chaptersOf(row)
  const quizChapters = chapters.filter((ch) => (ch.nodes || []).some((n) => n.type === 'quiz')).length
  const rows = await query(`SELECT def_json FROM pbl_task_defs WHERE path_id = :pathId`, { pathId })
  let withBank = 0
  for (const r of rows || []) {
    const def = parseJson(r.def_json, {})
    if ((def.bank || []).length >= 3) withBank += 1
  }
  return {
    ok: withBank >= 1 && quizChapters >= 1,
    chapters: chapters.length,
    quizChapters,
    withBank,
    chapterList: chapters,
    title: row.title,
    blurb: row.blurb || ''
  }
}

/**
 * 上架前保证学生可刷：题库为空则灌模板题（不调 AI）。
 * 仅在「完全没有任务」时才补官方六单元骨架；已有教师编排（哪怕只有 1 个任务）绝不改结构。
 * AI 辅助（manual）模式永远不自动扩成完整副本。
 */
async function ensurePlayableOrFillTemplate(pathId, userId) {
  const row = await courseCatalog.findCourseRow(pathId, { includeDraft: true })
  const createMode = row?.create_mode === 'manual' ? 'manual' : 'ai_lazy'
  const assessed = await assessCoursePlayable(pathId)
  const minBanks = Math.max(1, Math.min(2, assessed.quizChapters || 1))
  if (assessed.ok && assessed.chapters >= 1 && assessed.withBank >= minBanks) {
    return { filled: false, ...assessed }
  }

  let chapters = assessed.chapterList || []
  const hasQuiz = (chapters || []).some((ch) => (ch.nodes || []).some((n) => n.type === 'quiz'))
  // 只有零任务、且非 AI 辅助模式时，才回退官方骨架；单任务副本保持原样
  const needSkeleton = createMode !== 'manual' && (!chapters.length || !hasQuiz)
  if (needSkeleton) {
    chapters = fullDefaultChapters(pathId, assessed.title || pathId)
    await query(`UPDATE train_courses SET chapters_json = :chapters WHERE path_id = :pathId`, {
      pathId,
      chapters: JSON.stringify(chapters)
    })
  }

  let upserted = 0
  let filledBanks = 0
  for (const ch of chapters) {
    const existing = await query(
      `SELECT def_json FROM pbl_task_defs WHERE path_id = :pathId AND task_id = :taskId LIMIT 1`,
      { pathId, taskId: ch.id }
    )
    const prev = parseJson(existing?.[0]?.def_json, null)
    const hasBank = Array.isArray(prev?.bank) && prev.bank.length >= 3
    if (hasBank) continue

    const def = buildCoursePblDef(pathId, ch, assessed.title || pathId)
    if (!def) continue
    if (def.drillEnabled && !(def.bank || []).length) {
      def.bank = bankForChapter(pathId, ch, assessed.title || pathId)
    }
    def.source = def.source || 'course-default-v1'
    await query(
      `INSERT INTO pbl_task_defs (path_id, task_id, title, def_json, updated_by)
       VALUES (:pathId, :taskId, :title, :def, :uid)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         def_json = VALUES(def_json),
         updated_by = VALUES(updated_by)`,
      {
        pathId,
        taskId: ch.id,
        title: ch.name || '',
        def: JSON.stringify(def),
        uid: userId || null
      }
    )
    upserted += 1
    if ((def.bank || []).length >= 3) filledBanks += 1
  }

  courseCatalog.invalidateCourseCache()
  const next = await assessCoursePlayable(pathId)
  return {
    filled: true,
    upserted,
    filledBanks,
    ...next
  }
}

/** 手动增关：写入空壳 PBL，不跑全量 AI */
async function upsertChapterPblShell(pathId, chapter, courseTitle, userId) {
  const def = buildCoursePblDef(pathId, chapter, courseTitle, {
    bank: [],
    fromAi: false,
    guides: [],
    workBriefs: {},
    nodeAi: {},
    unitAi: ''
  })
  if (!def) return null
  def.bank = []
  def.source = 'course-manual-v1'
  await query(
    `INSERT INTO pbl_task_defs (path_id, task_id, title, def_json, updated_by)
     VALUES (:pathId, :taskId, :title, :def, :uid)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       def_json = VALUES(def_json),
       updated_by = VALUES(updated_by)`,
    {
      pathId,
      taskId: chapter.id,
      title: chapter.name || '',
      def: JSON.stringify(def),
      uid: userId || null
    }
  )
  return def
}

/** AI 懒人 · 步骤二：按已存目标/资源一键拆关灌课 */
async function generateCourseAiContent(pathId, userId, opts = {}) {
  const report = (p) => opts.onProgress && opts.onProgress(p)
  report({ phase: 'prepare', percent: 3, message: '读取课程目标与资源…' })
  const row = await courseCatalog.findCourseRow(pathId, { includeDraft: true })
  if (!row) {
    const err = new Error('副本不存在')
    err.code = 'NOT_FOUND'
    throw err
  }
  const goals = String(row.goals_text || '').trim()
  const stored = parseJson(row.resources_json, [])
  let dbRes = []
  try {
    dbRes = await courseResources.listByPath(pathId)
  } catch {
    dbRes = []
  }
  report({ phase: 'prepare', percent: 6, message: '整理教学资源…' })
  const resourcesBrief = await courseResources.buildAiResourceBrief(
    courseResources.normalizeResourceList([...stored, ...dbRes], {
      ownerUserId: row.owner_user_id
    })
  )
  const starter = courseFullAi.emptyManualChapters(pathId, row.title)
  const seed = await seedCoursePblDefs(pathId, starter, row.title, userId, row.blurb || '', {
    rewardIdentity: row.reward_identity || row.title,
    chaptersPinned: false,
    skipCurriculumAi: false,
    skipFullAi: false,
    createMode: 'ai_lazy',
    goals,
    resourcesBrief,
    preferGoalSplit: true,
    onProgress: opts.onProgress
  })
  if (Array.isArray(seed.chapters) && seed.chapters.length) {
    report({ phase: 'save', percent: 96, message: '保存课纲结构…' })
    await query(`UPDATE train_courses SET chapters_json = :chapters WHERE path_id = :pathId`, {
      pathId,
      chapters: JSON.stringify(seed.chapters)
    })
  }
  report({ phase: 'done', percent: 100, message: 'AI 生成副本完成' })
  return seed
}

function questionGuideHasContent(g) {
  if (!g || typeof g !== 'object') return false
  return !!(
    String(g.teacherHint || g.hint || g.body || '').trim() ||
    String(g.docUrl || '').trim() ||
    String(g.videoUrl || '').trim() ||
    String(g.url || '').trim()
  )
}

function guideObjectFromPackGuide(g) {
  if (!g || typeof g !== 'object') return null
  const title = String(g.text || g.title || g.docName || '').trim()
  const url = String(g.url || g.docUrl || g.videoUrl || '').trim()
  const body = String(g.body || g.teacherHint || g.hint || '').trim()
  if (!title && !url && !body) return null
  const kind =
    String(g.kind || '').toLowerCase() === 'video' || /bilibili\.com/i.test(url) ? 'video' : 'doc'
  if (String(g.teacherHint || g.docUrl || g.videoUrl || '').trim()) {
    return {
      teacherHint: String(g.teacherHint || g.hint || (kind === 'doc' ? body : '') || '').trim(),
      docUrl: String(g.docUrl || (kind === 'doc' ? url : '') || '').trim(),
      docName: String(g.docName || title || '学习文档').trim(),
      videoUrl: String(g.videoUrl || (kind === 'video' ? url : '') || '').trim(),
      title: String(g.docName || title || '本题攻略').trim(),
      kind,
      url,
      body: String(g.teacherHint || g.body || body || '').trim()
    }
  }
  return {
    teacherHint: kind === 'doc' ? body : '',
    docUrl: kind === 'doc' ? url : '',
    docName: title || '学习文档',
    videoUrl: kind === 'video' ? url : '',
    title: title || '本题攻略',
    kind,
    url,
    body
  }
}

function mergePackGuides(list) {
  const merged = { teacherHint: '', docUrl: '', docName: '', videoUrl: '' }
  for (const item of list) {
    const g = guideObjectFromPackGuide(item)
    if (!g) continue
    if (g.teacherHint) {
      merged.teacherHint = merged.teacherHint
        ? `${merged.teacherHint}\n\n${g.teacherHint}`
        : g.teacherHint
    }
    if (g.docUrl) merged.docUrl = g.docUrl
    if (g.docName) merged.docName = g.docName
    if (g.videoUrl) merged.videoUrl = g.videoUrl
  }
  return questionGuideHasContent(merged) ? merged : null
}

/** 将单元攻略条目按序挂到题库每题（教师端逐题编辑） */
function attachGuidesToBankItems(bank, guides) {
  const list = Array.isArray(guides) ? guides : []
  const merged = mergePackGuides(list)
  return (bank || []).map((q, i) => {
    const g = guideObjectFromPackGuide(list[i]) || merged
    if (!g) return q
    if (questionGuideHasContent(q?.guide)) return q
    return { ...q, guide: g }
  })
}

function guideLinesFromBankItems(bank) {
  return (bank || [])
    .map((q, i) => {
      const g = q?.guide
      if (!questionGuideHasContent(g)) return ''
      const title =
        String(g.docName || g.title || '').trim() ||
        (q.q ? `${String(q.q).slice(0, 24)}…` : `第 ${i + 1} 题攻略`)
      const payload = {
        title,
        teacherHint: String(g.teacherHint || g.body || '').trim(),
        docUrl: String(g.docUrl || (g.kind === 'doc' ? g.url : '') || '').trim(),
        docName: String(g.docName || g.title || title).trim(),
        videoUrl: String(g.videoUrl || (g.kind === 'video' ? g.url : '') || '').trim()
      }
      if (payload.teacherHint || payload.docUrl || payload.videoUrl) {
        return JSON.stringify(payload)
      }
      return serializeGuideLine({
        kind: g.kind || 'doc',
        text: title,
        url: g.url || '',
        body: g.body || ''
      })
    })
    .filter(Boolean)
}

module.exports = {
  fullDefaultChapters,
  buildCoursePblDef,
  seedCoursePblDefs,
  generateCourseAiContent,
  upsertChapterPblShell,
  bankForChapter,
  withRequires,
  serializeGuideLine,
  attachGuidesToBankItems,
  guideLinesFromBankItems,
  assessCoursePlayable,
  ensurePlayableOrFillTemplate
}
