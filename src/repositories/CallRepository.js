import { GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../db/dynamodb.js'

const TABLE_NAME = process.env.DYNAMODB_CALL_SESSIONS_TABLE || 'tixchat-call-sessions'
const CONVERSATION_STATUS_INDEX = process.env.DYNAMODB_CALL_CONVERSATION_STATUS_INDEX || ''

class CallRepository {
  async create(callData) {
    const item = {
      ...callData,
      createdAt: callData.createdAt || Date.now(),
      updatedAt: callData.updatedAt || Date.now(),
    }

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }))

      return item
    } catch (error) {
      throw new Error(`Failed to create call session: ${error.message}`)
    }
  }

  async findById(callId) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { callId },
      }))

      return result.Item || null
    } catch (error) {
      throw new Error(`Failed to find call session: ${error.message}`)
    }
  }

  async update(callId, updates = {}) {
    const updateExpressions = []
    const expressionAttributeValues = {}
    const expressionAttributeNames = {}

    Object.entries({ ...updates, updatedAt: Date.now() }).forEach(([key, value]) => {
      if (key === 'callId') return

      const safeName = `#${key}`
      const safeValue = `:${key}`

      updateExpressions.push(`${safeName} = ${safeValue}`)
      expressionAttributeValues[safeValue] = value
      expressionAttributeNames[safeName] = key
    })

    if (updateExpressions.length === 0) {
      return this.findById(callId)
    }

    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { callId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
      }))

      return this.findById(callId)
    } catch (error) {
      throw new Error(`Failed to update call session: ${error.message}`)
    }
  }

  async findActiveByConversation(conversationId) {
    if (CONVERSATION_STATUS_INDEX) {
      try {
        const statuses = ['ringing', 'accepted']
        for (const status of statuses) {
          const result = await docClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: CONVERSATION_STATUS_INDEX,
            KeyConditionExpression: 'conversationId = :conversationId AND #status = :status',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':conversationId': conversationId,
              ':status': status,
            },
            Limit: 1,
            ScanIndexForward: false,
          }))

          if (result.Items?.[0]) return result.Items[0]
        }

        return null
      } catch (error) {
        console.warn(`Call session GSI lookup failed, falling back to scan: ${error.message}`)
      }
    }

    try {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'conversationId = :conversationId AND #status IN (:ringing, :accepted)',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
          ':ringing': 'ringing',
          ':accepted': 'accepted',
        },
        Limit: 1,
      }))

      return result.Items?.[0] || null
    } catch (error) {
      throw new Error(`Failed to find active call session: ${error.message}`)
    }
  }
}

export default new CallRepository()
