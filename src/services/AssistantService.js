import assistantOrchestrator from '../assistant/AssistantOrchestrator.js'
import postRepository from '../repositories/PostRepository.js'
import { formatVietnameseAddress } from '../utils/urbanRegion.js'

const DEFAULT_SUGGESTIONS = [
  'Khu vực gần tôi đang có sự cố gì?',
  'Có báo cáo ngập nước mới nào không?',
  'Điểm nóng giao thông hôm nay là ở đâu?',
  'Tôi nên mở bài báo cáo nào để theo dõi tiếp?',
]

const CATEGORY_LABELS = {
  electricity: 'điện',
  water: 'nước',
  traffic: 'giao thông',
  tree: 'cây xanh',
  flood: 'ngập nước',
  waste: 'rác thải',
  street_light: 'đèn đường',
  construction: 'công trình',
  other: 'sự cố',
}

class AssistantService {
  async getUrbanSuggestions() {
    try {
      const result = await postRepository.list({ limit: 6 })
      const recentPosts = Array.isArray(result?.posts) ? result.posts : []
      const dynamic = recentPosts.slice(0, 1).map((post) => {
        const location = formatVietnameseAddress(post?.location || {})
        const categoryLabel = CATEGORY_LABELS[String(post?.category || '').trim()] || 'sự cố'
        return `Có cập nhật mới nào về ${categoryLabel} ở ${location}?`
      })

      return [...new Set([...DEFAULT_SUGGESTIONS, ...dynamic])].slice(0, 6)
    } catch {
      return DEFAULT_SUGGESTIONS
    }
  }

  async answerUrbanQuestion(userId, payload = {}) {
    return assistantOrchestrator.run({
      userId,
      question: payload.question,
      history: Array.isArray(payload.history) ? payload.history : [],
      location: payload.location || null,
      scope: payload.scope || '',
      radiusKm: payload.radiusKm,
      requestId: payload.requestId || `assistant-${Date.now()}`,
    })
  }
}

export default new AssistantService()
