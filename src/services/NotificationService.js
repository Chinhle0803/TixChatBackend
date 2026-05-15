import NotificationTokenRepository from '../repositories/NotificationTokenRepository.js'
import UserRepository from '../repositories/UserRepository.js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const MAX_EXPO_MESSAGES_PER_REQUEST = 100

const normalizeId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') return String(value._id || value.userId || value.id || '')
  return String(value)
}

const truncate = (value = '', maxLength = 110) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trim()}…`
}

class NotificationService {
  async registerToken(userId, payload = {}) {
    const token = String(payload?.token || '').trim()
    if (!token) {
      throw new Error('Notification token is required')
    }

    return NotificationTokenRepository.upsert({
      userId,
      token,
      platform: payload?.platform || 'expo',
      deviceId: payload?.deviceId || '',
      enabled: payload?.enabled !== false,
    })
  }

  async unregisterToken(userId, payload = {}) {
    const token = String(payload?.token || '').trim()
    if (!token) {
      throw new Error('Notification token is required')
    }

    return NotificationTokenRepository.delete(token, userId)
  }

  async updatePreferences(userId, payload = {}) {
    // Placeholder for future server-side mute/privacy preferences.
    return {
      userId,
      preferences: {
        messageNotifications: payload?.messageNotifications !== false,
      },
    }
  }

  getDisplayName(user = {}) {
    return (
      user?.nickname ||
      user?.displayName ||
      user?.fullName ||
      user?.name ||
      user?.username ||
      'TixChat'
    )
  }

  buildMessagePreview(message = {}) {
    const type = String(message?.type || '').toLowerCase()
    const content = String(message?.content || '').trim()
    const attachments = Array.isArray(message?.attachments) ? message.attachments : []

    if (type === 'system') return truncate(content || 'Có cập nhật mới')
    if (content) return truncate(content)
    if (attachments.length > 0) {
      const firstType = String(attachments[0]?.type || attachments[0]?.mimeType || '').toLowerCase()
      if (firstType.includes('image')) return 'Đã gửi một ảnh'
      if (firstType.includes('video')) return 'Đã gửi một video'
      return 'Đã gửi một tệp'
    }

    return 'Bạn có tin nhắn mới'
  }

  async buildNotificationPayload({ conversation, message }) {
    const senderId = normalizeId(message?.senderId)
    const sender = senderId && senderId !== 'system'
      ? await UserRepository.findById(senderId).catch(() => null)
      : null
    const senderName = senderId === 'system' ? 'TixChat' : this.getDisplayName(sender)
    const isGroup = String(conversation?.type || '').toLowerCase() === 'group'
    const title = isGroup
      ? (conversation?.name || senderName || 'Nhóm chat')
      : senderName
    const preview = this.buildMessagePreview(message)
    const body = isGroup && senderId !== 'system'
      ? `${senderName}: ${preview}`
      : preview

    return {
      title,
      body,
      data: {
        type: 'message',
        conversationId: normalizeId(message?.conversationId),
        messageId: normalizeId(message?.messageId || message?._id),
      },
    }
  }

  async sendExpoPushMessages(messages = []) {
    for (let index = 0; index < messages.length; index += MAX_EXPO_MESSAGES_PER_REQUEST) {
      const chunk = messages.slice(index, index + MAX_EXPO_MESSAGES_PER_REQUEST)
      if (chunk.length === 0) continue

      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        })

        const payload = await response.json().catch(() => null)
        const tickets = Array.isArray(payload?.data) ? payload.data : []
        tickets.forEach((ticket, ticketIndex) => {
          if (ticket?.status !== 'error') return
          const token = chunk[ticketIndex]?.to
          const errorCode = ticket?.details?.error
          console.warn('Expo push error:', errorCode || ticket?.message || ticket)
          if (errorCode === 'DeviceNotRegistered' && token) {
            NotificationTokenRepository.disable(token).catch(() => {})
          }
        })
      } catch (error) {
        console.warn('Failed to send Expo push notifications:', error?.message || error)
      }
    }
  }

  async sendMessageNotifications({ conversation, message, participantIds = [] }) {
    const senderId = normalizeId(message?.senderId)
    const recipients = [...new Set((participantIds || []).map((id) => normalizeId(id)).filter(Boolean))]
      .filter((userId) => senderId === 'system' || userId !== senderId)

    if (recipients.length === 0) return

    const tokens = await NotificationTokenRepository.findEnabledByUserIds(recipients)
    const expoTokens = tokens.filter((item) => {
      const token = String(item?.token || '')
      return token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken')
    })
    if (expoTokens.length === 0) return

    const notification = await this.buildNotificationPayload({ conversation, message })
    const messages = expoTokens.map((item) => ({
      to: item.token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data,
    }))

    await this.sendExpoPushMessages(messages)
  }

  async sendIncomingCallNotification({ call }) {
    const callerId = normalizeId(call?.callerId)
    const participantIds = Array.isArray(call?.participantIds) ? call.participantIds : []
    const recipients = [...new Set(
      [...participantIds, call?.calleeId]
        .map((id) => normalizeId(id))
        .filter(Boolean)
    )].filter((userId) => userId !== callerId)
    if (!callerId || recipients.length === 0) return

    const tokens = await NotificationTokenRepository.findEnabledByUserIds(recipients)
    const expoTokens = tokens.filter((item) => {
      const token = String(item?.token || '')
      return token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken')
    })
    if (expoTokens.length === 0) return

    const caller = await UserRepository.findById(callerId).catch(() => null)
    const callerName = this.getDisplayName(caller)
    const callType = String(call?.callType || '').toLowerCase() === 'video' ? 'video' : 'thoại'
    const messages = expoTokens.map((item) => ({
      to: item.token,
      sound: 'default',
      title: callerName || 'Cuộc gọi đến',
      body: `Cuộc gọi ${callType} đến`,
      data: {
        type: 'call',
        callId: normalizeId(call?.callId),
        conversationId: normalizeId(call?.conversationId),
        callType,
      },
    }))

    await this.sendExpoPushMessages(messages)
  }
}

export default new NotificationService()
