import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../src/db/dynamodb.js'
import dotenv from 'dotenv'

dotenv.config()

const POSTS_TABLE = process.env.DYNAMODB_POSTS_TABLE || 'tixchat-posts'

async function main() {
  const postId = '0e03cdc1-c044-4a51-b0a7-6f45694f3da1'
  try {
    const result = await docClient.send(new GetCommand({
      TableName: POSTS_TABLE,
      Key: { postId }
    }))

    if (result.Item) {
      console.log(JSON.stringify(result.Item, null, 2))
    } else {
      console.log('Post not found')
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

main()
