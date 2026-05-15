export const PARSED_QUERY_INTENTS = new Set([
  'area_incident_check',
  'route_incident_check',
  'road_incident_check',
  'nearby_incident_check',
  'trend_summary',
  'report_guidance',
  'unsupported',
])

/**
 * @typedef {Object} ParsedQuery
 * @property {string} intent
 * @property {Record<string, any>=} entities
 * @property {{ area?: string, road?: string, origin?: string, destination?: string, coordinates?: { lat: number, lng: number } }=} spatial
 * @property {{ time?: string }=} temporal
 * @property {string[]=} requiredTools
 * @property {number} confidence
 */

export const normalizeParsedQuery = (value = {}) => {
  const confidence = Number(value?.confidence)
  const intent = PARSED_QUERY_INTENTS.has(String(value?.intent || '').trim())
    ? String(value.intent).trim()
    : 'unsupported'

  return {
    intent,
    entities: value?.entities && typeof value.entities === 'object' ? value.entities : {},
    spatial: value?.spatial && typeof value.spatial === 'object' ? value.spatial : {},
    temporal: value?.temporal && typeof value.temporal === 'object' ? value.temporal : {},
    requiredTools: Array.isArray(value?.requiredTools) ? value.requiredTools.filter(Boolean) : [],
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  }
}

export const isValidParsedQuery = (value = {}) => {
  if (!value || typeof value !== 'object') return false
  if (!PARSED_QUERY_INTENTS.has(String(value.intent || '').trim())) return false
  const confidence = Number(value.confidence)
  return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
}
