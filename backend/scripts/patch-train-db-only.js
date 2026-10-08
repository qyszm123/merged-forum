/**
 * 修炼之路：只信数据库 / 零本地兜底 — 补丁 prototype.js
 */
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '../../prototype.js')
let t = fs.readFileSync(file, 'utf8')
const orig = t

function mustReplace(oldStr, newStr, label) {
  if (!t.includes(oldStr)) {
    console.warn('[skip]', label)
    return false
  }
  t = t.replace(oldStr, newStr)
  console.log('[ok]', label)
  return true
}

// PBL：只保留内存缓存，不再读写 localStorage
mustReplace(
  `  const PBL_STORAGE_KEY = 'kcsquare-pbl-tasks'`,
  `  const PBL_STORAGE_KEY = 'kcsquare-pbl-tasks' // 已废弃：仅兼容旧键清理
  let PBL_API_CACHE = {}`,
  'pbl cache var'
)

mustReplace(
  `  function loadPblDefs() {
    try {
      return JSON.parse(localStorage.getItem(PBL_STORAGE_KEY) || '{}') || {}
    } catch {
      return {}
    }
  }

  function savePblDefs(defs) {
    localStorage.setItem(PBL_STORAGE_KEY, JSON.stringify(defs || {}))
  }`,
  `  function loadPblDefs() {
    return PBL_API_CACHE || {}
  }

  function savePblDefs(defs) {
    PBL_API_CACHE = defs || {}
    try {
      localStorage.removeItem(PBL_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }`,
  'pbl load/save'
)

mustReplace(
  `  async function pullPblDefsFromApi(pathId) {
    try {
      const list = await apiRequest(\`/train/pbl?pathId=\${encodeURIComponent(pathId)}\`)
      if (!Array.isArray(list) || !list.length) return false
      const defs = loadPblDefs()
      list.forEach((item) => {
        if (item?.def && item.taskId) {
          defs[pblStorageKey(pathId, item.taskId)] = { ...item.def, pathId, taskId: item.taskId }
        }
      })
      savePblDefs(defs)
      return true
    } catch {
      return false
    }
  }`,
  `  async function pullPblDefsFromApi(pathId) {
    try {
      await ensureApiAuth()
      const list = await apiRequest(\`/train/pbl?pathId=\${encodeURIComponent(pathId)}\`)
      if (!Array.isArray(list) || !list.length) return false
      const defs = { ...loadPblDefs() }
      list.forEach((item) => {
        if (item?.def && item.taskId) {
          defs[pblStorageKey(pathId, item.taskId)] = { ...item.def, pathId, taskId: item.taskId }
        }
      })
      savePblDefs(defs)
      return true
    } catch (err) {
      console.warn('[kcsquare] pull pbl failed', err)
      return false
    }
  }`,
  'pullPbl'
)

// 去掉教材本地灌库 / 占位题生成对通关的影响：seed 变空操作
mustReplace(
  `  /** 把教材题库写入本地任务规则，替换占位题，形成副本刷题闭环 */
  function seedTextbookPblBanks(force = false) {
    if (typeof window === 'undefined' || !window.TRAIN_QUESTION_BANKS) return { seeded: 0 }
    const defs = loadPblDefs()
    let seeded = 0
    ;['network', 'hardware'].forEach((pathId) => {
      trainTasks(pathId).forEach((task) => {
        const bank = curatedBankForTask(pathId, task)
        if (!bank?.length) return
        const key = pblStorageKey(pathId, task.id)
        const existing = defs[key]
        if (!force && existing?.bank && !isStubPblBank(existing.bank) && existing.source === 'textbook-bank-v1') {
          return
        }
        if (!force && existing?.bank && !isStubPblBank(existing.bank) && existing.source !== 'textbook-bank-v1') {
          // 老师已手改过的完整题库不覆盖
          if ((existing.bank || []).length >= bank.length * 0.5) return
        }
        defs[key] = {
          ...defaultPblDef(pathId, task),
          ...(existing || {}),
          pathId,
          taskId: task.id,
          title: task.name,
          kind: 'comprehensive',
          drillEnabled: true,
          practiceEnabled: true,
          passScore: existing?.passScore ?? 80,
          bank,
          source: 'textbook-bank-v1',
          updatedAt: Date.now()
        }
        seeded += 1
      })
    })
    savePblDefs(defs)
    return { seeded }
  }`,
  `  /** 题库只认数据库；不再向浏览器灌本地题库 */
  function seedTextbookPblBanks() {
    return { seeded: 0 }
  }`,
  'seedTextbook noop'
)

mustReplace(
  `  function getPblDef(pathId, taskId) {
    if (!pathId || !taskId) return null
    const saved = loadPblDefs()[pblStorageKey(pathId, taskId)]
    const task = findTask(pathId, taskId)
    if (saved) return { ...defaultPblDef(pathId, task || { id: taskId, name: saved.title, nodes: [] }), ...saved }
    if (task) return defaultPblDef(pathId, task)
    return null
  }`,
  `  function getPblDef(pathId, taskId) {
    if (!pathId || !taskId) return null
    const saved = loadPblDefs()[pblStorageKey(pathId, taskId)]
    if (saved) return saved
    return null
  }`,
  'getPblDef api-only'
)

mustReplace(
  `  function questionsForDrill(pbl, kpId) {
    const bank = Array.isArray(pbl?.bank) ? pbl.bank : []
    const scoped = bank.filter((q) => !q.kpId || !kpId || q.kpId === kpId)
    let pool = scoped.length ? scoped : bank
    // 题量不足时，从教材总库按知识点补齐
    if (pool.length < 5 && kpId && typeof window !== 'undefined') {
      const extra = (window.TRAIN_QUESTION_BANKS?.byKp?.[kpId] || []).map((q) => ({ ...q }))
      const seen = new Set(pool.map((q) => q.id))
      extra.forEach((q) => {
        if (!seen.has(q.id)) pool.push(q)
      })
    }
    const take = Math.min(8, Math.max(3, pool.length || 0))
    const list = shuffleArray(pool).slice(0, take || 0)
    if (list.length) {
      return list.map((item) => {
        const opts = [...(item.opts || [])]
        const correct = opts[item.answer ?? 0]
        const shuffled = shuffleArray(opts)
        return {
          ...item,
          opts: shuffled,
          answer: Math.max(0, shuffled.indexOf(correct))
        }
      })
    }
    return [
      {
        id: 'fallback-1',
        q: '完成本任务刷题时，通关标准是？',
        opts: ['达到设定分数线（默认 80 分）', '随便点提交即可', '只看攻略不用答题'],
        answer: 0,
        kpId: kpId || ''
      }
    ]
  }`,
  `  function questionsForDrill(pbl, kpId) {
    // 刷题题目必须来自 /train/quiz/start，此处仅作空占位
    return []
  }`,
  'questionsForDrill empty'
)

mustReplace(
  `  /** 本地机评（后端不可用时的闭环回退） */
  function evaluateWorkLocal({ fileName, mimeType, size, note, nodeName, passScore = 70 }) {
    const checks = []
    let score = 0
    const sizeNum = Number(size) || 0
    const noteText = String(note || '').trim()
    const ext = String(fileName || '')
      .toLowerCase()
      .match(/\\.([a-z0-9]+)$/)?.[1]
    if (sizeNum >= 2048) {
      score += 35
      checks.push({ ok: true, text: \`文件体积合格（\${Math.round(sizeNum / 1024)} KB）\` })
    } else if (sizeNum > 0) {
      score += 15
      checks.push({ ok: false, text: '文件过小，请上传完整作品（建议 ≥ 2KB）' })
    } else {
      checks.push({ ok: false, text: '未检测到有效文件' })
    }
    const mimeOk =
      /^(image|video)\\//.test(mimeType || '') ||
      /pdf|presentation|msword|zip|officedocument/i.test(mimeType || '') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'ppt', 'pptx', 'doc', 'docx', 'zip', 'mp4', 'webm', 'mov'].includes(
        ext || ''
      )
    if (mimeOk) {
      score += 25
      checks.push({ ok: true, text: \`交付类型可接受（.\${ext || 'bin'}）\` })
    } else {
      checks.push({ ok: false, text: '文件类型不在接受范围' })
    }
    if (noteText.length >= 40) {
      score += 25
      checks.push({ ok: true, text: \`作品说明充分（\${noteText.length} 字）\` })
    } else if (noteText.length >= 16) {
      score += 12
      checks.push({ ok: false, text: \`说明偏短（\${noteText.length} 字），建议 ≥ 40 字\` })
    } else {
      checks.push({ ok: false, text: '请填写作品说明（建议 ≥ 40 字）' })
    }
    const title = String(nodeName || '')
    const hit = title && [...title].some((ch, i) => i < title.length - 1 && noteText.includes(title.slice(i, i + 2)))
    if (hit) {
      score += 15
      checks.push({ ok: true, text: '说明与本关主题相关' })
    } else {
      checks.push({ ok: false, text: '说明建议点明本关主题关键词' })
    }
    score = Math.max(0, Math.min(100, score))
    return {
      score,
      pass: score >= passScore,
      passScore,
      checks,
      summary: score >= passScore ? \`机评 \${score} 分 · 达标\` : \`机评 \${score} 分 · 未达 \${passScore} 分\`
    }
  }`,
  `  function evaluateWorkLocal() {
    throw new Error('本地机评已禁用，请连接后端')
  }`,
  'evaluateWorkLocal disabled'
)

mustReplace(
  `  async function completeKpOnServer(score = 80) {
    const pathId = state.trainPath || state.path || 'network'
    const nodeId = state.currentKpId
    if (!nodeId) return null
    const tierId = resolveKpTier(pathId, nodeId) || state.trainTier || 'beginner'
    const session = state.questSession
    await ensureApiAuth()
    const payload = {
      pathId,
      tierId,
      nodeId,
      score: Math.max(0, Math.min(100, Math.round(Number(score) || 80)))
    }
    if (session?.submissionId) payload.submissionId = Number(session.submissionId)
    if (session?.workFile?.id) payload.uploadId = Number(session.workFile.id)
    return apiRequest('/train/complete', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }`,
  `  async function completeKpOnServer(score = 80) {
    const pathId = state.trainPath || state.path || 'network'
    const nodeId = state.currentKpId
    if (!nodeId) return null
    const tierId = resolveKpTier(pathId, nodeId) || state.trainTier || 'beginner'
    const session = state.questSession
    await ensureApiAuth()
    const payload = {
      pathId,
      tierId,
      nodeId,
      score: Math.max(0, Math.min(100, Math.round(Number(score) || 80)))
    }
    if (session?.submissionId) payload.submissionId = Number(session.submissionId)
    if (session?.workFile?.id) payload.uploadId = Number(session.workFile.id)
    if (session?.quizAttemptId) payload.quizAttemptId = Number(session.quizAttemptId)
    return apiRequest('/train/complete', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }`,
  'completeKp quizAttemptId'
)

mustReplace(
  `    } catch (err) {
      showToast(err.message || '通关同步失败，已记本地进度')
    }

    clearCurrentKp()`,
  `    } catch (err) {
      showToast(err.message || '通关失败：未写入数据库')
      setTimeout(() => {
        state.questGuardIgnore = false
      }, 400)
      return
    }

    clearCurrentKp()`,
  'submitKp no local clear'
)

mustReplace(
  `  document.getElementById('btn-quest-submit')?.addEventListener('click', async (e) => {
    e.preventDefault()
    const session = state.questSession
    const questions = session?.questions || []
    const root = document.getElementById('quest-q-body')
    const unanswered = questions.some((_, i) => !root?.querySelector(\`input[name="pq\${i}"]:checked\`))
    if (unanswered) {
      showToast('请完成全部题目再提交')
      return
    }
    const { score, correct, total } = scoreQuizAnswers(questions, root)
    const line = session?.passScore ?? 80
    if (score < line) {
      showQuestResult({
        pass: false,
        title: \`刷题未达标（\${score} 分）\`,
        desc: \`本题库共 \${total} 题，答对 \${correct} 题。需达到 \${line} 分才算通关，可查看攻略后重试。\`,
        reward: '进度未更新 · 请继续练习',
        retryGo: 'quest'
      })
      showToast(\`未达 \${line} 分，任务未通关\`)
      return
    }
    showToast(\`刷题 \${score} 分 · 达标通关\`)
    await submitKpChallenge(score)
  })`,
  `  document.getElementById('btn-quest-submit')?.addEventListener('click', async (e) => {
    e.preventDefault()
    const session = state.questSession
    const questions = session?.questions || []
    const root = document.getElementById('quest-q-body')
    const unanswered = questions.some((_, i) => !root?.querySelector(\`input[name="pq\${i}"]:checked\`))
    if (unanswered) {
      showToast('请完成全部题目再提交')
      return
    }
    if (!session?.quizAttemptId) {
      showToast('题卷未从服务器加载，请返回重进本关')
      return
    }
    const answers = questions.map((_, i) => {
      const picked = root?.querySelector(\`input[name="pq\${i}"]:checked\`)
      return picked ? Number(picked.value) : -1
    })
    try {
      await ensureApiAuth()
      const result = await apiRequest('/train/quiz/submit', {
        method: 'POST',
        body: JSON.stringify({ attemptId: Number(session.quizAttemptId), answers })
      })
      const line = result.passScore ?? session.passScore ?? 80
      if (!result.pass) {
        showQuestResult({
          pass: false,
          title: \`刷题未达标（\${result.score} 分）\`,
          desc: \`本题库共 \${result.total} 题，答对 \${result.correct} 题。需达到 \${line} 分才算通关。\`,
          reward: '进度未更新 · 请继续练习',
          retryGo: 'quest'
        })
        showToast(\`未达 \${line} 分，任务未通关\`)
        return
      }
      showToast(\`刷题 \${result.score} 分 · 服务端判分通过\`)
      await submitKpChallenge(result.score)
    } catch (err) {
      showToast(err.message || '刷题提交失败')
    }
  })`,
  'quiz submit api'
)

// work submit fallback
mustReplace(
    `    } catch (err) {
      review = evaluateWorkLocal({
        fileName: session.workFile.originalName || session.workFile.name,
        mimeType: session.workFile.mimeType,
        size: session.workFile.size,
        note: session.workNote,
        nodeName: node?.name,
        passScore: 70
      })
      session.machineScore = review.score
      session.workStatus = review.pass
        ? session.defenseEnabled
          ? 'pending_defense'
          : 'machine_passed'
        : 'machine_failed'
      showToast(err.message || '机评接口不可用，已使用本地机评')
    }`,
    `    } catch (err) {
      showToast(err.message || '机评失败：后端不可用')
      return
    }`,
    'work no local review'
)

mustReplace(
      `      session.defenseQuestions = defenseQuestions || generateDefenseQuestions(node, getPblDef(pathId, session.taskId))`,
      `      if (!defenseQuestions?.length) {
        showToast('服务端未返回答辩题，请重试提交')
        return
      }
      session.defenseQuestions = defenseQuestions`,
      'defense no local gen'
)

// identity-select: don't seed local banks as authority
mustReplace(
  `      seedTextbookPblBanks(false)
      pullPblDefsFromApi(pathId).then((ok) => {
        if (!ok) seedTextbookPblBanks(false)
        else {
          // API 若仍是空/占位，用教材题库补齐本地
          seedTextbookPblBanks(false)
        }
      })`,
  `      pullPblDefsFromApi(pathId).then((ok) => {
        if (!ok) showToast('任务规则未从数据库加载，请先 seed-pbl-banks')
      })`,
  'identity pull only'
)

// After fillQuest sets drillQs empty, start quiz from API — inject helper call into fillQuestForKp
mustReplace(
  `    const passScore = pbl?.passScore ?? 80
    const drillQs = node.type === 'work' ? [] : questionsForDrill(pbl, node.id)
    state.questSession = {
      pathId,
      taskId,
      kpId: node.id,
      mode: node.type === 'work' ? 'practice' : 'drill',
      passScore,
      defensePassScore: pbl?.defensePassScore ?? 80,
      defenseEnabled: !!(pbl?.defenseEnabled && (pbl?.practiceEnabled !== false)),
      guideEnabled: pbl?.guideEnabled !== false,
      questions: drillQs,
      workUploaded: false,
      acceptTypes: pbl?.acceptTypes || ['design', 'flowchart', 'ppt', 'video']
    }`,
  `    const passScore = pbl?.passScore ?? 80
    state.questSession = {
      pathId,
      taskId,
      kpId: node.id,
      mode: node.type === 'work' ? 'practice' : 'drill',
      passScore,
      defensePassScore: pbl?.defensePassScore ?? 80,
      defenseEnabled: !!(pbl?.defenseEnabled && (pbl?.practiceEnabled !== false)),
      guideEnabled: pbl?.guideEnabled !== false,
      questions: [],
      quizAttemptId: null,
      workUploaded: false,
      acceptTypes: pbl?.acceptTypes || ['design', 'flowchart', 'ppt', 'video']
    }
    if (node.type !== 'work') {
      startQuizAttempt(pathId, taskId, node, passScore)
    }`,
  'fillQuest startQuiz'
)

// Insert startQuizAttempt before fillQuestForKp
if (!t.includes('async function startQuizAttempt')) {
  t = t.replace(
    `  function fillQuestForKp(node) {`,
    `  async function startQuizAttempt(pathId, taskId, node, passScore) {
    const bodyEl = document.getElementById('quest-q-body')
    if (bodyEl) bodyEl.innerHTML = '<p class="muted">正在从服务器组卷…</p>'
    try {
      await ensureApiAuth()
      const tierId = resolveKpTier(pathId, node.id) || state.trainTier || 'beginner'
      const data = await apiRequest('/train/quiz/start', {
        method: 'POST',
        body: JSON.stringify({
          pathId,
          tierId,
          taskId: taskId || '',
          nodeId: node.id,
          passScore: passScore || 80
        })
      })
      if (!state.questSession || state.questSession.kpId !== node.id) return
      state.questSession.quizAttemptId = data.attemptId
      state.questSession.questions = data.questions || []
      state.questSession.passScore = data.passScore || passScore
      // 重绘题目
      const root = document.getElementById('quest-q-body')
      if (root) {
        root.innerHTML = (state.questSession.questions || [])
          .map(
            (item, i) => \`<div class="exam-q" data-qi="\${i}">
            <p><b>\${i + 1}.</b> \${escapeHtml(item.q)}</p>
            <div class="exam-opts">
              \${(item.opts || [])
                .map(
                  (opt, j) =>
                    \`<label><input type="radio" name="pq\${i}" value="\${j}" /> \${escapeHtml(opt)}</label>\`
                )
                .join('')}
            </div>
          </div>\`
          )
          .join('')
      }
    } catch (err) {
      if (bodyEl) bodyEl.innerHTML = \`<p class="muted">组卷失败：\${escapeHtml(err.message || err)}</p>\`
      showToast(err.message || '组卷失败')
    }
  }

  function fillQuestForKp(node) {`
  )
  console.log('[ok] startQuizAttempt inserted')
}

// defense submit local fallback — find and replace
mustReplace(
  `      showToast('回复已发布（本地演示）')`,
  `      showToast('请先打开数据库中的帖子')`,
  'forum local toast noop if already gone'
)

fs.writeFileSync(file, t, 'utf8')
console.log('patched', file, 'delta', t.length - orig.length)
