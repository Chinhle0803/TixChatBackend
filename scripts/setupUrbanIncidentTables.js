import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb'
import dotenv from 'dotenv'

dotenv.config()

const POSTS_TABLE = process.env.DYNAMODB_POSTS_TABLE || 'tixchat-posts'
const COMMENTS_TABLE = process.env.DYNAMODB_COMMENTS_TABLE || 'tixchat-comments'
const STATS_TABLE = process.env.DYNAMODB_URBAN_STATS_TABLE || 'tixchat-urban-incident-stats'

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  ...(process.env.DYNAMODB_LOCAL ? { endpoint: process.env.DYNAMODB_LOCAL } : {}),
})

const describeTable = async (tableName) => {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }))
    return response.Table
  } catch (error) {
    if (error?.name === 'ResourceNotFoundException') return null
    throw error
  }
}

const createIfMissing = async (tableName, params) => {
  const existing = await describeTable(tableName)
  if (existing) {
    console.log(`Table already exists: ${tableName} (${existing.TableStatus})`)
    return
  }

  try {
    console.log(`Creating DynamoDB table: ${tableName}`)
    await client.send(new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST',
      ...params,
      Tags: [
        { Key: 'Application', Value: 'TixChat' },
        { Key: 'Purpose', Value: 'UrbanIncidentFeed' },
      ],
    }))
  } catch (error) {
    if (!(error instanceof ResourceInUseException) && error?.name !== 'ResourceInUseException') {
      throw error
    }
  }

  const result = await waitUntilTableExists(
    { client, maxWaitTime: 120, minDelay: 2, maxDelay: 10 },
    { TableName: tableName }
  )

  if (result.state !== 'SUCCESS') {
    throw new Error(`Timed out waiting for table: ${tableName}`)
  }

  console.log(`Table ready: ${tableName}`)
}

const run = async () => {
  await createIfMissing(POSTS_TABLE, {
    AttributeDefinitions: [
      { AttributeName: 'postId', AttributeType: 'S' },
      { AttributeName: 'category', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
      { AttributeName: 'authorId', AttributeType: 'S' },
      { AttributeName: 'geohashPrefix', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'postId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI_CategoryCreatedAt',
        KeySchema: [
          { AttributeName: 'category', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'GSI_StatusCreatedAt',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'GSI_AuthorCreatedAt',
        KeySchema: [
          { AttributeName: 'authorId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'GSI_GeohashCreatedAt',
        KeySchema: [
          { AttributeName: 'geohashPrefix', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  })

  await createIfMissing(COMMENTS_TABLE, {
    AttributeDefinitions: [
      { AttributeName: 'postId', AttributeType: 'S' },
      { AttributeName: 'commentKey', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'postId', KeyType: 'HASH' },
      { AttributeName: 'commentKey', KeyType: 'RANGE' },
    ],
  })

  await createIfMissing(STATS_TABLE, {
    AttributeDefinitions: [
      { AttributeName: 'statKey', AttributeType: 'S' },
      { AttributeName: 'window', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'statKey', KeyType: 'HASH' },
      { AttributeName: 'window', KeyType: 'RANGE' },
    ],
  })
}

run().catch((error) => {
  console.error('Failed to setup urban incident tables:', error?.message || error)
  process.exit(1)
})
