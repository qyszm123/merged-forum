/**
 * 作品机评 + 答辩题生成（服务端权威）
 */

const ACCEPT_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'pdf',
  'ppt',
  'pptx',
  'doc',
  'docx',
  'zip',
  'mp4',
  'webm',
  'mov'
])

function extOf(name = '') {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

function keywordsFromTitle(title = '') {
  const t = String(title).replace(/[·\s\-_/]/g, '')
  const keys = []
  if (t.length >= 2) {
    for (let i = 0; i < t.length - 1 && keys.length < 6; i += 1) {
      keys.push(t.slice(i, i + 2))
    }
  }
  ;['架构', '流程', '方案', '设计', '传感', '网络', '安全', '协议', '系统', '创新'].forEach((k) => {
    if (t.includes(k)) keys.push(k)
  })
  return [...new Set(keys)]
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function withShuffledAnswer(item) {
  const opts = [...(item.opts || [])]
  const correctText = opts[item.answer ?? 0]
  const shuffled = shuffle(opts)
  return {
    ...item,
    opts: shuffled,
    answer: Math.max(0, shuffled.indexOf(correctText))
  }
}

/**
 * 规则机评（体积 / 类型 / 说明长度 / 关键词）。
 * 内容质量无法用规则可靠判定时，标记 needsAi，交由 DeepSeek 补评。
 * @returns {{ score:number, pass:boolean, checks:object[], summary:string, needsAi:boolean, hardPass:boolean, contentScore:number, hardScore:number, source:string }}
 */
function evaluateWork({
  fileName,
  mimeType,
  size,
  note,
  nodeName,
  passScore = 70
}) {
  const checks = []
  let hardScore = 0
  let contentScore = 0
  const sizeNum = Number(size) || 0
  const noteText = String(note || '').trim()
  const ext = extOf(fileName)

  if (sizeNum >= 2 * 1024) {
    hardScore += 35
    checks.push({ id: 'size', ok: true, text: `文件体积合格（${Math.round(sizeNum / 1024)} KB）` })
  } else if (sizeNum > 0) {
    hardScore += 15
    checks.push({ id: 'size', ok: false, text: '文件过小，请上传完整作品（建议 ≥ 2KB）' })
  } else {
    checks.push({ id: 'size', ok: false, text: '未检测到有效文件' })
  }

  const mimeOk =
    ACCEPT_EXT.has(ext) ||
    /^image\//.test(mimeType || '') ||
    /^video\//.test(mimeType || '') ||
    /pdf|presentation|msword|zip|officedocument/i.test(mimeType || '')
  if (mimeOk) {
    hardScore += 25
    checks.push({ id: 'type', ok: true, text: `交付类型可接受（.${ext || 'bin'}）` })
  } else {
    checks.push({ id: 'type', ok: false, text: '文件类型不在接受范围（图/PDF/PPT/文档/视频/zip）' })
  }

  const hardPass = hardScore >= 50 && mimeOk && sizeNum > 0

  if (noteText.length >= 40) {
    contentScore += 25
    checks.push({ id: 'note_len', ok: true, text: `作品说明充分（${noteText.length} 字）` })
  } else if (noteText.length >= 16) {
    contentScore += 12
    checks.push({ id: 'note_len', ok: false, text: `说明偏短（${noteText.length} 字），建议写满 40 字以上` })
  } else {
    checks.push({ id: 'note_len', ok: false, text: '请填写作品说明（目标、做法、交付物，建议 ≥ 40 字）' })
  }

  const keys = keywordsFromTitle(nodeName)
  const hit = keys.some((k) => noteText.includes(k))
  let topicCertain = false
  if (hit) {
    contentScore += 15
    topicCertain = true
    checks.push({ id: 'note_topic', ok: true, text: '说明与本关主题相关' })
  } else if (noteText.length >= 16) {
    contentScore += 5
    checks.push({
      id: 'note_topic',
      ok: false,
      uncertain: true,
      text: `规则无法确认主题相关（未命中关键词如「${(keys[0] || nodeName || '主题').slice(0, 8)}」）`
    })
  } else {
    checks.push({ id: 'note_topic', ok: false, text: '说明未体现本关主题' })
  }

  const score = Math.max(0, Math.min(100, hardScore + contentScore))
  const pass = score >= passScore
  // 硬条件过了，但主题/说明质量规则拿不准，或总分卡在及格线附近 → 交给 AI
  const needsAi =
    hardPass &&
    noteText.length >= 16 &&
    (!topicCertain || noteText.length < 40 || (score < passScore && score >= passScore - 20))

  const summary = pass
    ? `机评 ${score} 分 · 达标，可进入答辩/通关`
    : `机评 ${score} 分 · 未达 ${passScore} 分，请完善作品或说明后重交`
  return {
    score,
    pass,
    passScore,
    checks,
    summary,
    needsAi,
    hardPass,
    hardScore,
    contentScore,
    source: 'rules'
  }
}

function parseAiJson(text) {
  const raw = String(text || '').trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fence ? fence[1] : raw).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 未返回 JSON')
  return JSON.parse(body.slice(start, end + 1))
}

/**
 * 对规则无法判定的「内容分」（满分 40）交给 AI。
 * 硬性分（体积+类型，满分 60）仍用规则结果。
 */
async function enrichReviewWithAi(review, { note, nodeName, guideAi, pathTitle, chat }) {
  if (!review?.needsAi || typeof chat !== 'function') return review
  const noteText = String(note || '').trim()
  if (noteText.length < 16) return review

  const { text, model } = await chat(
    [
      {
        role: 'system',
        content:
          '你是中学信息科技 / 物联网课程的作品评审助教。' +
          '只根据作品说明判断是否完成本关任务意图，不要编造文件内容。' +
          '必须只输出一个 JSON 对象，不要 Markdown，字段：' +
          '{"contentScore":0-40整数,"passContent":true/false,"reason":"不超过40字中文","checks":["短句1","短句2"]}'
      },
      {
        role: 'user',
        content: [
          pathTitle ? `副本：${pathTitle}` : '',
          `关卡：${nodeName || '本关'}`,
          guideAi ? `攻略要点：${String(guideAi).slice(0, 280)}` : '',
          `作品说明：\n${noteText.slice(0, 1200)}`,
          '请给内容分（0～40）：相关、完整、可验收各约 1/3。无关灌水给低分。'
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { maxTokens: 320, temperature: 0.2 }
  )

  const parsed = parseAiJson(text)
  let contentScore = Number(parsed.contentScore)
  if (!Number.isFinite(contentScore)) throw new Error('AI 未返回有效 contentScore')
  contentScore = Math.max(0, Math.min(40, Math.round(contentScore)))

  const hardScore = Number(review.hardScore) || 0
  const score = Math.max(0, Math.min(100, hardScore + contentScore))
  const passScore = review.passScore || 70
  const pass = score >= passScore
  const reason = String(parsed.reason || '').trim().slice(0, 80)
  const aiChecks = Array.isArray(parsed.checks)
    ? parsed.checks.slice(0, 4).map((t, i) => ({
        id: `ai_${i + 1}`,
        ok: contentScore >= 24,
        text: String(t || '').slice(0, 60)
      }))
    : []

  const checks = [
    ...(review.checks || []).filter((c) => c.id === 'size' || c.id === 'type'),
    {
      id: 'ai_content',
      ok: contentScore >= 24,
      text: reason
        ? `AI 内容评定 ${contentScore}/40 · ${reason}`
        : `AI 内容评定 ${contentScore}/40`
    },
    ...aiChecks
  ]

  return {
    ...review,
    score,
    pass,
    contentScore,
    checks,
    summary: pass
      ? `AI 机评 ${score} 分 · 达标，可进入答辩/通关`
      : `AI 机评 ${score} 分 · 未达 ${passScore} 分，请按评语完善后重交`,
    needsAi: false,
    source: 'deepseek',
    model,
    aiReason: reason
  }
}

function buildDefenseQuestions({ nodeName, note, guideAi }) {
  const title = nodeName || '本作品'
  const noteText = String(note || '').trim()
  const noteHint = noteText ? noteText.slice(0, 40) : ''
  const tip = (guideAi || '').trim().slice(0, 48)

  const raw = [
    {
      id: 'd1',
      q: `「${title}」作品要解决的核心问题应是？`,
      opts: ['围绕本关任务目标的真实问题', '与任务无关的闲聊', '只复制模板不解释问题'],
      answer: 0
    },
    {
      id: 'd2',
      q: noteHint
        ? `你在说明中写到「${noteHint}${noteText.length > 40 ? '…' : ''}」，答辩展开时应优先补充？`
        : tip
          ? `结合攻略提示「${tip}${guideAi.length > 48 ? '…' : ''}」，作品交付最应体现？`
          : '作品中的图示 / 流程 / PPT / 视频分别承担什么作用？',
      opts: noteHint
        ? ['关键步骤、成果依据与验收标准', '重复粘贴说明原文即可', '否认自己写过的说明']
        : tip
          ? ['把攻略要点落到可验收的交付物', '只背攻略原文不交作品', '忽略任务要求']
          : ['表达方案结构、步骤与演示', '只为凑字数', '可以全部省略'],
      answer: 0
    },
    {
      id: 'd3',
      q: `若评委追问「${title}」的改进点，更合理的回应是？`,
      opts: ['承认局限并给出下一轮可验证的迭代', '否认一切问题', '拒绝回答并要求直接通关'],
      answer: 0
    },
    {
      id: 'd4',
      q: '机评已通过但答辩未达标时，任务结果应是？',
      opts: ['不予通关，需修改作品或重新答辩', '自动通关并加分', '忽略答辩分数'],
      answer: 0
    }
  ]
  return shuffle(raw.map(withShuffledAnswer))
}

function scoreDefense(questions, answers) {
  const list = Array.isArray(questions) ? questions : []
  let correct = 0
  list.forEach((q, i) => {
    const picked = Number(answers?.[i])
    if (Number.isFinite(picked) && picked === Number(q.answer)) correct += 1
  })
  const total = list.length || 1
  const score = Math.round((correct / total) * 100)
  return { score, correct, total }
}

module.exports = {
  evaluateWork,
  enrichReviewWithAi,
  buildDefenseQuestions,
  scoreDefense,
  ACCEPT_EXT
}
