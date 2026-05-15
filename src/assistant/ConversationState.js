import config from '../config/index.js'
import redisCache from '../services/RedisCacheService.js'

const buildStateKey = (userId) => `assistant:state:${String(userId || 'anonymous')}`
const inMemoryState = new Map()

class ConversationState {
  async load(userId) {
    if (!userId) return {}
    const state = await redisCache.getJson(buildStateKey(userId))
    if (state && typeof state === 'object') {
      inMemoryState.set(buildStateKey(userId), state)
      return state
    }

    const fallback = inMemoryState.get(buildStateKey(userId))
    return fallback && typeof fallback === 'object' ? fallback : {}
  }

  async save(userId, state = {}) {
    if (!userId) return false
    const payload = {
      ...state,
      updatedAt: new Date().toISOString(),
    }
    inMemoryState.set(buildStateKey(userId), payload)
    return redisCache.setJson(
      buildStateKey(userId),
      payload,
      config.assistantMemoryTtlSeconds
    )
  }
}

export default new ConversationState()
