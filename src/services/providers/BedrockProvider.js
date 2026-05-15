import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import config from '../../config/index.js'

const getBedrockRuntimeBaseUrl = () =>
  `https://bedrock-runtime.${encodeURIComponent(config.awsBedrockRegion)}.amazonaws.com`

const toBedrockContentText = (content = []) => {
  if (!Array.isArray(content)) return ''

  return content
    .map((item) => {
      if (typeof item?.text === 'string') return item.text
      return ''
    })
    .join('\n')
    .trim()
}

const createClient = () => {
  const options = {
    region: config.awsBedrockRegion,
  }

  if (config.awsAccessKeyId && config.awsSecretAccessKey) {
    options.credentials = {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    }
  }

  return new BedrockRuntimeClient(options)
}

class BedrockProvider {
  constructor() {
    this.client = createClient()
  }

  isConfigured() {
    return Boolean(config.awsBedrockModelId) && (Boolean(config.awsBearerTokenBedrock) || Boolean(config.awsAccessKeyId && config.awsSecretAccessKey))
  }

  shouldUseBearerToken() {
    return Boolean(config.awsBearerTokenBedrock)
  }

  async generateGroundedAnswer({ prompt }) {
    if (!this.isConfigured()) {
      const error = new Error('Bedrock provider is not configured')
      error.code = 'AI_PROVIDER_NOT_CONFIGURED'
      throw error
    }

    if (this.shouldUseBearerToken()) {
      return this.generateWithBearerToken({ prompt })
    }

    return this.generateWithAwsCredentials({ prompt })
  }

  buildRequestBody(prompt) {
    return {
      system: [
        {
          text: 'You are TixChat Urban Assistant. Follow the prompt strictly and answer in concise Vietnamese.',
        },
      ],
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: 500,
        temperature: 0.2,
        topP: 0.8,
      },
    }
  }

  async generateWithBearerToken({ prompt }) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs)

    try {
      const response = await fetch(
        `${getBedrockRuntimeBaseUrl()}/model/${encodeURIComponent(config.awsBedrockModelId)}/converse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${config.awsBearerTokenBedrock}`,
          },
          body: JSON.stringify(this.buildRequestBody(prompt)),
          signal: controller.signal,
        }
      )

      if (!response.ok) {
        const rawError = await response.text()
        const error = new Error(`Bedrock request failed (${response.status})`)
        error.code = 'AI_PROVIDER_REQUEST_FAILED'
        error.providerMessage = rawError
        throw error
      }

      const payload = await response.json()
      const text = toBedrockContentText(payload?.output?.message?.content)
      if (!text) {
        const error = new Error('Bedrock returned an empty response')
        error.code = 'AI_PROVIDER_EMPTY_RESPONSE'
        throw error
      }

      return { text }
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Bedrock request timed out')
        timeoutError.code = 'AI_PROVIDER_TIMEOUT'
        throw timeoutError
      }

      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  async generateWithAwsCredentials({ prompt }) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs)

    try {
      const command = new ConverseCommand({
        modelId: config.awsBedrockModelId,
        ...this.buildRequestBody(prompt),
      })

      const response = await this.client.send(command, {
        abortSignal: controller.signal,
      })

      const text = toBedrockContentText(response?.output?.message?.content)
      if (!text) {
        const error = new Error('Bedrock returned an empty response')
        error.code = 'AI_PROVIDER_EMPTY_RESPONSE'
        throw error
      }

      return { text }
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Bedrock request timed out')
        timeoutError.code = 'AI_PROVIDER_TIMEOUT'
        throw timeoutError
      }

      if (
        error?.name === 'ValidationException' ||
        error?.name === 'AccessDeniedException' ||
        error?.name === 'ResourceNotFoundException' ||
        error?.name === 'ThrottlingException'
      ) {
        const requestError = new Error(`Bedrock request failed (${error.name})`)
        requestError.code = 'AI_PROVIDER_REQUEST_FAILED'
        requestError.providerMessage = error?.message || error?.name
        throw requestError
      }

      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

export default new BedrockProvider()
