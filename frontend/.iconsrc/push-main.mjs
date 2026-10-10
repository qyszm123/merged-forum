/**
 * 在 git push 不可用时，用 GitHub API 把本地 main 的最新提交内容推上去。
 *
 * 背景：这台机器到 github.com:443 的连接不稳定/不通，但 api.github.com 稳定。
 * 做法：读取本地 HEAD 与远端 main 的差异 → 为每个变更文件建 blob →
 *       带 base_tree 建 tree → 建 commit → 更新 main ref。
 *
 * 用法：
 *   $env:GH_TOKEN = (gh auth token)
 *   node frontend/.iconsrc/push-main.mjs           # 实际推送
 *   node frontend/.iconsrc/push-main.mjs --dry-run # 只看会推哪些文件
 *
 * 注意：API 推上去的 commit 与本地 HEAD 内容相同但 SHA 不同。
 *       网络恢复后用 `git fetch origin && git reset --hard origin/main` 对齐即可（内容不会丢）。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TOKEN = process.env.GH_TOKEN
if (!TOKEN) {
  console.error('缺少 GH_TOKEN。先执行：$env:GH_TOKEN = (gh auth token)')
  process.exit(1)
}

const REPO = process.env.REPO || 'qyszm123/merged-forum'
const BRANCH = process.env.BRANCH || 'main'
const DRY = process.argv.includes('--dry-run')
// --base <ref>：显式指定比较基准。API 推上去的提交本地没有，
// 若又找不到 tree 相同的本地提交（例如某文件换行符不一致），就用它兜底。
const baseArgIdx = process.argv.indexOf('--base')
const BASE_ARG = baseArgIdx > -1 ? process.argv[baseArgIdx + 1] : null
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\//, '')
const API = 'https://api.github.com'

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

/**
 * git 在 Windows 上按 autocrlf 存 LF，而工作区文件可能是 CRLF
 * （PowerShell 的 Add-Content/Set-Content 默认写 CRLF）。
 * 直接上传工作区文件会导致 blob 与 git 对象不一致，所以这里统一归一成 LF。
 * 二进制文件原样上传。
 */
function normalizeContent(buf) {
  const probe = buf.subarray(0, 8000)
  if (probe.includes(0)) return buf // 含 NUL，按二进制处理
  return Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
}

async function api(path, init = {}) {
  const MAX = 4
  let lastErr
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      const res = await fetch(API + path, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          ...(init.headers || {})
        },
        signal: AbortSignal.timeout(90000)
      })
      const text = await res.text()
      let body = null
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = { raw: text.slice(0, 300) }
      }
      // 5xx 视为可重试
      if (res.status >= 500 && attempt < MAX) {
        lastErr = new Error(`HTTP ${res.status}`)
        console.log(`   ↻ ${path} 返回 ${res.status}，${attempt}/${MAX} 重试…`)
        await new Promise((r) => setTimeout(r, 2000 * attempt))
        continue
      }
      return { ok: res.ok, status: res.status, body }
    } catch (e) {
      // 这台机器到 GitHub 的连接会中途断开，必须重试
      lastErr = e
      if (attempt < MAX) {
        console.log(`   ↻ ${path} 网络中断（${e.cause?.code || e.message}），${attempt}/${MAX} 重试…`)
        await new Promise((r) => setTimeout(r, 2000 * attempt))
        continue
      }
    }
  }
  return { ok: false, status: 0, body: { message: `网络失败: ${lastErr?.cause?.code || lastErr?.message}` } }
}

/* ---- 1. 本地 HEAD ---- */
const head = git('rev-parse', 'HEAD')
const subject = git('log', '-1', '--pretty=%s')

/* ---- 2. 远端 tip ---- */
const refRes = await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`)
if (!refRes.ok) {
  console.error(`❌ 读取远端 ${BRANCH} 失败: ${refRes.body?.message}`)
  process.exit(1)
}
const remoteSha = refRes.body.object.sha

if (remoteSha === head) {
  console.log('✓ 远端与本地已一致，无需推送')
  process.exit(0)
}

/* ---- 3. 远端 commit 对象 + 选定比较基准 ---- */
const commitRes = await api(`/repos/${REPO}/git/commits/${remoteSha}`)
if (!commitRes.ok) {
  console.error(`❌ 读取远端提交 ${remoteSha.slice(0, 8)} 失败: ${commitRes.body?.message}`)
  process.exit(1)
}
const baseTree = commitRes.body.tree.sha

// API 推上去的提交在本地并不存在，git diff 会失败。
// 优先找一个 tree 与远端完全一致的本地提交；找不到则用 --base 指定的基准。
let base = remoteSha
try {
  git('cat-file', '-e', remoteSha)
} catch {
  if (BASE_ARG) {
    git('cat-file', '-e', BASE_ARG) // 不存在会抛错
    base = BASE_ARG
    console.log(`ℹ 本地缺少远端提交对象，按 --base ${BASE_ARG} 作为比较基准\n`)
  } else {
    const candidates = git('log', '--pretty=%H', '-100').split('\n').filter(Boolean)
    base = candidates.find((sha) => {
      try {
        return git('rev-parse', `${sha}^{tree}`) === baseTree
      } catch {
        return false
      }
    })
    if (!base) {
      console.error(`❌ 本地既没有远端提交 ${remoteSha.slice(0, 8)}，也没有 tree 完全一致的提交。`)
      console.error('   常见原因：某文件工作区换行符与 git 对象不一致。')
      console.error('   可显式指定基准：node push-main.mjs --base <本地提交>')
      process.exit(1)
    }
    console.log(`ℹ 本地缺少远端提交对象，改用 tree 相同的 ${base.slice(0, 8)} 作为比较基准\n`)
  }
}

/* ---- 4. 差异 ---- */
let diff
try {
  diff = git('diff', '--name-status', base, head)
} catch {
  console.error(`❌ 比较 ${base.slice(0, 8)}..${head.slice(0, 8)} 失败`)
  process.exit(1)
}

if (!diff) {
  console.log('✓ 内容无差异')
  process.exit(0)
}

const changes = diff.split('\n').map((line) => {
  const [status, ...rest] = line.split('\t')
  return { status: status[0], path: rest.join('\t') }
})

console.log(`本地 HEAD  : ${head.slice(0, 8)}  ${subject}`)
console.log(`远端 ${BRANCH} : ${remoteSha.slice(0, 8)}`)
console.log(`\n将推送 ${changes.length} 个文件变更：`)
for (const c of changes) console.log(`  ${c.status}  ${c.path}`)

if (DRY) {
  console.log('\n(--dry-run，未实际推送)')
  process.exit(0)
}

/* ---- 5. 建 blob ---- */
const tree = []
for (const c of changes) {
  if (c.status === 'D') {
    tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null }) // 删除
    continue
  }
  const abs = join(ROOT, c.path)
  if (!existsSync(abs)) {
    console.error(`❌ 本地找不到 ${c.path}`)
    process.exit(1)
  }
  const blob = await api(`/repos/${REPO}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({
      content: normalizeContent(readFileSync(abs)).toString('base64'),
      encoding: 'base64'
    })
  })
  if (!blob.ok) {
    console.error(`❌ 上传 ${c.path} 失败: ${blob.body?.message}`)
    process.exit(1)
  }
  tree.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.body.sha })
}
console.log(`\n已上传 ${tree.length} 个 blob`)

/* ---- 5. tree / commit / ref ---- */
const treeRes = await api(`/repos/${REPO}/git/trees`, {
  method: 'POST',
  body: JSON.stringify({ base_tree: baseTree, tree })
})
if (!treeRes.ok) {
  console.error('❌ 创建 tree 失败: ' + treeRes.body?.message)
  process.exit(1)
}

const newCommit = await api(`/repos/${REPO}/git/commits`, {
  method: 'POST',
  body: JSON.stringify({ message: subject, tree: treeRes.body.sha, parents: [remoteSha] })
})
if (!newCommit.ok) {
  console.error('❌ 创建 commit 失败: ' + newCommit.body?.message)
  process.exit(1)
}

const upd = await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
  method: 'PATCH',
  body: JSON.stringify({ sha: newCommit.body.sha, force: false })
})
if (!upd.ok) {
  console.error('❌ 更新远端分支失败: ' + upd.body?.message)
  process.exit(1)
}

console.log(`\n🎉 已推送到 ${BRANCH}：${newCommit.body.sha.slice(0, 8)}`)
console.log(`   网络恢复后用以下命令对齐本地（内容一致，不会丢改动）：`)
console.log(`   git fetch origin && git reset --hard origin/${BRANCH}`)
