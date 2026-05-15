/**
 * Conversation Model for DynamoDB
 * Table: Conversations
 * Primary Key: conversationId (UUID)
 * GSI: participants-index, lastMessageAt-index
 */

export class Conversation {
  constructor(data = {}) {
    this.conversationId = data.conversationId // UUID
    this.type = data.type // '1-1' or 'group'
    this.name = data.name || null // String (required for group)
    this.avatar = data.avatar || null // String (URL)
    this.participants = data.participants || [] // Array of userIds
    this.admin = data.admin || null // userId (required for group)
    this.lastMessage = data.lastMessage || null // messageId
    this.lastMessageAt = data.lastMessageAt || new Date().toISOString() // ISO string
    this.isArchived = data.isArchived !== undefined ? data.isArchived : false // Boolean
    this.description = data.description || '' // String, max 500 chars
    this.createdAt = data.createdAt || new Date().toISOString() // ISO string
    this.updatedAt = data.updatedAt || new Date().toISOString() // ISO string
  }

  // Validation
  static validate(conversation) {
    const errors = []
    
    if (!conversation.type || !['1-1', 'group'].includes(conversation.type)) {
      errors.push('Type must be either "1-1" or "group"')
    }
    
    if (conversation.type === 'group' && !conversation.name) {
      errors.push('Name is required for group conversations')
    }
    
    if (!conversation.participants || conversation.participants.length === 0) {
      errors.push('At least one participant is required')
    }
    
    if (conversation.type === 'group' && !conversation.admin) {
      errors.push('Admin is required for group conversations')
    }
    
    if (conversation.description && conversation.description.length > 500) {
      errors.push('Description must not exceed 500 characters')
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  // Convert to DynamoDB format
  toDynamoDB() {
    return {
      conversationId: this.conversationId,
      type: this.type,
      name: this.name,
      avatar: this.avatar,
      participants: this.participants,
      admin: this.admin,
      lastMessage: this.lastMessage,
      lastMessageAt: this.lastMessageAt,
      isArchived: this.isArchived,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }

  // Convert from DynamoDB format
  static fromDynamoDB(data) {
    return new Conversation(data)
  }
}
