/**
 * DeepSeek 调用（与主系统 speech2note deepseek 配置对齐）
 * OpenAI 兼容 /chat/completions
 */
const config = require('../config')

function isConfigured() {
  return !!(config.deepseek.apiKey && String(config.deepseek.apiKey).trim())
}

function isRetryable(err, status) {
  if (status === 429 || status === 502 || status === 503 || status === 504) return true
  const msg = String(err?.message || '').toLowerCase()
  return (
    msg.includes('timeout') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('返回格式异常') ||
    msg.includes('empty content')
  )
}

/** 兼容 string / 多段 content / reasoning 模型空 content */
function extractMessageText(message) {
  if (!message || typeof message !== 'object') return ''
  const c = message.content
  if (typeof c === 'string' && c.trim()) return c.trim()
  if (Array.isArray(c)) {
    const parts = c
      .map((p) => {
        if (typeof p === 'string') return p
        if (p && typeof p.text === 'string') return p.text
        if (p && typeof p.content === 'string') return p.content
        return ''
      })
      .filter((s) => String(s).trim())
    if (parts.length) return parts.join('\n').trim()
  }
  for (const key of ['reasoning_content', 'reasoning', 'text', 'output_text']) {
    const v = message[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/**
 * @param {{ role: string, content: string }[]} messages
 * @param {{ maxTokens?: number, temperature?: number, timeoutMs?: number }} [options]
 * @returns {Promise<{ text: string, model: string }>}
 */
async function chat(messages, options = {}) {
  if (!isConfigured()) {
    throw new Error('未配置 DEEPSEEK_API_KEY')
  }
  const model = options.model || config.deepseek.model
  const maxTokens = options.maxTokens ?? 800
  const temperature = options.temperature ?? 0.4
  const timeoutMs = options.timeoutMs ?? config.deepseek.timeoutMs
  const maxRetries = options.maxRetries ?? 2

  let lastErr
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(config.deepseek.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.deepseek.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature
        }),
        signal: ctrl.signal
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data?.error?.message || data?.message || `HTTP ${res.status}`
        const err = new Error(msg)
        if (isRetryable(err, res.status) && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 800 * attempt))
          lastErr = err
          continue
        }
        throw new Error(`DeepSeek 调用失败: ${msg}`)
      }
      const message = data?.choices?.[0]?.message
      const text = extractMessageText(message)
      if (!text) {
        const err = new Error('DeepSeek 返回格式异常')
        console.warn(
          '[deepseek] empty content',
          JSON.stringify({
            model,
            finish: data?.choices?.[0]?.finish_reason,
            keys: message ? Object.keys(message) : [],
            preview: JSON.stringify(message || data?.choices?.[0] || {}).slice(0, 400)
          })
        )
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 800 * attempt))
          lastErr = err
          continue
        }
        throw err
      }
      return { text: String(text).trim(), model }
    } catch (err) {
      lastErr = err
      if (err.name === 'AbortError') {
        throw new Error('DeepSeek 请求超时')
      }
      if (isRetryable(err) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 800 * attempt))
        continue
      }
      throw err instanceof Error ? err : new Error(String(err))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr || new Error('DeepSeek 调用失败')
}

module.exports = { chat, isConfigured, extractMessageText }
