import { getAiProvider } from '../../services/providers/index.js'
import { buildQueryUnderstandingPrompt } from './prompts.js'
import { isValidParsedQuery, normalizeParsedQuery } from './schemas.js'

const URBAN_HINTS = ['su co', 'do thi', 'ha tang', 'giao thong', 'ngap', 'nuoc', 'dien', 'rac', 'cay', 'den duong', 'canh bao', 'bao cao', 'phan anh']

const normalizeForMatch = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[.,/?#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const extractJsonObject = (text = '') => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return null
  return text.slice(start, end + 1)
}

const detectFallbackIntent = (question = '') => {
  const normalized = normalizeForMatch(question)
  if (!normalized) return 'unsupported'
  if (normalized.includes('tu ') && (normalized.includes(' qua ') || normalized.includes(' den '))) return 'route_incident_check'
  if (normalized.includes('duong ') || normalized.includes('pho ')) return 'road_incident_check'
  if (normalized.includes('gan toi')) return 'nearby_incident_check'
  if (normalized.includes('xu huong') || normalized.includes('thong ke')) return 'trend_summary'
  if (normalized.includes('bao cao') || normalized.includes('phan anh')) return 'report_guidance'
  if (URBAN_HINTS.some((hint) => normalized.includes(hint))) return 'area_incident_check'
  return 'unsupported'
}

const detectSpatialFallback = (question = '', intent = '') => {
  const normalized = normalizeForMatch(question)
  if (intent === 'route_incident_check') {
    const matched = normalized.match(/tu\s+(.+?)\s+(?:qua|den|toi)\s+(.+?)(?:\s+co\b|\s+dang\b|\s+toi nay\b|\s+hom nay\b|$)/)
    if (matched) {
      return { origin: matched[1].trim(), destination: matched[2].trim() }
    }
  }

  if (intent === 'road_incident_check') {
    const matched = normalized.match(/(?:duong|pho)\s+(.+?)(?:\s+toi nay\b|\s+hom nay\b|\s+co\b|\s+on khong\b|$)/)
    if (matched) {
      return { road: matched[1].trim() }
    }
  }

  if (intent === 'area_incident_check') {
    const matched = normalized.match(/(?:o|tai|khu vuc)\s+(.+?)(?:\s+co\b|\s+dang\b|\s+hom nay\b|\s+toi nay\b|$)/)
    if (matched) {
      return { area: matched[1].trim() }
    }
  }

  return {}
}

const deriveRequiredTools = (intent = '') => {
  switch (intent) {
    case 'area_incident_check':
      return ['areaResolverTool', 'incidentSearchTool', 'statisticsTool']
    case 'route_incident_check':
      return ['routeTool', 'incidentSearchTool', 'statisticsTool']
    case 'road_incident_check':
      return ['geocodeTool', 'incidentSearchTool', 'statisticsTool']
    case 'nearby_incident_check':
      return ['nearbyTool', 'statisticsTool']
    case 'trend_summary':
      return ['statisticsTool', 'incidentSearchTool']
    case 'report_guidance':
      return ['areaResolverTool', 'incidentSearchTool']
    default:
      return []
  }
}

class QueryUnderstandingLayer {
  async parse({ question, history = [], memory = {}, userLocation = null }) {
    const normalizedHistory = (Array.isArray(history) ? history : [])
      .slice(-4)
      .map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${String(item?.content || '').trim()}`)
      .join('\n')

    try {
      const prompt = buildQueryUnderstandingPrompt({
        question,
        history: normalizedHistory,
        memory,
        userLocation,
      })
      const providerResponse = await getAiProvider().generateGroundedAnswer({ prompt })
      const jsonBlock = extractJsonObject(providerResponse?.text || '')
      if (!jsonBlock) {
        return this.parseFallback(question)
      }

      const parsed = JSON.parse(jsonBlock)
      if (!isValidParsedQuery(parsed)) {
        return this.parseFallback(question)
      }

      const normalized = normalizeParsedQuery(parsed)
      if (!normalized.requiredTools.length) {
        normalized.requiredTools = deriveRequiredTools(normalized.intent)
      }
      return normalized
    } catch {
      return this.parseFallback(question)
    }
  }

  parseFallback(question) {
    const intent = detectFallbackIntent(question)
    return normalizeParsedQuery({
      intent,
      entities: {},
      spatial: detectSpatialFallback(question, intent),
      temporal: {},
      requiredTools: deriveRequiredTools(intent),
      confidence: intent === 'unsupported' ? 0.3 : 0.55,
    })
  }
}

export default new QueryUnderstandingLayer()
