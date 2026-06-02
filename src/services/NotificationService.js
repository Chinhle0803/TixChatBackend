import NotificationTokenRepository from '../repositories/NotificationTokenRepository.js'
import UserRepository from '../repositories/UserRepository.js'
import config from '../config/index.js'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const MAX_EXPO_MESSAGES_PER_REQUEST = 100
const MAX_EXPO_RECEIPTS_PER_REQUEST = 1000
const PUSH_RECEIPT_CHECK_DELAY_MS = 15000
const MESSAGE_NOTIFICATION_CHANNEL_ID = 'messages'
const CALL_NOTIFICATION_CHANNEL_ID = 'calls'
const SERVER_NOTIFICATION_SOURCE = 'server'
const EXPO_PUSH_TOKEN_PATTERN = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/

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

const isExpoPushToken = (token) => EXPO_PUSH_TOKEN_PATTERN.test(String(token || '').trim())

const getExpoTokens = (tokens = []) =>
  (tokens || []).filter((item) => isExpoPushToken(item?.token))

const normalizeCallType = (callType) =>
  String(callType || '').toLowerCase() === 'video' ? 'video' : 'audio'

const getCallTypeLabel = (callType) =>
  normalizeCallType(callType) === 'video' ? 'video' : 'thoại'

const summarizeExpoPushError = (payload) => {
  if (!payload) return ''
  if (Array.isArray(payload?.errors)) {
    return payload.errors
      .map((error) => error?.message || error?.code || String(error || ''))
      .filter(Boolean)
      .join('; ')
  }
  return payload?.message || ''
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
        senderId,
        notificationSource: SERVER_NOTIFICATION_SOURCE,
      },
    }
  }

  handleExpoDeliveryError(errorCode, token) {
    if (errorCode === 'DeviceNotRegistered' && token) {
      NotificationTokenRepository.disable(token).catch(() => {})
    }
  }

  schedulePushReceiptCheck(receiptTokenPairs = []) {
    if (!Array.isArray(receiptTokenPairs) || receiptTokenPairs.length === 0) return

    const receiptTimer = setTimeout(() => {
      this.checkExpoPushReceipts(receiptTokenPairs).catch((error) => {
        console.warn('Failed to check Expo push receipts:', error?.message || error)
      })
    }, PUSH_RECEIPT_CHECK_DELAY_MS)
    receiptTimer.unref?.()
  }

  async checkExpoPushReceipts(receiptTokenPairs = []) {
    for (let index = 0; index < receiptTokenPairs.length; index += MAX_EXPO_RECEIPTS_PER_REQUEST) {
      const chunk = receiptTokenPairs.slice(index, index + MAX_EXPO_RECEIPTS_PER_REQUEST)
      const ids = chunk.map((item) => item.id).filter(Boolean)
      if (ids.length === 0) continue

      const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const summary = summarizeExpoPushError(payload)
        console.warn('Expo push receipt request failed:', response.status, summary || response.statusText)
        continue
      }

      const receipts = payload?.data || {}
      chunk.forEach((item) => {
        const receipt = receipts?.[item.id]
        if (!receipt || receipt.status !== 'error') return
        const errorCode = receipt?.details?.error
        console.warn('Expo push receipt error:', errorCode || receipt?.message || receipt)
        this.handleExpoDeliveryError(errorCode, item.token)
      })
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
        if (!response.ok) {
          const summary = summarizeExpoPushError(payload)
          console.warn('Expo push request failed:', response.status, summary || response.statusText)
          continue
        }

        if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
          console.warn('Expo push response errors:', summarizeExpoPushError(payload))
        }

        const receiptTokenPairs = []
        const tickets = Array.isArray(payload?.data) ? payload.data : []
        tickets.forEach((ticket, ticketIndex) => {
          const token = chunk[ticketIndex]?.to
          if (ticket?.status === 'ok' && ticket?.id) {
            receiptTokenPairs.push({ id: ticket.id, token })
            return
          }

          if (ticket?.status !== 'error') return
          const errorCode = ticket?.details?.error
          console.warn('Expo push error:', errorCode || ticket?.message || ticket)
          this.handleExpoDeliveryError(errorCode, token)
        })
        this.schedulePushReceiptCheck(receiptTokenPairs)
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
    const expoTokens = getExpoTokens(tokens)
    if (expoTokens.length === 0) return

    const notification = await this.buildNotificationPayload({ conversation, message })
    const messages = expoTokens.map((item) => ({
      to: item.token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data,
      channelId: MESSAGE_NOTIFICATION_CHANNEL_ID,
      priority: 'high',
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
    const expoTokens = getExpoTokens(tokens)
    if (expoTokens.length === 0) return

    const caller = await UserRepository.findById(callerId).catch(() => null)
    const callerName = this.getDisplayName(caller)
    const callType = normalizeCallType(call?.callType)
    const callTypeLabel = getCallTypeLabel(callType)
    const ttl = Math.max(1, Number(config.callRingTimeoutSeconds || 60))
    const messages = expoTokens.map((item) => ({
      to: item.token,
      sound: 'default',
      title: callerName || 'Cuộc gọi đến',
      body: `Cuộc gọi ${callTypeLabel} đến`,
      data: {
        type: 'call',
        callId: normalizeId(call?.callId),
        conversationId: normalizeId(call?.conversationId),
        callType,
        notificationSource: SERVER_NOTIFICATION_SOURCE,
      },
      channelId: CALL_NOTIFICATION_CHANNEL_ID,
      priority: 'high',
      ttl,
    }))

    await this.sendExpoPushMessages(messages)
  }
}

export default new NotificationService()
