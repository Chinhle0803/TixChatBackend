import { getAiProvider } from '../../services/providers/index.js'
import { buildResponsePrompt } from './prompts.js'

const localFallbackAnswer = ({ parsedQuery, verifiedContext }) => {
  const incidents = Array.isArray(verifiedContext?.incidents) ? verifiedContext.incidents : []
  if (incidents.length === 0) {
    return 'Mình chưa có đủ dữ liệu phù hợp để trả lời chắc chắn câu hỏi này.'
  }

  if (parsedQuery?.intent === 'route_incident_check') {
    return `Mình ghi nhận ${incidents.length} sự cố dọc tuyến. Nổi bật nhất là ${incidents[0]?.content || 'một sự cố đang được theo dõi'}.`
  }

  return `Mình ghi nhận ${incidents.length} sự cố liên quan. Nổi bật nhất là ${incidents[0]?.content || 'một sự cố đang được theo dõi'}.`
}

class ResponseGenerator {
  async generate({ parsedQuery, verifiedContext, history = [] }) {
    const historyText = (Array.isArray(history) ? history : [])
      .slice(-4)
      .map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${String(item?.content || '').trim()}`)
      .join('\n')

    try {
      const prompt = buildResponsePrompt({
        parsedQuery,
        verifiedContext,
        historyText,
      })
      const providerResponse = await getAiProvider().generateGroundedAnswer({ prompt })
      return {
        answer: String(providerResponse?.text || '').trim() || localFallbackAnswer({ parsedQuery, verifiedContext }),
        disclaimer: null,
      }
    } catch (error) {
      return {
        answer: localFallbackAnswer({ parsedQuery, verifiedContext }),
        disclaimer: 'AI provider tam thoi khong phan hoi, nen he thong dang dung phan tong hop noi bo.',
      }
    }
  }
}

export default new ResponseGenerator()
