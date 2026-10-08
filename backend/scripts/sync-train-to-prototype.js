/**
 * 将 trainCatalog + kpGuides 同步进前后端 prototype.js 的 TRAIN_PATHS / KP_GUIDES
 * node scripts/sync-train-to-prototype.js
 */
const fs = require('fs')
const path = require('path')
const { CHAPTERS, PATHS } = require('../src/data/trainCatalog')
const { KP_GUIDES } = require('../src/data/kpGuides')

const META = Object.fromEntries(
  PATHS.map((p) => [
    p.id,
    {
      title: p.title,
      badge: p.badge,
      badgeKey: p.id,
      blurb: p.blurb,
      icon: p.icon,
      villagePath: p.id === 'business' || p.id === 'print' ? false : undefined,
      rewardId:
        p.id === 'network'
          ? 'net-boss'
          : p.id === 'hardware'
            ? 'hw-boss'
            : p.id === 'business'
              ? 'biz-boss'
              : 'print-boss'
    }
  ])
)

function buildChapters(pathId) {
  const chapters = CHAPTERS[pathId] || []
  let prevId = null
  return chapters.map((ch) => {
    const nodes = ch.nodes.map((n, i) => {
      const requires = []
      if (i === 0) {
        if (prevId) requires.push(prevId)
      } else {
        requires.push(ch.nodes[i - 1].id)
      }
      const node = { id: n.id, name: n.name, type: n.type, requires }
      prevId = n.id
      return node
    })
    return { id: ch.id, name: ch.name, tier: ch.tier, nodes }
  })
}

function buildTrainPathsObject() {
  const order = ['hardware', 'network', 'business', 'print']
  const obj = {}
  for (const id of order) {
    const m = META[id]
    obj[id] = {
      title: m.title,
      badge: m.badge,
      badgeKey: m.badgeKey,
      rewardId: m.rewardId,
      ...(m.villagePath === false ? { villagePath: false } : {}),
      blurb: m.blurb,
      icon: m.icon,
      chapters: buildChapters(id)
    }
  }
  return obj
}

function replaceConstObject(src, constName, value) {
  const startRe = new RegExp(`const ${constName} = \\{`)
  const start = src.search(startRe)
  if (start < 0) throw new Error(`找不到 const ${constName}`)
  let i = src.indexOf('{', start)
  let depth = 0
  let end = -1
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end < 0) throw new Error(`无法匹配 ${constName} 结束`)
  // 吃掉可能的分号
  let after = end
  if (src[after] === ';') after++
  const serialized = `const ${constName} = ${JSON.stringify(value, null, 2)};`
  return src.slice(0, start) + serialized + src.slice(after)
}

function syncFile(filePath) {
  let src = fs.readFileSync(filePath, 'utf8')
  const trainPaths = buildTrainPathsObject()
  src = replaceConstObject(src, 'TRAIN_PATHS', trainPaths)
  src = replaceConstObject(src, 'KP_GUIDES', KP_GUIDES)
  fs.writeFileSync(filePath, src, 'utf8')
  console.log('synced', filePath)
}

const root = path.join(__dirname, '..', '..')
const targets = [
  path.join(root, 'frontend', 'public', 'prototype.js'),
  path.join(root, 'prototype.js')
]

for (const t of targets) {
  if (fs.existsSync(t)) syncFile(t)
  else console.warn('skip missing', t)
}

// 校验：每个 catalog 节点都应有 guide
const missing = []
for (const [pathId, chapters] of Object.entries(CHAPTERS)) {
  for (const ch of chapters) {
    for (const n of ch.nodes) {
      if (!KP_GUIDES[n.id]) missing.push(`${pathId}/${n.id}`)
    }
  }
}
if (missing.length) {
  console.error('缺少 KP_GUIDES:', missing.join(', '))
  process.exit(1)
}
console.log('KP_GUIDES 覆盖完整，共', Object.keys(KP_GUIDES).length, '关')
