/**
 * 教学资源文本提取：PDF / Word / PPT · 视频与网页链接页面摘要
 */
const fs = require('fs')
const path = require('path')
const { promisify } = require('util')
const readFile = promisify(fs.readFile)

const SNIPPET_MAX = 4500
const LINK_SNIPPET_MAX = 3500
const FETCH_TIMEOUT_MS = 12000

const extractCache = new Map()
const CACHE_TTL_MS = 30 * 60 * 1000

function cacheGet(key) {
  const hit = extractCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    extractCache.delete(key)
    return null
  }
  return hit.value
}

function cacheSet(key, value) {
  extractCache.set(key, { at: Date.now(), value })
}

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(text, max = SNIPPET_MAX) {
  const s = normalizeWhitespace(text)
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

function extOf(name) {
  return path.extname(String(name || '')).toLowerCase()
}

async function parsePdfBuffer(buffer) {
  const pdfModule = require('pdf-parse')
  if (typeof pdfModule === 'function') {
    const data = await pdfModule(buffer)
    return data?.text || ''
  }
  const PDFParse = pdfModule.PDFParse
  if (PDFParse) {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return result?.text || ''
    } finally {
      await parser.destroy().catch(() => {})
    }
  }
  throw new Error('不支持的 pdf-parse 版本')
}

async function parseDocxFile(absPath) {
  const mammoth = require('mammoth')
  const result = await mammoth.extractRawText({ path: absPath })
  return result?.value || ''
}

async function parsePptxFile(absPath) {
  const JSZip = require('jszip')
  const buf = await readFile(absPath)
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] || 0)
      const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0)
      return na - nb
    })
  const chunks = []
  for (const name of names.slice(0, 40)) {
    const xml = await zip.file(name).async('string')
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1])
    const line = texts.join(' ').trim()
    if (line) chunks.push(line)
  }
  return chunks.join('\n')
}

/**
 * 从已上传文件提取可读文本（供 AI 拆关）
 */
async function extractUploadText(absPath, originalName) {
  const ext = extOf(originalName || absPath)
  if (!absPath || !fs.existsSync(absPath)) return { text: '', note: '文件不存在' }

  if (['.txt', '.md', '.markdown', '.csv'].includes(ext)) {
    const raw = await readFile(absPath, 'utf8')
    return { text: clip(raw), note: '纯文本' }
  }

  if (ext === '.pdf') {
    try {
      const buf = await readFile(absPath)
      const text = await parsePdfBuffer(buf)
      return { text: clip(text), note: text ? 'PDF 正文' : 'PDF 未提取到文字（可能为扫描件）' }
    } catch (err) {
      return { text: '', note: `PDF 解析失败：${err.message}` }
    }
  }

  if (ext === '.docx') {
    try {
      const text = await parseDocxFile(absPath)
      return { text: clip(text), note: text ? 'Word(docx) 正文' : 'Word 文档为空' }
    } catch (err) {
      return { text: '', note: `Word 解析失败：${err.message}` }
    }
  }

  if (ext === '.pptx') {
    try {
      const text = await parsePptxFile(absPath)
      return { text: clip(text), note: text ? 'PPT(pptx) 幻灯片文字' : 'PPT 未提取到文字' }
    } catch (err) {
      return { text: '', note: `PPT 解析失败：${err.message}` }
    }
  }

  if (ext === '.doc' || ext === '.ppt') {
    return {
      text: '',
      note: '旧版 .doc/.ppt 暂不支持自动读正文，请另存为 docx/pptx 或 PDF 后上传'
    }
  }

  return { text: '', note: `已上传${ext || '文件'}，未配置正文提取（可补充课程目标或 txt/md 摘要）` }
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function metaContent(html, names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
      'i'
    )
    const m = html.match(re)
    if (m?.[1]) return decodeHtmlEntities(m[1].trim())
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
      'i'
    )
    const m2 = html.match(re2)
    if (m2?.[1]) return decodeHtmlEntities(m2[1].trim())
  }
  return ''
}

function stripHtml(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
}

function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase()
  if (!h || h === 'localhost' || h.endsWith('.local')) return true
  if (/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  if (h === '::1' || h === '0.0.0.0') return true
  return false
}

function parseBilibiliBrief(html) {
  const title =
    metaContent(html, ['og:title', 'twitter:title', 'title']) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
  const desc = metaContent(html, ['og:description', 'description', 'keywords'])
  let extra = ''
  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i)
  if (stateMatch) {
    try {
      const state = JSON.parse(stateMatch[1])
      const v = state?.videoData || state?.epInfo || state?.mediaInfo
      const parts = []
      if (v?.title) parts.push(`标题：${v.title}`)
      if (v?.desc) parts.push(`简介：${v.desc}`)
      if (v?.tname || v?.typename) parts.push(`分区：${v.tname || v.typename}`)
      if (v?.owner?.name) parts.push(`UP主：${v.owner.name}`)
      if (Array.isArray(v?.pages) && v.pages.length) {
        parts.push(
          `分P：${v.pages
            .slice(0, 8)
            .map((p, i) => `${i + 1}.${p.part || p.title || '未命名'}`)
            .join('；')}`
        )
      }
      extra = parts.join('\n')
    } catch {
      /* ignore malformed state */
    }
  }
  const body = clip(stripHtml(html), 1800)
  return clip(
    [title ? `标题：${title}` : '', desc ? `页面描述：${desc}` : '', extra, body ? `页面可见文字摘录：${body}` : '']
      .filter(Boolean)
      .join('\n'),
    LINK_SNIPPET_MAX
  )
}

function parseGenericPageBrief(html, url) {
  const title =
    metaContent(html, ['og:title', 'twitter:title']) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
  const desc = metaContent(html, ['og:description', 'description', 'keywords'])
  const body = clip(stripHtml(html), 2000)
  return clip(
    [
      title ? `标题：${title}` : '',
      desc ? `页面描述：${desc}` : '',
      url ? `链接：${url}` : '',
      body ? `页面可见文字摘录：${body}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    LINK_SNIPPET_MAX
  )
}

/**
 * 抓取外链页面文字（B 站 / 网课页 / 普通网页）
 */
async function fetchLinkPageBrief(url) {
  const raw = String(url || '').trim()
  if (!/^https?:\/\//i.test(raw)) return { text: '', note: '非 http(s) 链接' }

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return { text: '', note: '链接格式无效' }
  }
  if (isPrivateHost(parsed.hostname)) {
    return { text: '', note: '不支持内网/本地链接抓取' }
  }

  const cacheKey = `link:${raw}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(raw, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    })
    if (!res.ok) {
      const out = { text: '', note: `页面抓取失败 HTTP ${res.status}` }
      cacheSet(cacheKey, out)
      return out
    }
    const html = await res.text()
    const host = parsed.hostname.toLowerCase()
    const text =
      host.includes('bilibili.com') || host.includes('b23.tv')
        ? parseBilibiliBrief(html)
        : parseGenericPageBrief(html, raw)
    const out = {
      text,
      note: text ? '已抓取页面标题/描述/可见文字' : '页面未提取到有效文字'
    }
    cacheSet(cacheKey, out)
    return out
  } catch (err) {
    const msg = err.name === 'AbortError' ? '页面抓取超时' : err.message || '页面抓取失败'
    return { text: '', note: msg }
  } finally {
    clearTimeout(timer)
  }
}

async function extractUploadTextCached(absPath, originalName, cacheKey) {
  if (cacheKey) {
    const hit = cacheGet(cacheKey)
    if (hit) return hit
  }
  const out = await extractUploadText(absPath, originalName)
  if (cacheKey) cacheSet(cacheKey, out)
  return out
}

module.exports = {
  SNIPPET_MAX,
  LINK_SNIPPET_MAX,
  clip,
  extractUploadText,
  extractUploadTextCached,
  fetchLinkPageBrief
}
