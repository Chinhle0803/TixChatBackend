import messageService from '../services/MessageService.js'
import { sendMessageValidation } from '../utils/validation.js'
import { getIO } from '../utils/ioInstance.js'
import S3Service from '../services/S3Service.js'

const getMessageAttachmentType = (mimeType = '') => {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}

const inferMimeTypeByFileName = (fileName = '') => {
  const extension = String(fileName).split('.').pop()?.toLowerCase()

  const mimeByExtension = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
  }

  return mimeByExtension[extension] || 'application/octet-stream'
}

const sanitizeFileName = (value = '') =>
  String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()

export class MessageController {
  async getUnreadCounts(req, res, next) {
    try {
      const unreadByConversation = await messageService.getUnreadCountsForUser(req.userId)
      res.status(200).json({ unreadByConversation })
    } catch (err) {
      next(err)
    }
  }

  async sendMessage(req, res, next) {
    try {
      const { error, value } = sendMessageValidation(req.body)
      if (error) {
        return res.status(400).json({ error: error.details[0].message })
      }

      const message = await messageService.sendMessage(
        value.conversationId,
        req.userId,
        value.content,
        value.replyTo,
        {
          clientMessageId: value.clientMessageId,
          type: value.type || 'text',
        }
      )

      res.status(201).json({
        message: 'Message sent successfully',
        data: message,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async sendAttachmentMessage(req, res, next) {
    try {
  const { conversationId, content = '', replyTo = null, clientMessageId = null } = req.body

      if (!conversationId) {
        return res.status(400).json({ error: 'Conversation ID is required' })
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Attachment file is required' })
      }

      const attachmentType = getMessageAttachmentType(req.file.mimetype)
      const uploadResult = await S3Service.uploadMessageAttachment({
        conversationId,
        senderId: req.userId,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
      })

      const attachments = [
        {
          type: attachmentType,
          url: uploadResult.url,
          size: req.file.size,
          name: req.file.originalname,
          mimeType: req.file.mimetype,
        },
      ]

      const message = await messageService.sendMessage(
        conversationId,
        req.userId,
        content,
        replyTo,
        {
          type: attachmentType,
          attachments,
          clientMessageId,
        }
      )

      res.status(201).json({
        message: 'Attachment message sent successfully',
        data: message,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async forwardAttachmentByUrl(req, res, next) {
    try {
      const {
        conversationId,
        sourceUrl,
        content = '',
        replyTo = null,
        clientMessageId = null,
        fileName = '',
        mimeType = '',
      } = req.body || {}

      if (!conversationId) {
        return res.status(400).json({ error: 'Conversation ID is required' })
      }

      if (!sourceUrl || typeof sourceUrl !== 'string') {
        return res.status(400).json({ error: 'Source URL is required' })
      }

      let normalizedUrl
      try {
        normalizedUrl = new URL(sourceUrl)
      } catch (_) {
        return res.status(400).json({ error: 'Source URL is invalid' })
      }

      if (!['http:', 'https:'].includes(normalizedUrl.protocol)) {
        return res.status(400).json({ error: 'Source URL protocol is not supported' })
      }

      const response = await fetch(normalizedUrl.toString())
      if (!response.ok) {
        return res.status(400).json({
          error: `Cannot download source attachment (${response.status})`,
        })
      }

      const arrayBuffer = await response.arrayBuffer()
      const fileBuffer = Buffer.from(arrayBuffer)

      if (!fileBuffer.length) {
        return res.status(400).json({ error: 'Downloaded attachment is empty' })
      }

      const fallbackName = normalizedUrl.pathname.split('/').pop() || `forwarded-${Date.now()}`
      const safeFileName = sanitizeFileName(fileName || fallbackName) || `forwarded-${Date.now()}`

      const resolvedMimeType =
        String(mimeType || '').trim() ||
        String(response.headers.get('content-type') || '').split(';')[0] ||
        inferMimeTypeByFileName(safeFileName)

      const attachmentType = getMessageAttachmentType(resolvedMimeType)
      const uploadResult = await S3Service.uploadMessageAttachment({
        conversationId,
        senderId: req.userId,
        fileBuffer,
        fileName: safeFileName,
        mimeType: resolvedMimeType,
      })

      const attachments = [
        {
          type: attachmentType,
          url: uploadResult.url,
          size: fileBuffer.length,
          name: safeFileName,
          mimeType: resolvedMimeType,
        },
      ]

      const message = await messageService.sendMessage(
        conversationId,
        req.userId,
        content,
        replyTo,
        {
          type: attachmentType,
          attachments,
          clientMessageId,
        }
      )

      return res.status(201).json({
        message: 'Attachment forwarded successfully',
        data: message,
      })
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
  }

  async getConversationMessages(req, res, next) {
    try {
      const { conversationId } = req.params
      const { limit = 50, lastEvaluatedKey = null } = req.query

      let parsedLastEvaluatedKey = null
      if (lastEvaluatedKey && typeof lastEvaluatedKey === 'string') {
        try {
          parsedLastEvaluatedKey = JSON.parse(lastEvaluatedKey)
        } catch (_) {
          parsedLastEvaluatedKey = null
        }
      } else if (lastEvaluatedKey && typeof lastEvaluatedKey === 'object') {
        parsedLastEvaluatedKey = lastEvaluatedKey
      }

      const result = await messageService.getConversationMessages(
        conversationId,
        req.userId,
        parseInt(limit),
        parsedLastEvaluatedKey
      )

      res.status(200).json({ 
        messages: result.messages,
        lastEvaluatedKey: result.lastEvaluatedKey
      })
    } catch (err) {
      next(err)
    }
  }

  async markAsDelivered(req, res, next) {
    try {
      const { conversationId, messageId } = req.params
      const message = await messageService.markAsDeliveredInConversation(
        conversationId,
        messageId,
        req.userId
      )

      res.status(200).json({
        message: 'Message marked as delivered',
        data: message,
      })
    } catch (err) {
      next(err)
    }
  }

  async markAsSeen(req, res, next) {
    try {
      const { conversationId } = req.params
      await messageService.markAsSeen(conversationId, req.userId)

      res.status(200).json({ message: 'Messages marked as seen' })
    } catch (err) {
      next(err)
    }
  }

  async editMessage(req, res, next) {
    try {
      const { conversationId, messageId } = req.params
      const { content } = req.body

      if (!content) {
        return res.status(400).json({ error: 'Content is required' })
      }

      const message = await messageService.editMessage(
        conversationId,
        messageId,
        req.userId,
        content
      )

      const io = getIO()
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:edited', {
          message,
        })
      }

      res.status(200).json({
        message: 'Message edited successfully',
        data: message,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async deleteMessage(req, res, next) {
    try {
      const { conversationId, messageId } = req.params
      const result = await messageService.deleteMessage(
        conversationId,
        messageId,
        req.userId
      )

      const io = getIO()
      if (io) {
        io.to(`user:${req.userId}`).emit('message:hidden', {
          messageId,
          conversationId,
          hiddenBy: req.userId,
        })
      }

      res.status(200).json({
        message: 'Message deleted successfully',
        data: { ...result, deleteType: 'self' },
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async addEmoji(req, res, next) {
    try {
      const { conversationId, messageId } = req.params
      const { emoji } = req.body

      if (!emoji) {
        return res.status(400).json({ error: 'Emoji is required' })
      }

      const message = await messageService.addEmoji(
        conversationId,
        messageId,
        req.userId,
        emoji
      )

      const io = getIO()
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:emoji', {
          message,
        })
      }

      res.status(200).json({
        message: 'Emoji added successfully',
        data: message,
      })
    } catch (err) {
      next(err)
    }
  }

  async removeEmoji(req, res, next) {
    try {
      const { conversationId, messageId } = req.params
      const { emoji } = req.body

      if (!emoji) {
        return res.status(400).json({ error: 'Emoji is required' })
      }

      const message = await messageService.removeEmoji(
        conversationId,
        messageId,
        req.userId,
        emoji
      )

      const io = getIO()
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:emoji', {
          message,
        })
      }

      res.status(200).json({
        message: 'Emoji removed successfully',
        data: message,
      })
    } catch (err) {
      next(err)
    }
  }

  async deleteMessageForAll(req, res, next) {
    try {
      const { conversationId, messageId } = req.params

      const result = await messageService.deleteMessageForAll(
        conversationId,
        messageId,
        req.userId
      )

      const io = getIO()
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:deleted', {
          messageId,
          isDeleted: true,
        })
      }

      res.status(200).json({
        message: 'Message deleted for everyone',
        data: result,
      })
    } catch (err) {
      res.status(403).json({ error: err.message })
    }
  }
}

export default new MessageController()
