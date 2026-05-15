/**
 * Participant Model for DynamoDB
 * Table: Participants
 * Primary Key: participantId (UUID)
 * Composite Key: conversationId + userId (GSI)
 */

export class Participant {
  constructor(data = {}) {
    this.participantId = data.participantId // UUID
    this.conversationId = data.conversationId // UUID
    this.userId = data.userId // userId
    this.role = data.role || 'member' // 'admin' or 'member'
    this.isMuted = data.isMuted !== undefined ? data.isMuted : false // Boolean
    this.lastReadMessageId = data.lastReadMessageId || null // messageId
    this.lastReadAt = data.lastReadAt || new Date().toISOString() // ISO string
    this.joinedAt = data.joinedAt || new Date().toISOString() // ISO string
    this.leftAt = data.leftAt || null // ISO string
    this.createdAt = data.createdAt || new Date().toISOString() // ISO string
    this.updatedAt = data.updatedAt || new Date().toISOString() // ISO string
  }

  // Validation
  static validate(participant) {
    const errors = []
    
    if (!participant.conversationId) {
      errors.push('Conversation ID is required')
    }
    
    if (!participant.userId) {
      errors.push('User ID is required')
    }
    
    if (participant.role && !['admin', 'member'].includes(participant.role)) {
      errors.push('Role must be either "admin" or "member"')
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  // Convert to DynamoDB format
  toDynamoDB() {
    return {
      participantId: this.participantId,
      conversationId: this.conversationId,
      userId: this.userId,
      role: this.role,
      isMuted: this.isMuted,
      lastReadMessageId: this.lastReadMessageId,
      lastReadAt: this.lastReadAt,
      joinedAt: this.joinedAt,
      leftAt: this.leftAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }

  // Convert from DynamoDB format
  static fromDynamoDB(data) {
    return new Participant(data)
  }
}
