import { verifyToken } from '../utils/tokenUtils.js'
import userService from '../services/UserService.js'
import messageService from '../services/MessageService.js'
import conversationService from '../services/ConversationService.js'
import notificationService from '../services/NotificationService.js'
import { messageEvents, conversationEvents, userEvents } from '../events/EventBus.js'
import {
  USER_EVENTS,
  MESSAGE_EVENTS,
  CONVERSATION_EVENTS,
  TYPING_EVENTS,
} from '../events/EventTypes.js'

// Store active socket connections (userId -> socket.id)
const userSockets = new Map()

const normalizeParticipantId = (participant) => {
  if (!participant) return ''
  if (typeof participant === 'object') {
    return String(participant._id || participant.userId || participant.id || '')
  }
  return String(participant)
}

export const initializeSocketHandlers = (io) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) {
      return next(new Error('Authentication error'))
    }

    const decoded = verifyToken(token, 'access')
    if (!decoded) {
      return next(new Error('Invalid token'))
    }

    socket.userId = decoded.userId
    next()
  })

  io.on('connection', async (socket) => {
    console.log(`✅ User connected: ${socket.userId}`)

    // Join personal room so server can push direct events to this user
    socket.join(`user:${socket.userId}`)

    // Store socket connection
    userSockets.set(socket.userId, socket.id)

    // Set user online
    await userService.setOnlineStatus(socket.userId, true)

    // Broadcast user online
    io.emit('user:online', { userId: socket.userId })

    // ==================== MESSAGE EVENTS ====================
    socket.on('send_message', async (data, callback) => {
      try {
        // Ensure socket is in the conversation room
        if (!socket.rooms.has(`conversation:${data.conversationId}`)) {
          socket.join(`conversation:${data.conversationId}`)
          console.log(`🔗 Auto-joined socket to room: conversation:${data.conversationId}`)
        }

        const message = await messageService.sendMessage(
          data.conversationId,
          socket.userId,
          data.content,
          data.replyTo
        )

        // Send acknowledgment callback to sender
        if (callback && typeof callback === 'function') {
          callback({ success: true, message })
        }
      } catch (err) {
        socket.emit('error', { message: err.message })
        if (callback && typeof callback === 'function') {
          callback({ success: false, error: err.message })
        }
      }
    })

    socket.on('message:delivered', async (data) => {
      try {
        const message = await messageService.markAsDelivered(
          data.messageId,
          socket.userId
        )

        io.to(`conversation:${message.conversationId}`).emit('message:delivered', {
          messageId: data.messageId,
          userId: socket.userId,
        })
      } catch (err) {
        socket.emit('error', { message: err.message })
      }
    })

    socket.on('message:seen', async (data) => {
      try {
        await messageService.markAsSeen(data.conversationId, socket.userId)

        io.to(`conversation:${data.conversationId}`).emit('message:seen', {
          conversationId: data.conversationId,
          userId: socket.userId,
        })
      } catch (err) {
        socket.emit('error', { message: err.message })
      }
    })

    socket.on('message:edit', async (data) => {
      try {
        const message = await messageService.editMessage(
          data.conversationId,
          data.messageId,
          socket.userId,
          data.content
        )

        io.to(`conversation:${message.conversationId}`).emit('message:edited', {
          message,
        })
      } catch (err) {
        socket.emit('error', { message: err.message })
      }
    })

    socket.on('message:delete', async (data) => {
      try {
        const result = await messageService.deleteMessage(
          data.conversationId,
          data.messageId,
          socket.userId
        )

        io.to(`user:${socket.userId}`).emit('message:hidden', {
          messageId: data.messageId,
          conversationId: result.conversationId,
          hiddenBy: socket.userId,
        })
      } catch (err) {
        socket.emit('error', { message: err.message })
      }
    })

    socket.on('message:emoji', async (data) => {
      try {
        const message = await messageService.addEmoji(
          data.messageId,
          socket.userId,
          data.emoji
        )

        io.to(`conversation:${message.conversationId}`).emit('message:emoji', {
          message,
        })
      } catch (err) {
        socket.emit('error', { message: err.message })
      }
    })

    // ==================== TYPING EVENTS ====================
    socket.on('typing:start', (data) => {
      io.to(`conversation:${data.conversationId}`).emit('typing:start', {
        conversationId: data.conversationId,
        userId: socket.userId,
      })
    })

    socket.on('typing:stop', (data) => {
      io.to(`conversation:${data.conversationId}`).emit('typing:stop', {
        conversationId: data.conversationId,
        userId: socket.userId,
      })
    })

    // ==================== CONVERSATION EVENTS ====================
    socket.on('conversation:join', (data, callback) => {
      const roomName = `conversation:${data.conversationId}`
      socket.join(roomName)
      console.log(`✅ User ${socket.userId} joined room: ${roomName}`)
      
      // Send acknowledgment back to client
      if (callback && typeof callback === 'function') {
        callback({ success: true, roomName })
      }
    })

    socket.on('conversation:leave', (data, callback) => {
      const roomName = `conversation:${data.conversationId}`
      socket.leave(roomName)
      console.log(`👋 User ${socket.userId} left room: ${roomName}`)
      
      // Send acknowledgment back to client
      if (callback && typeof callback === 'function') {
        callback({ success: true, roomName })
      }
    })

    // ==================== PRESENCE EVENTS ====================
    socket.on('set_presence', (data) => {
      io.emit('user:presence', {
        userId: socket.userId,
        status: data.status, // 'online', 'away', 'offline'
      })
    })

    // ==================== DISCONNECT ====================
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.userId}`)

      // Remove socket connection
      userSockets.delete(socket.userId)

      // Set user offline
      await userService.setOnlineStatus(socket.userId, false)

      // Broadcast user offline
      io.emit('user:offline', { userId: socket.userId })
    })
  })

  // ==================== EVENT BUS LISTENERS ====================
  messageEvents.on(MESSAGE_EVENTS.SENT, async (data) => {
    io.to(`conversation:${data.conversationId}`).emit('message:sent', {
      message: data.message,
    })

    try {
      const conversation = await conversationService.getConversationById(data.conversationId)
      const participantIds = Array.isArray(conversation?.participants)
        ? conversation.participants
        : []

      participantIds.forEach((participant) => {
        const participantId = normalizeParticipantId(participant)
        if (!participantId) return

        io.to(`user:${participantId}`).emit('message:received', {
          message: data.message,
        })
      })

      notificationService.sendMessageNotifications({
        conversation,
        message: data.message,
        participantIds: participantIds.map((participant) => normalizeParticipantId(participant)).filter(Boolean),
      }).catch((error) => {
        console.warn('Failed to send push notification:', error?.message || error)
      })
    } catch (error) {
      console.error('❌ Failed to emit message:received from MESSAGE_EVENTS.SENT:', error?.message || error)
    }
  })

  messageEvents.on(MESSAGE_EVENTS.DELIVERED, (data) => {
    io.to(`conversation:${data.conversationId}`).emit('message:delivered', {
      messageId: data.messageId,
      userId: data.userId,
    })
  })

  messageEvents.on(MESSAGE_EVENTS.SEEN, (data) => {
    io.to(`conversation:${data.conversationId}`).emit('message:seen', {
      conversationId: data.conversationId,
      userId: data.userId,
    })
  })

  messageEvents.on(MESSAGE_EVENTS.EDITED, (data) => {
    io.to(`conversation:${data.conversationId}`).emit('message:edited', {
      messageId: data.messageId,
      content: data.newContent,
      isEdited: true,
    })
  })

  messageEvents.on(MESSAGE_EVENTS.DELETED, (data) => {
    // Per-user delete (Xóa) is handled directly in the controller.
    // Only handle global delete (Gỡ) here.
    if (!data.isDeleted && !data.deletedBy) return

    if (data.isDeleted) {
      io.to(`conversation:${data.conversationId}`).emit('message:deleted', {
        messageId: data.messageId,
        isDeleted: true,
      })
    }
  })

  conversationEvents.on(CONVERSATION_EVENTS.PARTICIPANT_ADDED, (data) => {
    io.to(`conversation:${data.conversationId}`).emit('participant:added', {
      conversationId: data.conversationId,
      participantId: data.participantId,
      addedBy: data.addedBy,
    })

    if (data?.participantId) {
      io.to(`user:${data.participantId}`).emit('participant:added', {
        conversationId: data.conversationId,
        participantId: data.participantId,
        addedBy: data.addedBy,
      })
    }
  })

  conversationEvents.on(CONVERSATION_EVENTS.PARTICIPANT_REMOVED, (data) => {
    io.to(`conversation:${data.conversationId}`).emit('participant:removed', {
      participantId: data.participantId,
    })
  })

  conversationEvents.on(CONVERSATION_EVENTS.PARTICIPANT_ROLE_UPDATED, (data) => {
    io.to(`conversation:${data.conversationId}`).emit('participant:role_updated', {
      conversationId: data.conversationId,
      targetUserId: data.targetUserId,
      oldRole: data.oldRole,
      newRole: data.newRole,
      changedByUserId: data.changedByUserId,
    })
  })

  conversationEvents.on(CONVERSATION_EVENTS.CREATED, (data) => {
    const participantIds = Array.isArray(data?.participants)
      ? data.participants
      : []

    participantIds.forEach((participantId) => {
      io.to(`user:${participantId}`).emit('conversation:created', {
        conversationId: data.conversationId,
        type: data.type,
        participants: participantIds,
      })
    })
  })

  conversationEvents.on(CONVERSATION_EVENTS.DISSOLVED, (data) => {
    const participantIds = Array.isArray(data?.participantIds)
      ? data.participantIds
      : []

    participantIds.forEach((participantId) => {
      io.to(`user:${participantId}`).emit('conversation:dissolved', {
        conversationId: data.conversationId,
        dissolvedByUserId: data.dissolvedByUserId,
      })
    })

    io.to(`conversation:${data.conversationId}`).emit('conversation:dissolved', {
      conversationId: data.conversationId,
      dissolvedByUserId: data.dissolvedByUserId,
    })
  })

  userEvents.on(USER_EVENTS.FRIEND_REQUEST_SENT, (data) => {
    io.to(`user:${data.friendId}`).emit('friend_request:new', {
      fromUserId: data.userId,
    })

    io.to(`user:${data.userId}`).emit('friend_request:sent', {
      toUserId: data.friendId,
    })
  })

  userEvents.on(USER_EVENTS.FRIEND_REQUEST_ACCEPTED, (data) => {
    io.to(`user:${data.userId}`).emit('friend_request:accepted', {
      byUserId: data.requesterId,
    })

    io.to(`user:${data.requesterId}`).emit('friend_request:accepted', {
      byUserId: data.userId,
    })
  })

  userEvents.on(USER_EVENTS.FRIEND_REQUEST_REJECTED, (data) => {
    io.to(`user:${data.requesterId}`).emit('friend_request:rejected', {
      byUserId: data.userId,
    })
  })
}

export default userSockets
