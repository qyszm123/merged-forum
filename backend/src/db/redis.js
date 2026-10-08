const Redis = require('ioredis')
const config = require('../config')

let redis = null
let memoryStore = new Map()

function getRedis() {
  if (!config.redis.enabled) return null
  if (redis) return redis
  redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false
  })
  redis.on('error', (err) => {
    console.warn('[redis]', err.message)
  })
  return redis
}

async function cacheGet(key) {
  const client = getRedis()
  if (!client) return memoryStore.get(key) ?? null
  try {
    if (client.status !== 'ready') await client.connect().catch(() => {})
    const val = await client.get(key)
    return val ? JSON.parse(val) : null
  } catch {
    return memoryStore.get(key) ?? null
  }
}

async function cacheSet(key, value, ttlSec = 60) {
  const payload = JSON.stringify(value)
  memoryStore.set(key, value)
  setTimeout(() => memoryStore.delete(key), ttlSec * 1000).unref?.()
  const client = getRedis()
  if (!client) return
  try {
    if (client.status !== 'ready') await client.connect().catch(() => {})
    await client.set(key, payload, 'EX', ttlSec)
  } catch {
    /* ignore */
  }
}

async function cacheDel(key) {
  memoryStore.delete(key)
  const client = getRedis()
  if (!client) return
  try {
    await client.del(key)
  } catch {
    /* ignore */
  }
}

module.exports = { getRedis, cacheGet, cacheSet, cacheDel }
