export const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    return String(value._id || value.userId || value.id || value.conversationId || value.messageId || '')
  }
  return String(value)
}

export const serializeCursor = (value) => {
  if (!value) return null
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}
