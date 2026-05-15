import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb'
import dotenv from 'dotenv'

dotenv.config()

const TABLE_NAME = process.env.DYNAMODB_CALL_SESSIONS_TABLE || 'tixchat-call-sessions'

const region = process.env.AWS_REGION || 'us-east-1'
const endpoint = process.env.DYNAMODB_LOCAL || undefined

const client = new DynamoDBClient({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  ...(endpoint ? { endpoint } : {}),
})

const describeTable = async () => {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }))
    return response.Table
  } catch (error) {
    if (error?.name === 'ResourceNotFoundException') {
      return null
    }

    throw error
  }
}

const createTable = async () => {
  const existingTable = await describeTable()

  if (existingTable) {
    console.log(`Table already exists: ${TABLE_NAME}`)
    console.log(`Status: ${existingTable.TableStatus}`)
    return
  }

  try {
    console.log(`Creating DynamoDB table: ${TABLE_NAME}`)

    await client.send(new CreateTableCommand({
      TableName: TABLE_NAME,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        {
          AttributeName: 'callId',
          AttributeType: 'S',
        },
      ],
      KeySchema: [
        {
          AttributeName: 'callId',
          KeyType: 'HASH',
        },
      ],
      Tags: [
        {
          Key: 'Application',
          Value: 'TixChat',
        },
        {
          Key: 'Purpose',
          Value: 'CallSessions',
        },
      ],
    }))
  } catch (error) {
    if (!(error instanceof ResourceInUseException) && error?.name !== 'ResourceInUseException') {
      throw error
    }

    console.log(`Table is already being created: ${TABLE_NAME}`)
  }

  const waitResult = await waitUntilTableExists(
    {
      client,
      maxWaitTime: 120,
      minDelay: 2,
      maxDelay: 10,
    },
    { TableName: TABLE_NAME }
  )

  if (waitResult.state !== 'SUCCESS') {
    throw new Error(`Timed out waiting for table to become ACTIVE: ${TABLE_NAME}`)
  }

  const table = await describeTable()
  console.log(`Table ready: ${TABLE_NAME}`)
  console.log(`Status: ${table?.TableStatus || 'UNKNOWN'}`)
}

createTable().catch((error) => {
  console.error(`Failed to setup ${TABLE_NAME}:`, error?.message || error)
  process.exit(1)
})
