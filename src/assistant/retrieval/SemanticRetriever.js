import synonymNormalizer from './SynonymNormalizer.js'

class SemanticRetriever {
  buildSearchTerms(query = '') {
    return synonymNormalizer.expand(query)
  }
}

export default new SemanticRetriever()
