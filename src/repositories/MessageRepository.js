import { GetCommand, PutCommand, UpdateCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../db/dynamodb.js'
import { v4 as uuidv4 } from 'uuid'

const TABLE_NAME = 'tixchat-messages'

class MessageRepository {
  /**
   * Create a new message
   */
  async create(messageData) {
    const messageId = uuidv4()
    const timestamp = Date.now()

    const item = {
      conversationId: messageData.conversationId,
      messageId,
      senderId: messageData.senderId || messageData.userId,
      content: messageData.content,
      type: messageData.type || 'text',
      attachments: messageData.attachments || [],
      status: messageData.status || 'sent',
      seenBy: messageData.seenBy || [],
      deliveredTo: messageData.deliveredTo || [],
      replyTo: messageData.replyTo || null,
      clientMessageId: messageData.clientMessageId || null,
      metadata: messageData.metadata || null,
      emoji: messageData.emoji || [],
      isEdited: false,
      editedAt: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }))

      return item
    } catch (error) {
      throw new Error(`Failed to create message: ${error.message}`)
    }
  }

  /**
   * Get message by ID
   */
  async findById(conversationId, messageId) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          conversationId,
          messageId,
        },
      }))

      return result.Item || null
    } catch (error) {
      throw new Error(`Failed to find message: ${error.message}`)
    }
  }

  /**
   * Get messages by conversation (paginated)
   */
  async getByConversation(conversationId, limit = 50, lastEvaluatedKey = null) {
    try {
      const params = {
        TableName: TABLE_NAME,
        IndexName: 'conversationId-createdAt-index',
        KeyConditionExpression: 'conversationId = :conversationId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
        },
        ScanIndexForward: false, // Sort descending (newest first)
        Limit: limit,
      }

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey
      }

      const result = await docClient.send(new QueryCommand(params))

      return {
        messages: result.Items || [],
        lastEvaluatedKey: result.LastEvaluatedKey,
      }
    } catch (error) {
      throw new Error(`Failed to get messages: ${error.message}`)
    }
  }

  /**
   * Get messages by user (using GSI)
   */
  async getByUser(userId, limit = 50, lastEvaluatedKey = null) {
    try {
      const params = {
        TableName: TABLE_NAME,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ScanIndexForward: false,
        Limit: limit,
      }

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey
      }

      const result = await docClient.send(new QueryCommand(params))

      return {
        messages: result.Items || [],
        lastEvaluatedKey: result.LastEvaluatedKey,
      }
    } catch (error) {
      throw new Error(`Failed to get user messages: ${error.message}`)
    }
  }

  /**
   * Update message
   */
  async update(conversationId, messageId, updates) {
    const updateExpressions = []
    const expressionAttributeValues = {}
    const expressionAttributeNames = {}

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'conversationId' || key === 'messageId') return

      const safeName = `#${key}`
      const safeValue = `:${key}`

      updateExpressions.push(`${safeName} = ${safeValue}`)
      expressionAttributeValues[safeValue] = value
      expressionAttributeNames[safeName] = key
    })

    if (updateExpressions.length === 0) {
      return this.findById(conversationId, messageId)
    }

    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          conversationId,
          messageId,
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
      }))

      return this.findById(conversationId, messageId)
    } catch (error) {
      throw new Error(`Failed to update message: ${error.message}`)
    }
  }

  /**
   * Edit message content
   */
  async edit(conversationId, messageId, newContent) {
    return this.update(conversationId, messageId, {
      content: newContent,
      edited: true,
      editedAt: Date.now(),
    })
  }

  /**
   * Add reaction to message
   */
  async addReaction(conversationId, messageId, emoji, userId) {
    try {
      const message = await this.findById(conversationId, messageId)
      const reactions = message.reactions || {}

      if (!reactions[emoji]) {
        reactions[emoji] = []
      }

      if (!reactions[emoji].includes(userId)) {
        reactions[emoji].push(userId)
      }

      return this.update(conversationId, messageId, { reactions })
    } catch (error) {
      throw new Error(`Failed to add reaction: ${error.message}`)
    }
  }

  /**
   * Remove reaction from message
   */
  async removeReaction(conversationId, messageId, emoji, userId) {
    try {
      const message = await this.findById(conversationId, messageId)
      const reactions = message.reactions || {}

      if (reactions[emoji]) {
        reactions[emoji] = reactions[emoji].filter(id => id !== userId)

        if (reactions[emoji].length === 0) {
          delete reactions[emoji]
        }
      }

      return this.update(conversationId, messageId, { reactions })
    } catch (error) {
      throw new Error(`Failed to remove reaction: ${error.message}`)
    }
  }

  /**
   * Soft delete message (mark as deleted)
   */
  async delete(conversationId, messageId) {
    return this.update(conversationId, messageId, {
      deletedAt: Date.now(),
    })
  }

  /**
   * Hard delete message (permanently remove)
   */
  async hardDelete(conversationId, messageId) {
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          conversationId,
          messageId,
        },
      }))

      return true
    } catch (error) {
      throw new Error(`Failed to delete message: ${error.message}`)
    }
  }

  /**
   * Soft delete message (mark as deleted, keep for other participants to see)
   */
  async softDelete(conversationId, messageId) {
    try {
      const now = new Date().toISOString()
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          conversationId,
          messageId,
        },
        UpdateExpression: 'SET isDeleted = :isDeleted, deletedAt = :deletedAt, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':isDeleted': true,
          ':deletedAt': now,
          ':updatedAt': now,
        },
      }))

      return true
    } catch (error) {
      throw new Error(`Failed to soft delete message: ${error.message}`)
    }
  }

  /**
   * Mark message as deleted for a specific user only (per-user soft delete)
   */
  async deleteForUser(conversationId, messageId, userId) {
    try {
      const now = Date.now()
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          conversationId,
          messageId,
        },
        UpdateExpression: 'SET deletedBy.#userId = :ts, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#userId': userId,
        },
        ExpressionAttributeValues: {
          ':ts': now,
          ':updatedAt': now,
        },
      }))

      return true
    } catch (error) {
      throw new Error(`Failed to delete message for user: ${error.message}`)
    }
  }

  /**
   * Get message count in conversation
   */
  async getConversationMessageCount(conversationId) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'conversationId = :conversationId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
        },
        Select: 'COUNT',
      }))

      return result.Count || 0
    } catch (error) {
      throw new Error(`Failed to get message count: ${error.message}`)
    }
  }

  /**
   * Search messages in conversation (basic)
   */
  async search(conversationId, keyword, limit = 20) {
    try {
      // Note: This is a basic implementation. For production, use DynamoDB's 
      // FilterExpression with CONTAINS, or use Elasticsearch
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'conversationId = :conversationId',
        FilterExpression: 'contains(#content, :keyword) AND attribute_not_exists(deletedAt)',
        ExpressionAttributeNames: {
          '#content': 'content',
        },
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
          ':keyword': keyword,
        },
        Limit: limit,
      }))

      return result.Items || []
    } catch (error) {
      throw new Error(`Failed to search messages: ${error.message}`)
    }
  }

  /**
   * Get messages with pagination
   */
  async getPaginated(conversationId, pageSize = 50, pageToken = null) {
    try {
      const { messages, lastEvaluatedKey } = await this.getByConversation(
        conversationId,
        pageSize,
        pageToken
      )

      return {
        messages: messages.filter(m => !m.isDeleted), // Filter globally deleted
        nextPageToken: lastEvaluatedKey,
      }
    } catch (error) {
      throw new Error(`Failed to get paginated messages: ${error.message}`)
    }
  }

  /**
   * Delete all messages in conversation
   */
  async deleteByConversationId(conversationId) {
    try {
      let lastEvaluatedKey = null

      do {
        const { messages, lastEvaluatedKey: nextKey } = await this.getByConversation(
          conversationId,
          100,
          lastEvaluatedKey
        )

        for (const message of messages || []) {
          await this.hardDelete(conversationId, message.messageId)
        }

        lastEvaluatedKey = nextKey || null
      } while (lastEvaluatedKey)

      return true
    } catch (error) {
      throw new Error(`Failed to delete conversation messages: ${error.message}`)
    }
  }

  /**
   * Backward-compatible alias used by older code paths
   */
  async findByConversationId(conversationId, limit = 50, lastEvaluatedKey = null) {
    const { messages } = await this.getByConversation(conversationId, limit, lastEvaluatedKey)
    return messages || []
  }

  /**
   * Delete all messages in conversation (legacy alias)
   */
  async deleteAllByConversationId(conversationId) {
    return this.deleteByConversationId(conversationId)
  }
}

export default new MessageRepository()
