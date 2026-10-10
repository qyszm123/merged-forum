/**
 * 把 frontend/dist 发布到 GitHub Pages。
 *
 * 为什么不用 git push：这台机器到 github.com:443 的连接不稳定（时通时断），
 * 而 api.github.com 稳定可用。所以走 Git Data API 直接建 blob → tree → commit → ref。
 * 好处是整次发布是「一个原子提交」，且不需要 workflow 权限。
 *
 * 用法：
 *   $env:GH_TOKEN = (gh auth token)
 *   node frontend/.iconsrc/deploy-pages.mjs
 *
 * 环境变量：
 *   GH_TOKEN   必填，GitHub token（需 repo 权限）
 *   REPO       默认 qyszm123/merged-forum
 *   BRANCH     默认 gh-pages
 *   SITE_PATH  默认 /merged-forum/
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, posix } from 'node:path'

const TOKEN = process.env.GH_TOKEN
if (!TOKEN) {
  console.error('缺少 GH_TOKEN。先执行：$env:GH_TOKEN = (gh auth token)')
  process.exit(1)
}

const REPO = process.env.REPO || 'qyszm123/merged-forum'
const BRANCH = process.env.BRANCH || 'gh-pages'
const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\//, '')
const API = 'https://api.github.com'

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`找不到 ${DIST}index.html，请先 npm run build`)
  process.exit(1)
}

async function api(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(60000)
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text.slice(0, 300) }
  }
  return { ok: res.ok, status: res.status, body }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/* ---------- 0. 准备产物：SPA 深链回退 + 关闭 Jekyll ---------- */
const indexHtml = readFileSync(join(DIST, 'index.html'))
writeFileSync(join(DIST, '404.html'), indexHtml) // Pages 找不到路径时回退到 SPA
writeFileSync(join(DIST, '.nojekyll'), '') // 防止 Jekyll 处理产物

const files = walk(DIST)
console.log(`待发布 ${files.length} 个文件（含 404.html / .nojekyll）`)

/* ---------- 1. 上传 blob ---------- */
const tree = []
for (const file of files) {
  const rel = relative(DIST, file).split('\\').join(posix.sep)
  const content = readFileSync(file).toString('base64')
  const { ok, body } = await api(`/repos/${REPO}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content, encoding: 'base64' })
  })
  if (!ok) {
    console.error(`❌ 上传 ${rel} 失败: ${body?.message}`)
    process.exit(1)
  }
  tree.push({ path: rel, mode: '100644', type: 'blob', sha: body.sha })
  console.log(`  ↑ ${rel}`)
}

/* ---------- 2. 建 tree（不带 base_tree → 干净替换整棵目录树） ---------- */
const treeRes = await api(`/repos/${REPO}/git/trees`, {
  method: 'POST',
  body: JSON.stringify({ tree })
})
if (!treeRes.ok) {
  console.error('❌ 创建 tree 失败: ' + treeRes.body?.message)
  process.exit(1)
}

/* ---------- 3. 取分支当前 tip 作为父提交（不存在则是首个提交） ---------- */
const refRes = await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`)
const parentSha = refRes.ok ? refRes.body.object.sha : null
console.log(parentSha ? `父提交: ${parentSha.slice(0, 8)}` : '首次发布（无父提交）')

/* ---------- 4. 建 commit ---------- */
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
const commitRes = await api(`/repos/${REPO}/git/commits`, {
  method: 'POST',
  body: JSON.stringify({
    message: `deploy: static site @ ${stamp}`,
    tree: treeRes.body.sha,
    parents: parentSha ? [parentSha] : []
  })
})
if (!commitRes.ok) {
  console.error('❌ 创建 commit 失败: ' + commitRes.body?.message)
  process.exit(1)
}
const commitSha = commitRes.body.sha
console.log(`提交: ${commitSha.slice(0, 8)}`)

/* ---------- 5. 更新 / 创建 ref ---------- */
if (parentSha) {
  const r = await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitSha, force: true })
  })
  if (!r.ok) {
    console.error('❌ 更新分支失败: ' + r.body?.message)
    process.exit(1)
  }
} else {
  const r = await api(`/repos/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commitSha })
  })
  if (!r.ok) {
    console.error('❌ 创建分支失败: ' + r.body?.message)
    process.exit(1)
  }
}
console.log(`分支 ${BRANCH} → ${commitSha.slice(0, 8)}`)

/* ---------- 6. 启用 / 校正 GitHub Pages ---------- */
// 注意：仓库转为公开时 GitHub 可能已自动启用 Pages，此时 POST 会返回 409
// "GitHub Pages is already enabled."，属于正常情况，不应视为失败。
const desired = { source: { branch: BRANCH, path: '/' } }
const existing = await api(`/repos/${REPO}/pages`)

if (existing.ok) {
  const r = await api(`/repos/${REPO}/pages`, { method: 'PUT', body: JSON.stringify(desired) })
  console.log(r.ok ? '✓ Pages 源已校正为 gh-pages' : '⚠ Pages 更新失败: ' + r.body?.message)
} else {
  const r = await api(`/repos/${REPO}/pages`, { method: 'POST', body: JSON.stringify(desired) })
  if (r.ok) {
    console.log('✓ Pages 已启用（gh-pages 分支）')
  } else if (/already enabled/i.test(r.body?.message || '')) {
    console.log('✓ Pages 已处于启用状态')
  } else {
    console.error('❌ 启用 Pages 失败: ' + r.body?.message)
    console.error('   （私有仓库需要 Pro 套餐；公开仓库免费可用）')
    process.exit(1)
  }
}

/* ---------- 7. 输出站点地址与当前构建状态 ---------- */
const [owner, name] = REPO.split('/')
const isUserSite = name.toLowerCase() === `${owner.toLowerCase()}.github.io`
const url = isUserSite
  ? `https://${owner.toLowerCase()}.github.io/`
  : `https://${owner.toLowerCase()}.github.io/${name}/`

const status = await api(`/repos/${REPO}/pages`)
console.log(`\n🎉 部署完成`)
console.log(`   站点地址：${url}`)
console.log(`   Pages 状态：${status.body?.status || '未知'}（首次构建通常需 1-2 分钟）`)

