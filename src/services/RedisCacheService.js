import { createClient } from 'redis'
import config from '../config/index.js'

const DEFAULT_RETRY_DELAY_MS = 30000

const getErrorMessage = (error) => (
  error?.message ||
  error?.code ||
  error?.cause?.message ||
  error?.cause?.code ||
  error?.constructor?.name ||
  'Unknown Redis error'
)

export const stableSerialize = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

class RedisCacheService {
  constructor() {
    this.client = null
    this.connecting = null
    this.isReady = false
    this.lastConnectFailureAt = 0
  }

  isEnabled() {
    return Boolean(config.redisEnabled)
  }

  getKey(key) {
    return `${config.redisKeyPrefix}:${key}`
  }

  async connect() {
    if (!this.isEnabled()) return null
    if (this.isReady && this.client) return this.client
    if (this.connecting) return this.connecting

    const now = Date.now()
    if (this.lastConnectFailureAt && now - this.lastConnectFailureAt < DEFAULT_RETRY_DELAY_MS) {
      return null
    }

    this.connecting = this.createConnection()
      .catch((error) => {
        this.lastConnectFailureAt = Date.now()
        console.warn(`Redis cache unavailable: ${getErrorMessage(error)}`)
        return null
      })
      .finally(() => {
        this.connecting = null
      })

    return this.connecting
  }

  async createConnection() {
    const client = createClient({
      url: config.redisUrl,
      socket: {
        connectTimeout: config.redisConnectTimeoutMs,
        reconnectStrategy: false,
      },
    })

    client.on('ready', () => {
      this.isReady = true
      console.log('Redis cache connected')
    })

    client.on('end', () => {
      this.isReady = false
    })

    client.on('error', (error) => {
      this.isReady = false
      console.warn(`Redis cache error: ${getErrorMessage(error)}`)
    })

    await client.connect()
    this.client = client
    return client
  }

  async getClient() {
    const client = await this.connect()
    if (!client || !this.isReady) return null
    return client
  }

  async getJson(key) {
    try {
      const client = await this.getClient()
      if (!client) return null

      const rawValue = await client.get(this.getKey(key))
      if (!rawValue) return null

      return JSON.parse(rawValue)
    } catch (error) {
      console.warn(`Redis cache get failed for ${key}: ${getErrorMessage(error)}`)
      return null
    }
  }

  async setJson(key, value, ttlSeconds = config.redisDefaultTtlSeconds) {
    try {
      const client = await this.getClient()
      if (!client) return false

      const ttl = Math.max(1, Number(ttlSeconds) || config.redisDefaultTtlSeconds)
      await client.set(this.getKey(key), JSON.stringify(value), { EX: ttl })
      return true
    } catch (error) {
      console.warn(`Redis cache set failed for ${key}: ${getErrorMessage(error)}`)
      return false
    }
  }

  async remember(key, ttlSeconds, loader) {
    const cachedValue = await this.getJson(key)
    if (cachedValue !== null) return cachedValue

    const freshValue = await loader()
    await this.setJson(key, freshValue, ttlSeconds)
    return freshValue
  }

  async del(key) {
    try {
      const client = await this.getClient()
      if (!client) return false

      await client.del(this.getKey(key))
      return true
    } catch (error) {
      console.warn(`Redis cache delete failed for ${key}: ${getErrorMessage(error)}`)
      return false
    }
  }

  async delPattern(pattern) {
    try {
      const client = await this.getClient()
      if (!client) return false

      const keys = []
      for await (const key of client.scanIterator({
        MATCH: this.getKey(pattern),
        COUNT: 100,
      })) {
        keys.push(key)
        if (keys.length >= 100) {
          await client.del(keys.splice(0, keys.length))
        }
      }

      if (keys.length > 0) {
        await client.del(keys)
      }
      return true
    } catch (error) {
      console.warn(`Redis cache delete pattern failed for ${pattern}: ${getErrorMessage(error)}`)
      return false
    }
  }

  async disconnect() {
    if (!this.client) return

    try {
      await this.client.quit()
    } catch {
      this.client.disconnect()
    } finally {
      this.client = null
      this.isReady = false
    }
  }
}

export default new RedisCacheService()
