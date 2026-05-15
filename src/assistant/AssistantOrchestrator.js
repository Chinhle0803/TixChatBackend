import conversationState from './ConversationState.js'
import queryRewriter from './query-understanding/QueryRewriter.js'
import queryUnderstandingLayer from './query-understanding/QueryUnderstandingLayer.js'
import aiPlanner from './planning/AIPlanner.js'
import ToolExecutor from './execution/ToolExecutor.js'
import toolRegistry from './execution/toolRegistry.js'
import contextAssembler from './context/ContextAssembler.js'
import responseGenerator from './response/ResponseGenerator.js'
import locationResolutionService from '../services/LocationResolutionService.js'

const toolExecutor = new ToolExecutor(toolRegistry)

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

const buildUnsupportedResponse = () => ({
  answer:
    'Tro ly nay hien chi ho tro du lieu su co do thi va phan anh cong dong trong TixChat. Ban co the hoi ve giao thong, ngap nuoc, ha tang, canh bao khu vuc hoac cach tao bao cao moi.',
  sources: [],
  relatedPosts: [],
  showIncidentCards: false,
  actions: [
    { label: 'Mo bang tin', target: '/urban', kind: 'link' },
    { label: 'Mo ban do', target: '/urban/map', kind: 'link' },
  ],
  disclaimer: null,
})

const buildClarificationResponse = () => ({
  answer:
    'Minh chua ro cau hoi cua ban dang noi ve khu vuc, tuyen duong hay loai su co nao. Ban vui long noi ro them de minh kiem tra chinh xac.',
  sources: [],
  relatedPosts: [],
  showIncidentCards: false,
  actions: [
    { label: 'Mo bang tin', target: '/urban', kind: 'link' },
    { label: 'Mo ban do', target: '/urban/map', kind: 'link' },
  ],
  disclaimer: null,
})

const buildLocationUpdateResponse = () => ({
  answer:
    'Mình chưa có vị trí hiện tại của bạn để kiểm tra chính xác khu vực gần bạn. Bạn có thể nói rõ địa điểm cần xem, hoặc cập nhật nhanh vị trí trong hồ sơ để mình tự dùng cho các câu hỏi tiếp theo.',
  sources: [],
  relatedPosts: [],
  showIncidentCards: false,
  actions: [
    { label: 'Cập nhật vị trí', target: '/profile?openLocation=1', kind: 'profile_location' },
    { label: 'Mo bang tin', target: '/urban', kind: 'link' },
  ],
  disclaimer: null,
})

const extractIncidentType = ({ parsedQuery, requestQuestion = '' }) => {
  if (parsedQuery?.entities?.incidentType) {
    return String(parsedQuery.entities.incidentType).trim()
  }

  const normalized = normalizeForMatch(requestQuestion)
  if (normalized.includes('ngap') || normalized.includes('lut')) return 'ngập'
  if (normalized.includes('ket xe') || normalized.includes('un tac') || normalized.includes('giao thong')) return 'giao thông'
  if (normalized.includes('dien')) return 'sự cố điện'
  if (normalized.includes('nuoc')) return 'sự cố nước'
  if (normalized.includes('rac')) return 'rác thải'
  if (normalized.includes('cay')) return 'cây xanh'
  if (normalized.includes('den duong')) return 'đèn đường'
  return ''
}

const extractTimeReference = (question = '', parsedQuery = {}) => {
  if (parsedQuery?.temporal?.time) return String(parsedQuery.temporal.time).trim()
  const normalized = normalizeForMatch(question)
  if (normalized.includes('toi nay')) return 'Tối nay'
  if (normalized.includes('hom nay')) return 'Hôm nay'
  if (normalized.includes('bay gio') || normalized.includes('hien tai')) return 'Hiện tại'
  if (normalized.includes('gio cao diem')) return 'Giờ cao điểm'
  return ''
}

const deriveAreaMemory = ({ parsedQuery, execution, verifiedContext }) => {
  const parsedArea = String(parsedQuery?.spatial?.area || '').trim()
  if (parsedArea) return parsedArea

  const resolvedArea = execution?.toolOutputs?.areaResolverTool
  if (resolvedArea?.available) {
    return String(resolvedArea.area || resolvedArea.district || resolvedArea.province || resolvedArea.address || '').trim()
  }

  const firstIncident = Array.isArray(verifiedContext?.incidents) ? verifiedContext.incidents[0] : null
  if (firstIncident?.location?.district) return String(firstIncident.location.district).trim()
  return ''
}

const deriveRoadMemory = ({ parsedQuery, execution }) =>
  String(parsedQuery?.spatial?.road || execution?.toolOutputs?.geocodeTool?.query || '').trim()

const deriveRouteMemory = ({ parsedQuery, execution }) => {
  if (parsedQuery?.spatial?.origin && parsedQuery?.spatial?.destination) {
    return {
      origin: String(parsedQuery.spatial.origin).trim(),
      destination: String(parsedQuery.spatial.destination).trim(),
    }
  }

  const routeOutput = execution?.toolOutputs?.routeTool
  if (routeOutput?.available && routeOutput?.origin?.query && routeOutput?.destination?.query) {
    return {
      origin: String(routeOutput.origin.query).trim(),
      destination: String(routeOutput.destination.query).trim(),
    }
  }

  return null
}

const deriveMemoryUpdate = ({
  parsedQuery,
  execution,
  verifiedContext,
  rewrittenQuestion,
  requestQuestion,
}) => ({
  lastArea: deriveAreaMemory({ parsedQuery, execution, verifiedContext }),
  lastRoad: deriveRoadMemory({ parsedQuery, execution }),
  lastRoute: deriveRouteMemory({ parsedQuery, execution }),
  lastIncidentType: extractIncidentType({ parsedQuery, requestQuestion }),
  lastTimeReference: extractTimeReference(requestQuestion, parsedQuery),
  lastResolvedQuery: rewrittenQuestion || '',
  lastContextType: String(parsedQuery?.intent || '').trim(),
})

class AssistantOrchestrator {
  async run(request = {}) {
    const requestId = String(request?.requestId || `assistant-${Date.now()}`)
    console.log(`[assistant:${requestId}] start`)
    const memory = await conversationState.load(request.userId)
    const profileLocation = request.location
      ? await locationResolutionService.resolveProfileLocation(request.location)
      : null

    const rewriteResult = queryRewriter.rewrite({
      question: request.question,
      history: request.history,
      memory,
    })

    const parsedQuery = await queryUnderstandingLayer.parse({
      question: rewriteResult.rewrittenQuestion,
      history: request.history,
      memory,
      userLocation: profileLocation,
    })
    console.log(`[assistant:${requestId}] parsed intent=${parsedQuery.intent} confidence=${parsedQuery.confidence}`)

    if (parsedQuery.intent === 'unsupported') {
      console.warn(`[assistant:${requestId}] unsupported query`)
      return buildUnsupportedResponse()
    }

    if (parsedQuery.confidence < 0.35) {
      console.warn(`[assistant:${requestId}] low confidence query`)
      return buildClarificationResponse()
    }

    if (
      parsedQuery.intent === 'nearby_incident_check' &&
      !parsedQuery?.spatial?.area &&
      !profileLocation &&
      !request?.location
    ) {
      console.warn(`[assistant:${requestId}] missing profile location for nearby query`)
      return buildLocationUpdateResponse()
    }

    const plan = aiPlanner.buildPlan(parsedQuery)
    console.log(`[assistant:${requestId}] plan steps=${plan.steps.length}`)
    const execution = await toolExecutor.execute(plan, {
      userId: request.userId,
      request,
      parsedQuery,
      memory,
      profileLocation,
      rewrittenQuestion: rewriteResult.rewrittenQuestion,
      requestId,
    })
    console.log(`[assistant:${requestId}] executed steps=${execution.trace.length}`)

    const verifiedContext = contextAssembler.assemble({
      parsedQuery,
      execution,
    })

    const generated = await responseGenerator.generate({
      parsedQuery,
      verifiedContext,
      history: request.history,
    })

    await conversationState.save(request.userId, {
      ...memory,
      ...deriveMemoryUpdate({
        parsedQuery,
        execution,
        verifiedContext,
        rewrittenQuestion: rewriteResult.rewrittenQuestion,
        requestQuestion: request.question,
      }),
    })
    console.log(`[assistant:${requestId}] done incidents=${verifiedContext.incidents.length}`)

    return {
      answer: generated.answer,
      sources: [],
      relatedPosts: verifiedContext?.uiHints?.relatedPosts || [],
      showIncidentCards: Boolean(verifiedContext?.uiHints?.showIncidentCards),
      actions: verifiedContext?.uiHints?.actions || [],
      disclaimer: generated.disclaimer,
    }
  }
}

export default new AssistantOrchestrator()
