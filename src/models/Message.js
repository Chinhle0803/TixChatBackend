/**
 * Message Model for DynamoDB
 * Table: Messages
 * Primary Key: messageId (UUID)
 * Composite Key: conversationId (GSI)
 */

export class Message {
  constructor(data = {}) {
    this.messageId = data.messageId // UUID
    this.conversationId = data.conversationId // UUID
    this.senderId = data.senderId // userId
    this.content = data.content // String, max 5000 chars
    this.attachments = data.attachments || [] // Array of {type, url, size, name}
    this.status = data.status || 'sent' // 'sent', 'delivered', 'seen'
    this.seenBy = data.seenBy || [] // Array of userIds
    this.deliveredTo = data.deliveredTo || [] // Array of userIds
    this.replyTo = data.replyTo || null // messageId
    this.emoji = data.emoji || [] // Array of {emoji, users: []}
    this.isEdited = data.isEdited !== undefined ? data.isEdited : false // Boolean
    this.editedAt = data.editedAt || null // ISO string
    this.isDeleted = data.isDeleted !== undefined ? data.isDeleted : false // Boolean (global delete)
    this.deletedAt = data.deletedAt || null // ISO string
    this.deletedBy = data.deletedBy || {} // Map<userId, timestamp> (per-user delete)
    this.createdAt = data.createdAt || new Date().toISOString() // ISO string
    this.updatedAt = data.updatedAt || new Date().toISOString() // ISO string
  }

  // Validation
  static validate(message) {
    const errors = []
    
    if (!message.conversationId) {
      errors.push('Conversation ID is required')
    }
    
    if (!message.senderId) {
      errors.push('Sender ID is required')
    }
    
    if (!message.content || message.content.trim().length === 0) {
      errors.push('Message content is required')
    }
    
    if (message.content && message.content.length > 5000) {
      errors.push('Message content must not exceed 5000 characters')
    }
    
    if (message.status && !['sent', 'delivered', 'seen'].includes(message.status)) {
      errors.push('Status must be one of: sent, delivered, seen')
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  // Convert to DynamoDB format
  toDynamoDB() {
    return {
      messageId: this.messageId,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.content,
      attachments: this.attachments,
      status: this.status,
      seenBy: this.seenBy,
      deliveredTo: this.deliveredTo,
      replyTo: this.replyTo,
      emoji: this.emoji,
      isEdited: this.isEdited,
      editedAt: this.editedAt,
      isDeleted: this.isDeleted,
      deletedAt: this.deletedAt,
      deletedBy: this.deletedBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }

  // Convert from DynamoDB format
  static fromDynamoDB(data) {
    return new Message(data)
  }
}
