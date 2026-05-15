import config from '../../config/index.js'

class VectorIndexAdapter {
  isEnabled() {
    return Boolean(config.opensearchVectorEndpoint && config.embeddingProvider && config.embeddingModel)
  }

  async search() {
    return {
      enabled: this.isEnabled(),
      items: [],
    }
  }
}

export default new VectorIndexAdapter()
