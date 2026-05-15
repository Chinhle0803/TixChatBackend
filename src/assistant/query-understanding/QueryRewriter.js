const FOLLOW_UP_PATTERNS = [
  'con bay gio thi sao',
  'con gio thi sao',
  'con o do thi sao',
  'con khu vuc do thi sao',
  'cho do thi sao',
  'o do thi sao',
  'con ngap khong',
  'the con',
  'doan do',
  'tuyen do',
  'duong do',
  'khu do',
  'gan do',
]

const TIME_REFERENCE_PATTERNS = [
  ['toi nay', 'Tối nay'],
  ['hom nay', 'Hôm nay'],
  ['bay gio', 'Hiện tại'],
  ['hien tai', 'Hiện tại'],
  ['gio cao diem', 'Giờ cao điểm'],
  ['sang nay', 'Sáng nay'],
  ['chieu nay', 'Chiều nay'],
]

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

class QueryRewriter {
  extractTimeReference(question = '', memory = {}) {
    const normalized = normalizeForMatch(question)
    const matched = TIME_REFERENCE_PATTERNS.find(([pattern]) => normalized.includes(pattern))
    if (matched) return matched[1]
    return String(memory?.lastTimeReference || '').trim()
  }

  extractFollowUpClause(question = '') {
    const normalized = normalizeForMatch(question)
    if (!normalized) return ''
    if (normalized.includes('ngap')) return 'tình trạng ngập'
    if (normalized.includes('ket xe') || normalized.includes('un tac') || normalized.includes('giao thong')) return 'tình trạng giao thông'
    if (normalized.includes('dien')) return 'sự cố điện'
    if (normalized.includes('nuoc')) return 'sự cố nước'
    if (normalized.includes('rac')) return 'sự cố rác thải'
    return ''
  }

  rewrite({ question, history = [], memory = {} }) {
    const rawQuestion = String(question || '').trim()
    if (!rawQuestion) {
      return { rewrittenQuestion: rawQuestion, usedMemory: false }
    }

    const normalized = normalizeForMatch(rawQuestion)
    const hasFollowUpPattern = FOLLOW_UP_PATTERNS.some((pattern) => normalized.includes(pattern))
    if (!hasFollowUpPattern) {
      return { rewrittenQuestion: rawQuestion, usedMemory: false }
    }

    const lastArea = String(memory?.lastArea || '').trim()
    const lastRoad = String(memory?.lastRoad || '').trim()
    const lastIncidentType = String(memory?.lastIncidentType || '').trim()
    const lastTimeReference = this.extractTimeReference(rawQuestion, memory)
    const lastRoute = memory?.lastRoute && typeof memory.lastRoute === 'object'
      ? memory.lastRoute
      : null
    const followUpClause = this.extractFollowUpClause(rawQuestion)

    if (!lastArea && !lastIncidentType && !lastRoad && !lastRoute) {
      return { rewrittenQuestion: rawQuestion, usedMemory: false }
    }

    if (lastRoute?.origin && lastRoute?.destination) {
      const parts = [
        lastTimeReference || 'Hiện tại',
        `trên tuyến từ ${lastRoute.origin} đến ${lastRoute.destination}`,
        followUpClause ? `có còn ${followUpClause}` : (lastIncidentType ? `có còn ${lastIncidentType}` : 'có sự cố gì không'),
      ].filter(Boolean)

      return {
        rewrittenQuestion: parts.join(' ').replace(/\s+/g, ' ').trim().replace(/\.$/, '') + '?',
        usedMemory: true,
      }
    }

    if (lastRoad) {
      const parts = [
        lastTimeReference || 'Hiện tại',
        `trên đường ${lastRoad}`,
        followUpClause ? `có còn ${followUpClause}` : (lastIncidentType ? `có còn ${lastIncidentType}` : 'có sự cố gì không'),
      ].filter(Boolean)

      return {
        rewrittenQuestion: parts.join(' ').replace(/\s+/g, ' ').trim().replace(/\.$/, '') + '?',
        usedMemory: true,
      }
    }

    const parts = [
      lastTimeReference || 'Hiện tại',
      lastArea ? `ở ${lastArea}` : '',
      followUpClause ? `có còn ${followUpClause}` : (lastIncidentType ? `có còn ${lastIncidentType}` : 'có sự cố gì không'),
    ].filter(Boolean)

    return {
      rewrittenQuestion: parts.join(' ').replace(/\s+/g, ' ').trim().replace(/\.$/, '') + '?',
      usedMemory: true,
    }
  }
}

export default new QueryRewriter()
