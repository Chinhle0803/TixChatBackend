import conversationService from '../services/ConversationService.js'
import { createConversationValidation } from '../utils/validation.js'

// Helper to normalize conversation for frontend compatibility
const normalizeConversation = (conv) => {
  if (!conv) return null
  return {
    ...conv,
    _id: conv.conversationId, // Add _id alias for frontend compatibility
  }
}

// Helper to normalize conversation array
const normalizeConversations = (conversations) => {
  if (!Array.isArray(conversations)) return conversations
  return conversations.map(normalizeConversation)
}

export class ConversationController {
  async createConversation(req, res, next) {
    try {
      const { error, value } = createConversationValidation(req.body)
      if (error) {
        return res.status(400).json({ error: error.details[0].message })
      }

      const conversation = await conversationService.createConversation(
        value.type,
        value.participantIds,
        req.userId,
        value.name
      )

      res.status(201).json({
        message: 'Conversation created successfully',
        conversation: normalizeConversation(conversation),
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async getConversation(req, res, next) {
    try {
      const conversation = await conversationService.getConversationById(
        req.params.conversationId,
        req.userId
      )
      res.status(200).json({ conversation: normalizeConversation(conversation) })
    } catch (err) {
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: err.message })
      }
      if (err.message.includes('do not have access')) {
        return res.status(403).json({ error: err.message })
      }
      next(err)
    }
  }

  async getUserConversations(req, res, next) {
    try {
      const { limit = 20, skip = 0 } = req.query
      const conversations = await conversationService.getUserConversations(
        req.userId,
        parseInt(limit),
        parseInt(skip)
      )

      res.status(200).json({ conversations: normalizeConversations(conversations) })
    } catch (err) {
      next(err)
    }
  }

  async addParticipant(req, res, next) {
    try {
      const { conversationId } = req.params
      const { participantId } = req.body

      const conversation = await conversationService.addParticipant(
        conversationId,
        participantId,
        req.userId
      )

      res.status(200).json({
        message: 'Participant added successfully',
        conversation: normalizeConversation(conversation),
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async removeParticipant(req, res, next) {
    try {
      const { conversationId, participantId } = req.params

      const conversation = await conversationService.removeParticipant(
        conversationId,
        participantId,
        req.userId
      )

      res.status(200).json({
        message: 'Participant removed successfully',
        conversation: normalizeConversation(conversation),
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async updateConversation(req, res, next) {
    try {
      const conversation = await conversationService.updateConversation(
        req.params.conversationId,
        req.body,
        req.userId
      )

      res.status(200).json({
        message: 'Conversation updated successfully',
        conversation: normalizeConversation(conversation),
      })
    } catch (err) {
      next(err)
    }
  }

  async archiveConversation(req, res, next) {
    try {
      await conversationService.archiveConversation(req.params.conversationId)
      res.status(200).json({ message: 'Conversation archived successfully' })
    } catch (err) {
      next(err)
    }
  }

  async deleteConversation(req, res, next) {
    try {
      const result = await conversationService.deleteConversation(
        req.params.conversationId,
        req.userId
      )
      res.status(200).json({
        message: 'Conversation deleted for current user',
        ...result,
      })
    } catch (err) {
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: err.message })
      }
      if (err.message.includes('already deleted')) {
        return res.status(400).json({ error: err.message })
      }
      next(err)
    }
  }

  async searchConversations(req, res, next) {
    try {
      const { q, limit } = req.query
      const results = await conversationService.searchConversations(
        req.userId,
        q || '',
        parseInt(limit) || 10
      )

      res.status(200).json({
        conversations: normalizeConversations(results?.conversations || []),
        users: results?.users || [],
        suggestions: results?.suggestions || [],
      })
    } catch (err) {
      next(err)
    }
  }

  async getParticipants(req, res, next) {
    try {
      const participants = await conversationService.getConversationParticipants(
        req.params.conversationId,
        req.userId
      )

      res.status(200).json({ participants })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async updateParticipantRole(req, res, next) {
    try {
      const { conversationId, participantId } = req.params
      const { role } = req.body || {}

      const participants = await conversationService.updateParticipantRole(
        conversationId,
        participantId,
        role,
        req.userId
      )

      res.status(200).json({
        message: 'Participant role updated successfully',
        participants,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async updateGroupSettings(req, res, next) {
    try {
      const conversation = await conversationService.updateGroupSettings(
        req.params.conversationId,
        req.body || {},
        req.userId
      )

      res.status(200).json({
        message: 'Group settings updated successfully',
        conversation: normalizeConversation(conversation),
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async updateConversationAvatar(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' })
      }

      const { conversationId } = req.params
      const conversation = await conversationService.updateConversationAvatar(
        conversationId,
        req.userId,
        req.file.buffer,
        req.file.originalname
      )

      res.status(200).json({
        message: 'Group avatar updated successfully',
        conversation: normalizeConversation(conversation),
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async getBlockedUsers(req, res, next) {
    try {
      const blockedUserIds = await conversationService.getBlockedUsers(
        req.params.conversationId,
        req.userId
      )

      res.status(200).json({ blockedUserIds })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async blockUser(req, res, next) {
    try {
      const blockedUserIds = await conversationService.blockUser(
        req.params.conversationId,
        req.params.userId,
        req.userId
      )

      res.status(200).json({
        message: 'User blocked successfully',
        blockedUserIds,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async unblockUser(req, res, next) {
    try {
      const blockedUserIds = await conversationService.unblockUser(
        req.params.conversationId,
        req.params.userId,
        req.userId
      )

      res.status(200).json({
        message: 'User unblocked successfully',
        blockedUserIds,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async leaveConversation(req, res, next) {
    try {
      const result = await conversationService.leaveGroupConversation(
        req.params.conversationId,
        req.userId,
        { leaveSilently: req.body?.leaveSilently }
      )

      res.status(200).json({
        message: 'Left conversation successfully',
        ...result,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async dissolveConversation(req, res, next) {
    try {
      const result = await conversationService.dissolveGroupConversation(
        req.params.conversationId,
        req.userId
      )

      res.status(200).json({
        message: 'Group dissolved successfully',
        ...result,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }
}

export default new ConversationController()
