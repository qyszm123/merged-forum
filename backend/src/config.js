const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const backendRoot = path.join(__dirname, '..')
const repoRoot = path.resolve(backendRoot, '..', '..')

/** 本地库等配置 */
dotenv.config({ path: path.join(backendRoot, '.env') })

/**
 * DeepSeek：优先用主系统（慧听 / DeepTutor）同一把 key，避免科创广场单独维护。
 * 后加载会覆盖本地 .env 中的同名 DEEPSEEK_*。
 */
const MAIN_DEEPSEEK_ENV_CANDIDATES = [
  path.join(repoRoot, 'speech2note-bracket-multimode-backend-deeptutor', '.env.development'),
  path.join(repoRoot, 'speech2note-bracket-multimode-backend-deeptutor', '.env'),
  path.join(repoRoot, 'OpenMAIC', '.env.local'),
  path.join(repoRoot, 'speech2note-v3-backend', '.env.development'),
  path.join(repoRoot, 'speech2note-v3-backend', '.env')
]

const DEEPSEEK_ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_API_URL',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_HOME_AI_MODEL',
  'DEEPSEEK_TIMEOUT',
  'DEEPSEEK_HOME_AI_TIMEOUT'
]

function loadDeepSeekFromMain() {
  for (const envPath of MAIN_DEEPSEEK_ENV_CANDIDATES) {
    if (!fs.existsSync(envPath)) continue
    let parsed
    try {
      parsed = dotenv.parse(fs.readFileSync(envPath))
    } catch {
      continue
    }
    const key = String(parsed.DEEPSEEK_API_KEY || '').trim()
    if (!key) continue
    for (const k of DEEPSEEK_ENV_KEYS) {
      if (parsed[k] != null && String(parsed[k]).trim() !== '') {
        process.env[k] = String(parsed[k]).trim()
      }
    }
    const rel = path.relative(repoRoot, envPath).replace(/\\/g, '/')
    console.log(`[config] DeepSeek 使用主系统密钥: ${rel}`)
    return rel
  }
  if (process.env.DEEPSEEK_API_KEY) {
    console.log('[config] DeepSeek 使用 kcsquare/backend/.env')
  } else {
    console.warn('[config] 未找到 DEEPSEEK_API_KEY（主系统 .env 与本地均无）')
  }
  return null
}

loadDeepSeekFromMain()

const WEAK_JWT = new Set(['', 'dev-secret', 'change-me-kcsquare-dev-secret'])

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3100),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'kcsquare'
  },
  redis: {
    enabled: String(process.env.REDIS_ENABLED || 'false') === 'true',
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  },
  /** 与主系统 speech2note DeepSeek 配置对齐 */
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions',
    /** 关卡讲解优先用主系统学伴模型（Flash），与笔记模型可分开 */
    model: process.env.DEEPSEEK_HOME_AI_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    timeoutMs: Number(process.env.DEEPSEEK_HOME_AI_TIMEOUT || process.env.DEEPSEEK_TIMEOUT || 60000)
  }
}

if (WEAK_JWT.has(String(config.jwt.secret || '').trim())) {
  // 演示阶段仅提示，不拦截启动
  console.warn('[config] JWT_SECRET 仍为开发默认值（演示开放模式可忽略）')
}

module.exports = config
