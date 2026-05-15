import MessageRepository from '../repositories/MessageRepository.js'
import ConversationRepository from '../repositories/ConversationRepository.js'
import ParticipantRepository from '../repositories/ParticipantRepository.js'
import { messageEvents } from '../events/EventBus.js'
import { MESSAGE_EVENTS } from '../events/EventTypes.js'

const DUPLICATE_DETECTION_WINDOW_MS = 10 * 60 * 1000

export class MessageService {
  async mapWithConcurrency(items = [], worker, concurrency = 8) {
    if (!Array.isArray(items) || items.length === 0) {
      return []
    }

    const safeConcurrency = Math.max(1, Math.min(concurrency, items.length))
    const results = new Array(items.length)
    let index = 0

    const runners = Array.from({ length: safeConcurrency }, async () => {
      while (index < items.length) {
        const currentIndex = index
        index += 1
        results[currentIndex] = await worker(items[currentIndex], currentIndex)
      }
    })

    await Promise.all(runners)
    return results
  }

  async findRecentDuplicateByClientMessageId(conversationId, senderId, clientMessageId) {
    if (!clientMessageId) {
      return null
    }

    const now = Date.now()
    let cursor = null
    let page = 0

    while (page < 5) {
      const result = await MessageRepository.getByConversation(conversationId, 50, cursor)
      const messages = result?.messages || []

      const duplicated = messages.find((message) => {
        const createdAt = Number(message?.createdAt || 0)
        const withinWindow = now - createdAt <= DUPLICATE_DETECTION_WINDOW_MS

        return (
          String(message?.senderId) === String(senderId) &&
          String(message?.clientMessageId || '') === String(clientMessageId) &&
          withinWindow
        )
      })

      if (duplicated) {
        return duplicated
      }

      const oldestCreatedAt = Number(messages?.[messages.length - 1]?.createdAt || 0)
      if (!result?.lastEvaluatedKey || !oldestCreatedAt || now - oldestCreatedAt > DUPLICATE_DETECTION_WINDOW_MS) {
        break
      }

      cursor = result.lastEvaluatedKey
      page += 1
    }

    return null
  }

  async sendMessage(conversationId, senderId, content, replyTo = null, options = {}) {
    // Verify conversation exists
    const conversation = await ConversationRepository.findById(conversationId)
    if (!conversation) {
      throw new Error('Conversation not found')
    }

    // Verify sender is a participant
    let participant = await ParticipantRepository.findOne(conversationId, senderId)
    if (!participant) {
      throw new Error('You are not a participant of this conversation')
    }

    // Compatibility for legacy behavior: if user had previously been marked as left
    // in a direct chat, reactivate them while preserving a clear-history boundary.
    if (participant.leftAt && (conversation.type === '1-1' || conversation.type === 'direct')) {
      participant = await ParticipantRepository.reactivateParticipant(
        conversationId,
        senderId,
        participant.leftAt
      )
    }

    if (participant.leftAt) {
      throw new Error('You are not a participant of this conversation')
    }

    if (conversation.type === 'group') {
      const blockedUserIds = Array.isArray(conversation?.blockedUserIds)
        ? conversation.blockedUserIds.map((id) => String(id))
        : []

      if (blockedUserIds.includes(String(senderId))) {
        throw new Error('You are blocked from this group')
      }

      const groupSettings = conversation?.groupSettings || {}
      if (groupSettings.adminOnlyMessaging) {
        const senderRole = String(participant.role || 'member')
        if (!['admin', 'moderator'].includes(senderRole)) {
          throw new Error('Group is currently in admin-only messaging mode')
        }
      }
    }

    // Also reactivate any legacy left participant in this direct conversation so
    // they receive new messages in the same thread instead of creating a new one.
    if (conversation.type === '1-1' || conversation.type === 'direct') {
      const participants = await ParticipantRepository.findByConversationId(conversationId, 100)
      for (const item of participants || []) {
        if (item?.leftAt) {
          await ParticipantRepository.reactivateParticipant(
            conversationId,
            item.userId,
            item.leftAt
          )
        }
      }
    }

    const clientMessageId = options?.clientMessageId || null

    // Avoid duplicate sends from rapid submits/retries using idempotency key
    const duplicatedMessage = await this.findRecentDuplicateByClientMessageId(
      conversationId,
      senderId,
      clientMessageId
    )

    if (duplicatedMessage) {
      return duplicatedMessage
    }

    // Create message
    const normalizedContent = typeof content === 'string' ? content.trim() : ''
    const attachments = Array.isArray(options.attachments) ? options.attachments : []
    const hasText = Boolean(normalizedContent)
    const hasAttachments = attachments.length > 0

    if (!hasText && !hasAttachments) {
      throw new Error('Message content or attachment is required')
    }

    const inferredType = hasAttachments
      ? attachments[0]?.type || 'file'
      : 'text'

    const message = await MessageRepository.create({
      conversationId,
      senderId,
      content: normalizedContent,
      replyTo,
      attachments,
      clientMessageId,
      type: options.type || inferredType,
    })

    // Update conversation
    await ConversationRepository.update(conversationId, {
      updatedAt: Date.now(),
    })

    // Emit event
    messageEvents.emit(MESSAGE_EVENTS.SENT, {
      conversationId,
      message,
    })

    return message
  }

  async getConversationMessages(conversationId, userId, limit = 50, lastEvaluatedKey = null) {
    const participant = await ParticipantRepository.findOne(conversationId, userId)
    if (!participant || participant.leftAt) {
      throw new Error('You are not a participant of this conversation')
    }

    const result = await MessageRepository.getByConversation(conversationId, limit, lastEvaluatedKey)
    const clearedAt = Number(participant.clearedAt || 0)
    const normalizedUserId = String(userId)

    let messages = result.messages || []

    // Filter out globally deleted messages
    messages = messages.filter((msg) => !msg.isDeleted)

    // Filter out messages deleted by the current user (per-user delete)
    messages = messages.filter((msg) => {
      const deletedBy = msg.deletedBy || {}
      return !deletedBy[normalizedUserId]
    })

    if (!clearedAt) {
      return { ...result, messages }
    }

    return {
      ...result,
      messages: messages.filter((message) => Number(message.createdAt || 0) > clearedAt),
    }
  }

  async markAsDelivered(messageId, userId) {
    // Note: messageId alone cannot query message in DynamoDB
    // Need conversationId + messageId for composite key
    // This method needs to be called with conversationId or refactored
    throw new Error('markAsDelivered requires conversationId parameter')
  }

  async markAsDeliveredInConversation(conversationId, messageId, userId) {
    const message = await MessageRepository.findById(conversationId, messageId)
    if (!message) {
      throw new Error('Message not found')
    }

    // Add userId to deliveredTo if not already there
    const deliveredTo = message.deliveredTo || []
    if (!deliveredTo.includes(userId)) {
      deliveredTo.push(userId)
      await MessageRepository.update(conversationId, messageId, {
        deliveredTo,
      })
    }

    // Emit event
    messageEvents.emit(MESSAGE_EVENTS.DELIVERED, {
      messageId,
      userId,
      conversationId: message.conversationId,
    })

    return message
  }

  async markAsSeen(conversationId, userId) {
    // Get all messages in conversation
    const result = await MessageRepository.getByConversation(conversationId, 10000)
    const messages = result.messages || []

    // Mark each as seen (concurrently with a safe cap)
    let latestMessage = null
    const messagesToUpdate = []

    for (const message of messages) {
      const seenBy = message.seenBy || []
      if (!seenBy.includes(userId)) {
        messagesToUpdate.push({
          messageId: message.messageId,
          seenBy: [...seenBy, userId],
        })
      }

      if (!latestMessage) {
        latestMessage = message
      }
    }

    await this.mapWithConcurrency(
      messagesToUpdate,
      async ({ messageId, seenBy }) => {
        await MessageRepository.update(conversationId, messageId, { seenBy })
      },
      10
    )

    await ParticipantRepository.updateReadState(
      conversationId,
      userId,
      latestMessage?.messageId || null,
      Date.now()
    )

    // Emit event
    messageEvents.emit(MESSAGE_EVENTS.SEEN, {
      conversationId,
      userId,
    })

    return messages
  }

  async getUnreadCount(conversationId, userId) {
    const participant = await ParticipantRepository.findOne(conversationId, userId)
    if (!participant || participant.leftAt) {
      return 0
    }

    const result = await MessageRepository.getByConversation(conversationId, 10000)
    const messages = result.messages || []
    const lastReadAt = Number(participant.lastReadAt || 0)
    const clearedAt = Number(participant.clearedAt || 0)
    const threshold = Math.max(lastReadAt, clearedAt)

    return messages.filter((message) => {
      const createdAt = Number(message.createdAt || 0)
      const deletedBy = message.deletedBy || {}
      return (
        String(message.senderId) !== String(userId) &&
        createdAt > threshold &&
        message.isDeleted !== true &&
        !deletedBy[String(userId)]
      )
    }).length
  }

  async getUnreadCountsForUser(userId) {
    const participants = await ParticipantRepository.findByUserId(userId, 1000)
    const activeParticipants = (participants || []).filter((item) => !item?.leftAt)
    const unreadEntries = await this.mapWithConcurrency(
      activeParticipants,
      async (participant) => {
        const conversationId = participant?.conversationId
        if (!conversationId) return null

        const unreadCount = await this.getUnreadCount(conversationId, userId)
        return [conversationId, unreadCount]
      },
      6
    )

    const unreadByConversation = {}
    for (const entry of unreadEntries) {
      if (!entry) continue
      unreadByConversation[entry[0]] = entry[1]
    }

    return unreadByConversation
  }

  async editMessage(conversationId, messageId, senderId, newContent) {
    const message = await MessageRepository.findById(conversationId, messageId)
    if (!message) {
      throw new Error('Message not found')
    }

    if (message.senderId !== senderId) {
      throw new Error('You can only edit your own messages')
    }

    const updated = await MessageRepository.update(conversationId, messageId, {
      content: newContent,
      isEdited: true,
      editedAt: Date.now(),
    })

    // Emit event
    messageEvents.emit(MESSAGE_EVENTS.EDITED, {
      messageId,
      conversationId,
      newContent,
    })

    return updated
  }

  async deleteMessage(conversationId, messageId, senderId) {
    const message = await MessageRepository.findById(conversationId, messageId)
    if (!message) {
      throw new Error('Message not found')
    }

    const participant = await ParticipantRepository.findOne(conversationId, senderId)
    if (!participant || participant.leftAt) {
      throw new Error('You are not a participant of this conversation')
    }

    await MessageRepository.deleteForUser(conversationId, messageId, senderId)

    return {
      messageId,
      conversationId,
      deleted: true,
      deleteType: 'self',
    }
  }

  async addEmoji(conversationId, messageId, userId, emoji) {
    const message = await MessageRepository.findById(conversationId, messageId)
    if (!message) {
      throw new Error('Message not found')
    }

    const reactions = message.reactions || {}
    if (!reactions[emoji]) {
      reactions[emoji] = []
    }

    if (!reactions[emoji].includes(userId)) {
      reactions[emoji].push(userId)
    }

    const updated = await MessageRepository.update(conversationId, messageId, {
      reactions,
    })

    return updated
  }

  async removeEmoji(conversationId, messageId, userId, emoji) {
    const message = await MessageRepository.findById(conversationId, messageId)
    if (!message) {
      throw new Error('Message not found')
    }

    const reactions = message.reactions || {}
    if (reactions[emoji]) {
      reactions[emoji] = reactions[emoji].filter(id => id !== userId)
      if (reactions[emoji].length === 0) {
        delete reactions[emoji]
      }
    }

    const updated = await MessageRepository.update(conversationId, messageId, {
      reactions,
    })

    return updated
  }

  async deleteMessageForAll(conversationId, messageId, actorId) {
    const message = await MessageRepository.findById(conversationId, messageId)
    if (!message) {
      throw new Error('Message not found')
    }

    const participant = await ParticipantRepository.findOne(conversationId, actorId)
    const normalizedRole = String(participant?.role || '').toLowerCase()
    const isAdminOrMod = ['admin', 'moderator'].includes(normalizedRole)
    const isSender = String(message.senderId) === String(actorId)

    if (!isAdminOrMod && !isSender) {
      throw new Error('Unauthorized to delete this message')
    }

    await MessageRepository.softDelete(conversationId, messageId)

    return {
      messageId,
      conversationId,
      deleted: true,
    }
  }
}

export default new MessageService()
