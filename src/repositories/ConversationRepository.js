import { GetCommand, PutCommand, UpdateCommand, QueryCommand, ScanCommand, DeleteCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../db/dynamodb.js'
import { v4 as uuidv4 } from 'uuid'

const TABLE_NAME = 'tixchat-conversations'

class ConversationRepository {
  /**
   * Create a new conversation
   */
  async create(conversationData) {
    const conversationId = uuidv4()
    const timestamp = Date.now()

    const item = {
      conversationId,
      creatorId: conversationData.creatorId,
      name: conversationData.name,
      description: conversationData.description || '',
      type: conversationData.type || 'group', // 'direct' or 'group'
      avatar: conversationData.avatar || null,
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
      throw new Error(`Failed to create conversation: ${error.message}`)
    }
  }

  /**
   * Get conversation by ID
   */
  async findById(conversationId) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { conversationId },
      }))

      return result.Item || null
    } catch (error) {
      throw new Error(`Failed to find conversation: ${error.message}`)
    }
  }

  /**
   * Get conversations by ids using batch operations (max 100 keys/request)
   */
  async findByIds(conversationIds = []) {
    try {
      const uniqueIds = [...new Set((conversationIds || []).filter(Boolean))]
      if (uniqueIds.length === 0) return []

      const chunks = []
      for (let i = 0; i < uniqueIds.length; i += 100) {
        chunks.push(uniqueIds.slice(i, i + 100))
      }

      const allItems = []

      for (const chunk of chunks) {
        const response = await docClient.send(new BatchGetCommand({
          RequestItems: {
            [TABLE_NAME]: {
              Keys: chunk.map((conversationId) => ({ conversationId })),
            },
          },
        }))

        allItems.push(...(response?.Responses?.[TABLE_NAME] || []))

        let unprocessedKeys = response?.UnprocessedKeys?.[TABLE_NAME]?.Keys || []
        let retryCount = 0

        while (unprocessedKeys.length > 0 && retryCount < 3) {
          const retryResponse = await docClient.send(new BatchGetCommand({
            RequestItems: {
              [TABLE_NAME]: {
                Keys: unprocessedKeys,
              },
            },
          }))

          allItems.push(...(retryResponse?.Responses?.[TABLE_NAME] || []))
          unprocessedKeys = retryResponse?.UnprocessedKeys?.[TABLE_NAME]?.Keys || []
          retryCount += 1
        }
      }

      return allItems
    } catch (error) {
      throw new Error(`Failed to batch find conversations: ${error.message}`)
    }
  }

  /**
   * Get conversations by participant (using GSI)
   * Note: Queries conversations that include a specific participant
   */
  async getByParticipant(participantId, limit = 50, lastEvaluatedKey = null) {
    try {
      const params = {
        TableName: TABLE_NAME,
        IndexName: 'participants-index',
        KeyConditionExpression: 'participants = :participantId',
        ExpressionAttributeValues: {
          ':participantId': participantId,
        },
        ScanIndexForward: false, // Sort descending (newest first)
        Limit: limit,
      }

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey
      }

      const result = await docClient.send(new QueryCommand(params))

      return {
        conversations: result.Items || [],
        lastEvaluatedKey: result.LastEvaluatedKey,
      }
    } catch (error) {
      throw new Error(`Failed to get participant conversations: ${error.message}`)
    }
  }

  /**
   * Get conversations created by user (using scan)
   * Note: Since there's no creatorId-index, we scan and filter by creatorId
   */
  async getByCreator(creatorId, limit = 50, lastEvaluatedKey = null) {
    try {
      const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'creatorId = :creatorId',
        ExpressionAttributeValues: {
          ':creatorId': creatorId,
        },
        Limit: limit,
      }

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey
      }

      const result = await docClient.send(new ScanCommand(params))

      return {
        conversations: result.Items || [],
        lastEvaluatedKey: result.LastEvaluatedKey,
      }
    } catch (error) {
      throw new Error(`Failed to get creator conversations: ${error.message}`)
    }
  }

  /**
   * Update conversation
   */
  async update(conversationId, updates) {
    const updateExpressions = []
    const expressionAttributeValues = {}
    const expressionAttributeNames = {}

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'conversationId') return

      const safeName = `#${key}`
      const safeValue = `:${key}`

      updateExpressions.push(`${safeName} = ${safeValue}`)
      expressionAttributeValues[safeValue] = value
      expressionAttributeNames[safeName] = key
    })

    // Only add updatedAt if not already in updates
    if (!updates.updatedAt) {
      updateExpressions.push('#updatedAt = :updatedAt')
      expressionAttributeValues[':updatedAt'] = Date.now()
      expressionAttributeNames['#updatedAt'] = 'updatedAt'
    }

    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { conversationId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
      }))

      return this.findById(conversationId)
    } catch (error) {
      throw new Error(`Failed to update conversation: ${error.message}`)
    }
  }

  /**
   * Delete conversation
   */
  async delete(conversationId) {
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { conversationId },
      }))

      return true
    } catch (error) {
      throw new Error(`Failed to delete conversation: ${error.message}`)
    }
  }

  /**
   * Get all conversations (paginated)
   */
  async getAll(limit = 50, lastEvaluatedKey = null) {
    try {
      const params = {
        TableName: TABLE_NAME,
        Limit: limit,
      }

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey
      }

      const result = await docClient.send(new ScanCommand(params))

      return {
        conversations: result.Items || [],
        lastEvaluatedKey: result.LastEvaluatedKey,
      }
    } catch (error) {
      throw new Error(`Failed to get all conversations: ${error.message}`)
    }
  }

  /**
   * Search conversations by name
   */
  async searchByName(name, limit = 20) {
    try {
      // Note: This scans all conversations and filters. For better performance,
      // consider using Elasticsearch or DynamoDB Streams with Lambda
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'contains(#name, :name)',
        ExpressionAttributeNames: {
          '#name': 'name',
        },
        ExpressionAttributeValues: {
          ':name': name,
        },
        Limit: limit,
      }))

      return result.Items || []
    } catch (error) {
      throw new Error(`Failed to search conversations: ${error.message}`)
    }
  }

  /**
   * Get conversations count
   */
  async getConversationCount() {
    try {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        Select: 'COUNT',
      }))

      return result.Count || 0
    } catch (error) {
      throw new Error(`Failed to get conversation count: ${error.message}`)
    }
  }
}

export default new ConversationRepository()
