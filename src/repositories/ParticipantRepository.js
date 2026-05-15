import { GetCommand, PutCommand, UpdateCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../db/dynamodb.js'
import { v4 as uuidv4 } from 'uuid'

const TABLE_NAME = 'tixchat-participants'

class ParticipantRepository {
  /**
   * Add participant to conversation
   */
  async create(participantData) {
    const timestamp = Date.now()
    const participantId = participantData.participantId || uuidv4()

    const item = {
      participantId, // Primary key
      conversationId: participantData.conversationId,
      userId: participantData.userId,
      role: participantData.role || 'member', // 'admin' or 'member'
      joinedAt: timestamp,
      leftAt: null,
      clearedAt: null,
    }

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }))

      return item
    } catch (error) {
      throw new Error(`Failed to add participant: ${error.message}`)
    }
  }

  /**
   * Get participant by conversationId and userId (using GSI)
   */
  async findById(conversationId, userId) {
    try {
      const params = {
        TableName: TABLE_NAME,
        IndexName: 'conversationId-userId-index',
        KeyConditionExpression: 'conversationId = :conversationId AND userId = :userId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
          ':userId': userId,
        },
        Limit: 1,
      }

      const result = await docClient.send(new QueryCommand(params))

      return result.Items?.[0] || null
    } catch (error) {
      throw new Error(`Failed to find participant: ${error.message}`)
    }
  }

  /**
   * Alias for findById
   */
  async findOne(conversationId, userId) {
    return this.findById(conversationId, userId)
  }

  /**
   * Get all participants in conversation (using GSI)
   */
  async findByConversationId(conversationId, limit = 100, lastEvaluatedKey = null) {
    try {
      const params = {
        TableName: TABLE_NAME,
        IndexName: 'conversationId-userId-index',
        KeyConditionExpression: 'conversationId = :conversationId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
        },
        Limit: limit,
      }

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey
      }

      const result = await docClient.send(new QueryCommand(params))

      return result.Items || []
    } catch (error) {
      throw new Error(`Failed to get conversation participants: ${error.message}`)
    }
  }

  /**
   * Get all conversations for a user (using GSI)
   */
  async findByUserId(userId, limit = 100, lastEvaluatedKey = null) {
    try {
      const params = {
        TableName: TABLE_NAME,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        Limit: limit,
      }

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey
      }

      const result = await docClient.send(new QueryCommand(params))

      return result.Items || []
    } catch (error) {
      throw new Error(`Failed to get user conversations: ${error.message}`)
    }
  }

  /**
   * Get all participants in conversation - old name for backward compatibility
   */
  async getByConversation(conversationId, limit = 100, lastEvaluatedKey = null) {
    return this.findByConversationId(conversationId, limit, lastEvaluatedKey)
  }

  /**
   * Get all conversations for a user - old name for backward compatibility
   */
  async getByUser(userId, limit = 100, lastEvaluatedKey = null) {
    return this.findByUserId(userId, limit, lastEvaluatedKey)
  }

  /**
   * Update participant role
   */
  async updateRole(conversationId, userId, newRole) {
    try {
      // First find the participant to get participantId
      const participant = await this.findById(conversationId, userId)
      if (!participant) {
        throw new Error('Participant not found')
      }

      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          participantId: participant.participantId,
        },
        UpdateExpression: 'SET #role = :role',
        ExpressionAttributeNames: {
          '#role': 'role',
        },
        ExpressionAttributeValues: {
          ':role': newRole,
        },
      }))

      return this.findById(conversationId, userId)
    } catch (error) {
      throw new Error(`Failed to update participant role: ${error.message}`)
    }
  }

  /**
   * Mark participant as left
   */
  async markAsLeft(conversationId, userId) {
    try {
      // First find the participant to get participantId
      const participant = await this.findById(conversationId, userId)
      if (!participant) {
        throw new Error('Participant not found')
      }

      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          participantId: participant.participantId,
        },
        UpdateExpression: 'SET leftAt = :leftAt',
        ExpressionAttributeValues: {
          ':leftAt': Date.now(),
        },
      }))

      return this.findById(conversationId, userId)
    } catch (error) {
      throw new Error(`Failed to mark participant as left: ${error.message}`)
    }
  }

  /**
   * Clear conversation history for participant (user-scoped delete)
   */
  async clearConversationForUser(conversationId, userId) {
    try {
      const participant = await this.findById(conversationId, userId)
      if (!participant) {
        throw new Error('Participant not found')
      }

      if (participant.leftAt) {
        throw new Error('Participant has left this conversation')
      }

      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          participantId: participant.participantId,
        },
        UpdateExpression: 'SET clearedAt = :clearedAt',
        ExpressionAttributeValues: {
          ':clearedAt': Date.now(),
        },
      }))

      return this.findById(conversationId, userId)
    } catch (error) {
      throw new Error(`Failed to clear conversation for user: ${error.message}`)
    }
  }

  /**
   * Update participant read state
   */
  async updateReadState(conversationId, userId, lastReadMessageId = null, lastReadAt = Date.now()) {
    try {
      const participant = await this.findById(conversationId, userId)
      if (!participant) {
        throw new Error('Participant not found')
      }

      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          participantId: participant.participantId,
        },
        UpdateExpression: 'SET lastReadMessageId = :lastReadMessageId, lastReadAt = :lastReadAt',
        ExpressionAttributeValues: {
          ':lastReadMessageId': lastReadMessageId,
          ':lastReadAt': Number(lastReadAt) || Date.now(),
        },
      }))

      return this.findById(conversationId, userId)
    } catch (error) {
      throw new Error(`Failed to update participant read state: ${error.message}`)
    }
  }

  /**
   * Reactivate participant who previously left conversation
   */
  async reactivateParticipant(conversationId, userId, clearFromTimestamp = null) {
    try {
      const participant = await this.findById(conversationId, userId)
      if (!participant) {
        throw new Error('Participant not found')
      }

      const effectiveClearAt = Math.max(
        Number(participant.clearedAt || 0),
        Number(clearFromTimestamp || 0)
      )

      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          participantId: participant.participantId,
        },
        UpdateExpression: 'SET leftAt = :leftAt, clearedAt = :clearedAt',
        ExpressionAttributeValues: {
          ':leftAt': null,
          ':clearedAt': effectiveClearAt || null,
        },
      }))

      return this.findById(conversationId, userId)
    } catch (error) {
      throw new Error(`Failed to reactivate participant: ${error.message}`)
    }
  }

  /**
   * Remove participant from conversation
   */
  async delete(conversationId, userId) {
    try {
      // First find the participant to get participantId
      const participant = await this.findById(conversationId, userId)
      if (!participant) {
        throw new Error('Participant not found')
      }

      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          participantId: participant.participantId,
        },
      }))

      return true
    } catch (error) {
      throw new Error(`Failed to remove participant: ${error.message}`)
    }
  }

  /**
   * Delete all participants in conversation
   */
  async deleteByConversationId(conversationId) {
    try {
      // Get all participants first
      const participants = await this.findByConversationId(conversationId, 1000)

      // Delete each one
      for (const participant of participants) {
        await this.delete(conversationId, participant.userId)
      }

      return true
    } catch (error) {
      throw new Error(`Failed to delete conversation participants: ${error.message}`)
    }
  }

  /**
   * Check if user is participant
   */
  async isParticipant(conversationId, userId) {
    try {
      const participant = await this.findById(conversationId, userId)
      return participant && !participant.leftAt
    } catch (error) {
      throw new Error(`Failed to check participant: ${error.message}`)
    }
  }

  /**
   * Get participant count in conversation
   */
  async getParticipantCount(conversationId) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'conversationId-userId-index',
        KeyConditionExpression: 'conversationId = :conversationId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
        },
        Select: 'COUNT',
      }))

      return result.Count || 0
    } catch (error) {
      throw new Error(`Failed to get participant count: ${error.message}`)
    }
  }

  /**
   * Get admins in conversation
   */
  async getAdmins(conversationId) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'conversationId-userId-index',
        KeyConditionExpression: 'conversationId = :conversationId',
        FilterExpression: '#role = :role AND attribute_not_exists(leftAt)',
        ExpressionAttributeNames: {
          '#role': 'role',
        },
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
          ':role': 'admin',
        },
      }))

      return result.Items || []
    } catch (error) {
      throw new Error(`Failed to get admins: ${error.message}`)
    }
  }

  /**
   * Check if user is admin
   */
  async isAdmin(conversationId, userId) {
    try {
      const participant = await this.findById(conversationId, userId)
      return participant && participant.role === 'admin' && !participant.leftAt
    } catch (error) {
      throw new Error(`Failed to check admin status: ${error.message}`)
    }
  }
}

export default new ParticipantRepository()
