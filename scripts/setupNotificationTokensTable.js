import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb'
import dotenv from 'dotenv'

dotenv.config()

const TABLE_NAME = process.env.DYNAMODB_NOTIFICATION_TOKENS_TABLE || 'tixchat-notification-tokens'

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  ...(process.env.DYNAMODB_LOCAL ? { endpoint: process.env.DYNAMODB_LOCAL } : {}),
})

const describeTable = async () => {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }))
    return response.Table
  } catch (error) {
    if (error?.name === 'ResourceNotFoundException') return null
    throw error
  }
}

const createTable = async () => {
  const existing = await describeTable()
  if (existing) {
    console.log(`Table already exists: ${TABLE_NAME}`)
    console.log(`Status: ${existing.TableStatus}`)
    return
  }

  try {
    console.log(`Creating DynamoDB table: ${TABLE_NAME}`)
    await client.send(new CreateTableCommand({
      TableName: TABLE_NAME,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'token', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'token', KeyType: 'HASH' },
      ],
      Tags: [
        { Key: 'Application', Value: 'TixChat' },
        { Key: 'Purpose', Value: 'NotificationTokens' },
      ],
    }))
  } catch (error) {
    if (!(error instanceof ResourceInUseException) && error?.name !== 'ResourceInUseException') {
      throw error
    }
  }

  const result = await waitUntilTableExists(
    { client, maxWaitTime: 120, minDelay: 2, maxDelay: 10 },
    { TableName: TABLE_NAME }
  )

  if (result.state !== 'SUCCESS') {
    throw new Error(`Timed out waiting for table: ${TABLE_NAME}`)
  }

  const table = await describeTable()
  console.log(`Table ready: ${TABLE_NAME}`)
  console.log(`Status: ${table?.TableStatus || 'UNKNOWN'}`)
}

createTable().catch((error) => {
  console.error(`Failed to setup ${TABLE_NAME}:`, error?.message || error)
  process.exit(1)
})
