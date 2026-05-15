import config from '../../config/index.js'

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

const parseGeminiText = (payload) => {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts
    if (!Array.isArray(parts)) continue
    const text = parts
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim()

    if (text) return text
  }

  return ''
}

class GeminiProvider {
  isConfigured() {
    return Boolean(config.geminiApiKey)
  }

  async generateGroundedAnswer({ prompt }) {
    if (!this.isConfigured()) {
      const error = new Error('Gemini provider is not configured')
      error.code = 'AI_PROVIDER_NOT_CONFIGURED'
      throw error
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs)

    try {
      const response = await fetch(
        `${GEMINI_API_BASE_URL}/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              topP: 0.8,
              maxOutputTokens: 500,
            },
          }),
          signal: controller.signal,
        }
      )

      if (!response.ok) {
        const rawError = await response.text()
        const error = new Error(`Gemini request failed (${response.status})`)
        error.code = 'AI_PROVIDER_REQUEST_FAILED'
        error.providerMessage = rawError
        throw error
      }

      const payload = await response.json()
      const text = parseGeminiText(payload)
      if (!text) {
        const error = new Error('Gemini returned an empty response')
        error.code = 'AI_PROVIDER_EMPTY_RESPONSE'
        throw error
      }

      return { text }
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Gemini request timed out')
        timeoutError.code = 'AI_PROVIDER_TIMEOUT'
        throw timeoutError
      }

      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

export default new GeminiProvider()
