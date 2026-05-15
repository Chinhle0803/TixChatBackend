import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, ScanCommand, DeleteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import config from '../config/index.js'

// Create DynamoDB client
const dynamoDBClient = new DynamoDBClient({
  region: config.awsRegion || 'us-east-1',
  credentials: {
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  },
  // Optional: For local development
  ...(config.dynamodbLocal && {
    endpoint: config.dynamodbLocal,
  }),
})

// Create DynamoDB Document Client for easier API
const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: true,
    convertClassInstanceToMap: true,
  },
})

// Test connection
const connectDynamoDB = async () => {
  try {
    // Simple scan operation to test connection
    await docClient.send(new ScanCommand({
      TableName: 'tixchat-users',
      Limit: 1,
    }))
    console.log('✅ DynamoDB connected successfully')
  } catch (error) {
    console.error('❌ DynamoDB connection error:', error.message)
    process.exit(1)
  }
}

export default connectDynamoDB
export { docClient, dynamoDBClient }
