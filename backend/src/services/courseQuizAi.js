/**
 * 教师副本题库：DeepSeek 按单元 / 知识点生成选择题
 */
const deepseek = require('./deepseek')
const {
  normalizeQuestionKind,
  normalizeQuestionFormat,
  kindForSlot,
  formatForSlot,
  AI_KIND_RULE,
  AI_FORMAT_RULE,
  ensureBankKindMix,
  ensureBankFormatMix
} = require('../data/questionKinds')

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
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1))
    } catch {
      return null
    }
  }
  return null
}

function normalizeBankItem(item, i, quizNodes, chapterId) {
  if (!item || typeof item !== 'object') return null
  const kpFallback = quizNodes[0]?.id || ''
  const kpSet = new Set(quizNodes.map((n) => n.id))
  const q = String(item.q || item.question || '').trim()
  if (!q) return null
  let kpId = String(item.kpId || item.nodeId || '').trim()
  if (!kpSet.has(kpId)) kpId = kpFallback
  const format = normalizeQuestionFormat(item.format, formatForSlot(i))
  const base = {
    id: String(item.id || `ai-${chapterId}-${i + 1}`).slice(0, 64),
    kpId,
    q,
    kind: normalizeQuestionKind(item.kind, kindForSlot(i)),
    format
  }
  if (format === 'blank') {
    let blankAnswers = Array.isArray(item.blankAnswers)
      ? item.blankAnswers.map((s) => String(s || '').trim()).filter(Boolean)
      : String(item.blankAnswer || '')
          .split(/[|；;]/)
          .map((s) => s.trim())
          .filter(Boolean)
    if (!blankAnswers.length && Array.isArray(item.opts)) {
      const seed = String(item.opts[item.answer ?? 0] || item.opts.find(Boolean) || '').trim()
      if (seed) blankAnswers = [seed]
    }
    if (!blankAnswers.length) return null
    return { ...base, opts: ['', '', '', ''], answer: 0, blankAnswers }
  }
  if (format === 'truefalse') {
    let answer = Number(item.answer)
    if (!Number.isFinite(answer) || answer < 0 || answer > 1) {
      const letter = String(item.answerKey || item.correct || 'A').trim().toUpperCase()
      answer = letter === 'B' || letter === '错误' ? 1 : 0
    }
    return { ...base, opts: ['正确', '错误'], answer, blankAnswers: [] }
  }
  let opts = Array.isArray(item.opts)
    ? item.opts.map((o) => String(o || '').trim()).filter(Boolean)
    : []
  if (opts.length < 3) return null
  opts = opts.slice(0, 4)
  while (opts.length < 3) opts.push(`选项${opts.length + 1}`)
  let answer = Number(item.answer)
  if (!Number.isFinite(answer) || answer < 0 || answer >= opts.length) {
    const letter = String(item.answerKey || item.correct || 'A')
      .trim()
      .toUpperCase()
    answer = Math.max(0, 'ABCD'.indexOf(letter[0]))
    if (answer >= opts.length) answer = 0
  }
  return { ...base, opts, answer, blankAnswers: [] }
}

function normalizeBank(list, quizNodes, pathId, chapterId, opts = {}) {
  const out = []
  const arr = Array.isArray(list) ? list : []
  arr.forEach((item, i) => {
    const row = normalizeBankItem(item, i, quizNodes, chapterId)
    if (row) out.push(row)
  })
  let bank = ensureBankKindMix(out, quizNodes)
  const formatOnly = opts.formatOnly && opts.formatOnly !== 'all' ? normalizeQuestionFormat(opts.formatOnly) : null
  if (formatOnly) {
    bank = bank.map((q) => ({ ...q, format: formatOnly }))
  } else if (!opts.skipFormatMix) {
    bank = ensureBankFormatMix(bank)
  }
  return bank
}

/**
 * 为一个单元生成题库（仅 quiz 节点）
 * @returns {Promise<object[]|null>} null 表示未配置或失败
 */
async function generateBankForChapter({
  pathId,
  courseTitle,
  courseBlurb,
  chapter,
  teacherHint = '',
  questionCount,
  questionFormat = '',
  attempt = 1
}) {
  if (!deepseek.isConfigured()) return null
  const quizNodes = (chapter?.nodes || []).filter((n) => n.type === 'quiz')
  if (!quizNodes.length) return []

  const nodeLines = quizNodes
    .map((n, i) => `${i + 1}. id=${n.id} 名称=${n.name}`)
    .join('\n')
  const perNode = 4
  let want = Math.min(24, Math.max(6, quizNodes.length * perNode))
  const qc = Number(questionCount)
  if (Number.isFinite(qc) && qc >= 3) want = Math.min(24, Math.round(qc))
  const hint = String(teacherHint || '').trim()
  const fmtOnly =
    questionFormat && questionFormat !== 'all' ? normalizeQuestionFormat(questionFormat) : null

  const formatUserLine = fmtOnly === 'truefalse'
    ? `请生成约 ${want} 道判断题（format 必须为 truefalse，opts=["正确","错误"]，answer 为 0 或 1）。`
    : fmtOnly === 'blank'
      ? `请生成约 ${want} 道填空题（format 必须为 blank，使用 blankAnswers 数组给出可接受答案）。`
      : fmtOnly === 'single'
        ? `请生成约 ${want} 道单选题（format 必须为 single，恰好 4 选项，answer 为 0-3）。`
        : `请生成约 ${want} 道题（单选 + 判断 + 填空混合），覆盖上述知识点（每个知识点至少 ${Math.max(1, perNode - 1)} 道，且考查方向多样化）。`

  const formatSystemExtra = fmtOnly === 'truefalse'
    ? '本次只出判断题，禁止输出单选或填空。'
    : fmtOnly === 'blank'
      ? '本次只出填空题，禁止输出单选或判断。'
      : fmtOnly === 'single'
        ? '本次只出单选题，禁止输出判断或填空。'
        : AI_FORMAT_RULE

  try {
    const { text } = await deepseek.chat(
      [
        {
          role: 'system',
          content:
            '你是中学 STEM / 数学建模 / 信息科技出题老师，服务「科创广场」教师自建副本。' +
            '只输出 JSON 数组，不要 Markdown 说明、不要代码围栏。' +
            '题目必须紧扣课程主题与真实学科知识，禁止空泛套话（如“学习目标是什么”“打开攻略再刷题”）。' +
            '难度适合初中～高一；干扰项要合理。' +
            AI_KIND_RULE +
            formatSystemExtra
        },
        {
          role: 'user',
          content: [
            `课程名称：${courseTitle || pathId}`,
            courseBlurb ? `课程简介：${courseBlurb}` : '',
            `单元：${chapter?.name || chapter?.id}`,
            hint ? `【教师出题要求 — 必须优先满足】\n${hint.slice(0, 2000)}` : '',
            `知识点列表（kpId 必须原样使用）：\n${nodeLines}`,
            formatUserLine,
            AI_KIND_RULE,
            fmtOnly
              ? `每题 format 必须为 "${fmtOnly}"。`
              : AI_FORMAT_RULE,
            '严格输出 JSON 数组，元素字段：',
            '{"id":"q1","kpId":"必须等于上方某知识点id","format":"single|truefalse|blank","q":"题干","opts":["…"],"answer":0,"blankAnswers":["…"],"kind":"concept|scenario|strategy|综合"}',
            '说明：single 必须 4 选项；truefalse 用 opts=["正确","错误"]；blank 用 blankAnswers 数组。'
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      { maxTokens: 3200, temperature: attempt === 1 ? 0.45 : 0.35, timeoutMs: 60000 }
    )

    const parsed = extractJson(text)
    const bank = normalizeBank(parsed, quizNodes, pathId, chapter?.id || 'ch', {
      formatOnly: fmtOnly,
      skipFormatMix: !!fmtOnly
    })
    if (bank.length < 3) {
      throw new Error('AI 返回题目过少或格式无效')
    }
    return bank
  } catch (err) {
    if (attempt < 2) {
      return generateBankForChapter({
        pathId,
        courseTitle,
        courseBlurb,
        chapter,
        teacherHint,
        questionCount,
        questionFormat,
        attempt: attempt + 1
      })
    }
    console.warn('[courseQuizAi] generateBankForChapter 失败', chapter?.id, err.message)
    return null
  }
}

/**
 * 单题 AI 辅助：整题 / 题干 / 选项
 */
async function assistQuestion({
  pathId,
  courseTitle,
  courseBlurb,
  chapter,
  quizNode,
  draft,
  field = 'full'
}) {
  if (!deepseek.isConfigured()) return null
  const node = quizNode || (chapter?.nodes || []).find((n) => n.type === 'quiz')
  if (!node) return null

  const format = normalizeQuestionFormat(draft?.format)
  const fieldHint =
    field === 'stem'
      ? '只改写题干 q，format/opts/answer/blankAnswers/kpId 保持不变。'
      : field === 'opts'
        ? format === 'truefalse'
          ? '只改写判断题 opts（["正确","错误"]）与 answer，题干 q 保持不变。'
          : format === 'blank'
            ? '只改写 blankAnswers 数组，题干 q 保持不变。'
            : '只改写 opts 四个选项与 answer，题干 q 保持不变。'
        : format === 'blank'
          ? '生成完整填空题：blankAnswers 为可接受答案数组。'
          : format === 'truefalse'
            ? '生成完整判断题：opts=["正确","错误"]，answer 为 0 或 1。'
            : '生成完整单选题：恰好 4 个选项，answer 为 0-3。'

  const systemFormatHint =
    format === 'blank'
      ? '填空题：blankAnswers 为字符串数组，opts 可省略。'
      : format === 'truefalse'
        ? '判断题：opts=["正确","错误"]，answer 为 0 或 1。'
        : '单选题：恰好 4 个选项，answer 为 0-3。'

  try {
    const { text } = await deepseek.chat(
      [
        {
          role: 'system',
          content:
            '你是中学 STEM 出题老师。只输出 JSON 对象，不要 Markdown。' +
            systemFormatHint +
            '题目紧扣学科，禁止空泛套话。'
        },
        {
          role: 'user',
          content: [
            `课程：${courseTitle || pathId}`,
            courseBlurb ? `简介：${courseBlurb}` : '',
            `单元：${chapter?.name || ''}`,
            `知识点 id=${node.id} 名称=${node.name}`,
            `答题形式 format：${format}`,
            draft?.q ? `当前题干：${draft.q}` : '',
            format === 'blank'
              ? Array.isArray(draft?.blankAnswers) && draft.blankAnswers.length
                ? `当前填空答案：${draft.blankAnswers.join(' | ')}`
                : ''
              : Array.isArray(draft?.opts) && draft.opts.length
                ? `当前选项：${draft.opts.map((o, i) => `${String.fromCharCode(65 + i)}.${o}`).join(' ')}`
                : '',
            fieldHint,
            draft?.kind ? `期望考查方向 kind：${normalizeQuestionKind(draft.kind)}` : AI_KIND_RULE,
            '输出 JSON：{"id":"…","kpId":"…","format":"' +
              format +
              '","q":"…","opts":["…"],"answer":0,"blankAnswers":["…"],"kind":"concept|scenario|strategy|综合"}'
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      { maxTokens: 900, temperature: 0.42, timeoutMs: 45000 }
    )

    const parsed = extractJson(text)
    const item = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : parsed?.[0]
    if (!item) return null
    if (!item.format) item.format = format
    const bank = normalizeBank([item], [node], pathId, chapter?.id || 'ch')
    return bank[0] || null
  } catch (err) {
    console.warn('[courseQuizAi] assistQuestion 失败', err.message)
    return null
  }
}

module.exports = {
  generateBankForChapter,
  normalizeBank,
  assistQuestion,
  isConfigured: () => deepseek.isConfigured()
}
