import { ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../src/db/dynamodb.js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const POSTS_TABLE = process.env.DYNAMODB_POSTS_TABLE || 'tixchat-posts'
const COMMENTS_TABLE = process.env.DYNAMODB_COMMENTS_TABLE || 'tixchat-comments'

async function clearTable(tableName, keys) {
  console.log(`Clearing table: ${tableName}...`)
  let lastEvaluatedKey = undefined
  let items = []

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: keys.join(', '),
      ExclusiveStartKey: lastEvaluatedKey
    }))
    items.push(...(result.Items || []))
    lastEvaluatedKey = result.LastEvaluatedKey
  } while (lastEvaluatedKey)

  console.log(`Found ${items.length} items to delete in ${tableName}`)

  // Batch delete in chunks of 25
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25)
    const deleteRequests = chunk.map(item => ({
      DeleteRequest: {
        Key: item
      }
    }))

    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: deleteRequests
      }
    }))
    console.log(`Deleted ${i + chunk.length}/${items.length} items from ${tableName}`)
  }
}

async function batchInsert(tableName, items) {
  console.log(`Inserting ${items.length} items into ${tableName}...`)
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25)
    const putRequests = chunk.map(item => ({
      PutRequest: {
        Item: item
      }
    }))

    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: putRequests
      }
    }))
    console.log(`Inserted ${i + chunk.length}/${items.length} items into ${tableName}`)
  }
}

async function main() {
  try {
    // 1. Clear tables
    await clearTable(POSTS_TABLE, ['postId'])
    await clearTable(COMMENTS_TABLE, ['postId', 'commentKey'])

    // 2. Read JSON
    const jsonPath = path.resolve('../docs/tixchat_seed_posts_comments_20.json')
    const rawData = fs.readFileSync(jsonPath, 'utf8')
    const seedData = JSON.parse(rawData)

    // 3. Insert posts
    if (seedData.posts && seedData.posts.length > 0) {
      await batchInsert(POSTS_TABLE, seedData.posts)
    }

    // 4. Insert comments
    if (seedData.comments && seedData.comments.length > 0) {
      await batchInsert(COMMENTS_TABLE, seedData.comments)
    }

    console.log('✅ Seeding completed successfully!')
  } catch (error) {
    console.error('❌ Error during seeding:', error)
  }
}

main()
