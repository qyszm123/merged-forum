/**
 * 官方主线 + 教师副本 · 统一选择题分类
 * 与 trainQuestionBanks.js 预置题库对齐，并支持教师自定义题
 */
const QUESTION_KINDS = [
  { id: 'concept', label: '概念理解', desc: '考查核心概念与定义' },
  { id: 'scenario', label: '情景应用', desc: '放在具体场景里判断' },
  { id: 'strategy', label: '解题策略', desc: '方法、步骤与思路' },
  { id: '综合', label: '综合题', desc: '跨知识点或小综合' },
  { id: 'custom', label: '教师自定义', desc: '教师手工编写或改编' }
]

const VALID_IDS = new Set(QUESTION_KINDS.map((k) => k.id))

const ALIASES = {
  ai: '综合',
  comprehensive: '综合',
  applied: '综合',
  综合题: '综合',
  综合应用: '综合',
  teacher: 'custom',
  教师自定义: 'custom',
  自定义: 'custom'
}

/** 与官方预置题库相近的考查方向轮换（每知识点约 6 题） */
const KIND_ROTATION = ['concept', 'concept', 'scenario', 'concept', 'strategy', '综合']

/** 答题形式轮换：单选为主，穿插判断与填空 */
const FORMAT_ROTATION = ['single', 'single', 'single', 'truefalse', 'truefalse', 'blank']

const AI_KIND_RULE =
  'kind 必须从 concept（概念理解）、scenario（情景应用）、strategy（解题策略）、综合（综合题）中选取；' +
  '同一知识点题目需多样化，至少包含 concept、scenario、综合 各一题，建议含 strategy。'

const AI_FORMAT_RULE =
  'format 从 single（单选，opts 恰好 4 项 answer 0-3）、truefalse（判断，opts=["正确","错误"] answer 0 或 1）、' +
  'blank（填空，blankAnswers 为可接受答案字符串数组，opts 可省略）中选取；' +
  '约 6 题中至少含 1 道判断题、1 道填空题，其余可为单选。'

function normalizeQuestionKind(raw, fallback = 'concept') {
  const s = String(raw ?? '').trim()
  if (!s) return VALID_IDS.has(fallback) ? fallback : 'concept'
  if (ALIASES[s]) return ALIASES[s]
  const lower = s.toLowerCase()
  if (ALIASES[lower]) return ALIASES[lower]
  if (VALID_IDS.has(s)) return s
  return VALID_IDS.has(fallback) ? fallback : 'concept'
}

function kindLabel(kind) {
  const id = normalizeQuestionKind(kind)
  return QUESTION_KINDS.find((k) => k.id === id)?.label || id
}

function kindForSlot(index) {
  return KIND_ROTATION[Math.max(0, Number(index) || 0) % KIND_ROTATION.length]
}

function normalizeQuestionFormat(raw, fallback = 'single') {
  const s = String(raw ?? '').trim()
  if (!s) return ['single', 'truefalse', 'blank'].includes(fallback) ? fallback : 'single'
  if (s === 'truefalse' || s === '判断题' || s === 'judgment') return 'truefalse'
  if (s === 'blank' || s === '填空题' || s === 'fill') return 'blank'
  if (s === 'single' || s === '单选题' || s === 'choice') return 'single'
  return 'single'
}

function formatForSlot(index) {
  return FORMAT_ROTATION[Math.max(0, Number(index) || 0) % FORMAT_ROTATION.length]
}

function convertBankItemFormat(q, nextFormat) {
  const format = normalizeQuestionFormat(nextFormat)
  const stem = String(q?.q || '').trim()
  if (!stem) return q
  const base = { ...q, format }
  if (format === 'truefalse') {
    let answer = Number(q.answer)
    if (!Number.isFinite(answer) || answer < 0 || answer > 1) answer = 0
    return { ...base, opts: ['正确', '错误'], answer, blankAnswers: [] }
  }
  if (format === 'blank') {
    let blankAnswers = Array.isArray(q.blankAnswers)
      ? q.blankAnswers.map((s) => String(s || '').trim()).filter(Boolean)
      : []
    if (!blankAnswers.length && Array.isArray(q.opts)) {
      const seed = q.opts[Number(q.answer) || 0] || q.opts.find(Boolean)
      if (seed) blankAnswers = [String(seed).trim()]
    }
    if (!blankAnswers.length) blankAnswers = ['']
    return { ...base, opts: ['', '', '', ''], answer: 0, blankAnswers }
  }
  let opts = Array.isArray(q.opts) ? q.opts.map((o) => String(o || '').trim()) : []
  while (opts.length < 4) opts.push('')
  opts = opts.slice(0, 4)
  let answer = Number(q.answer)
  if (!Number.isFinite(answer) || answer < 0 || answer > 3) answer = 0
  return { ...base, opts, answer, blankAnswers: [] }
}

/** 补齐 AI/模板题库中缺失的答题形式（尽量保留题干） */
function ensureBankFormatMix(bank) {
  if (!Array.isArray(bank) || bank.length < 3) return bank
  ;['truefalse', 'blank'].forEach((need) => {
    const have = bank.some((q) => normalizeQuestionFormat(q.format) === need)
    if (have) return
    const target = bank.find((q) => normalizeQuestionFormat(q.format) === 'single')
    if (!target) return
    Object.assign(target, convertBankItemFormat(target, need))
  })
  return bank
}

/** 补齐 AI/模板题库中缺失的考查方向标签（不改题干） */
function ensureBankKindMix(bank, quizNodes = []) {
  if (!Array.isArray(bank) || !bank.length) return bank
  const kpSet = new Set((quizNodes || []).map((n) => n.id))
  const byKp = new Map()
  bank.forEach((q) => {
    const kp = q.kpId && kpSet.has(q.kpId) ? q.kpId : '_all'
    if (!byKp.has(kp)) byKp.set(kp, [])
    byKp.get(kp).push(q)
  })
  const required = ['concept', 'scenario', '综合']
  byKp.forEach((list) => {
    const have = new Set(list.map((q) => normalizeQuestionKind(q.kind)))
    required.forEach((need) => {
      if (have.has(need)) return
      const target = list.find((q) => !required.includes(normalizeQuestionKind(q.kind)))
      if (target) {
        target.kind = need
        have.add(need)
      }
    })
  })
  return bank
}

module.exports = {
  QUESTION_KINDS,
  KIND_ROTATION,
  FORMAT_ROTATION,
  AI_KIND_RULE,
  AI_FORMAT_RULE,
  normalizeQuestionKind,
  normalizeQuestionFormat,
  kindLabel,
  kindForSlot,
  formatForSlot,
  convertBankItemFormat,
  ensureBankKindMix,
  ensureBankFormatMix
}
