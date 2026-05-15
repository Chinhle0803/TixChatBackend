import config from '../../config/index.js'
import bedrockProvider from './BedrockProvider.js'
import geminiProvider from './GeminiProvider.js'

const providers = {
  bedrock: bedrockProvider,
  gemini: geminiProvider,
}

export const getAiProvider = () => {
  const providerKey = String(config.aiProvider || 'gemini').trim().toLowerCase()
  return providers[providerKey] || geminiProvider
}

export default getAiProvider
