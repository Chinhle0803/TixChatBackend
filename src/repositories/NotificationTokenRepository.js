import { DeleteCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../db/dynamodb.js'

const TABLE_NAME = process.env.DYNAMODB_NOTIFICATION_TOKENS_TABLE || 'tixchat-notification-tokens'

class NotificationTokenRepository {
  async upsert({ userId, token, platform = 'expo', deviceId = '', enabled = true }) {
    const now = Date.now()
    const item = {
      token,
      userId,
      platform,
      deviceId,
      enabled,
      createdAt: now,
      updatedAt: now,
    }

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }))

    return item
  }

  async delete(token, userId) {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { token },
      ConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    }))

    return true
  }

  async disable(token) {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { token },
      UpdateExpression: 'SET enabled = :enabled, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':enabled': false,
        ':updatedAt': Date.now(),
      },
    }))

    return true
  }

  async findEnabledByUserIds(userIds = []) {
    const wanted = new Set((userIds || []).map((id) => String(id)).filter(Boolean))
    if (wanted.size === 0) return []

    const tokens = []
    let lastEvaluatedKey = null

    do {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey: lastEvaluatedKey || undefined,
        FilterExpression: 'enabled = :enabled',
        ExpressionAttributeValues: {
          ':enabled': true,
        },
      }))

      ;(result.Items || []).forEach((item) => {
        if (wanted.has(String(item?.userId || ''))) {
          tokens.push(item)
        }
      })

      lastEvaluatedKey = result.LastEvaluatedKey
    } while (lastEvaluatedKey)

    return tokens
  }
}

export default new NotificationTokenRepository()
