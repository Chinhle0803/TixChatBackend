import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../src/db/dynamodb.js'
import { POST_CATEGORIES } from '../src/services/PostService.js'
import postRepository from '../src/repositories/PostRepository.js'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  try {
    console.log('--- Database Query Results ---')

    // 1. Fetch users and find admin
    const usersResult = await docClient.send(new ScanCommand({
      TableName: 'tixchat-users',
    }))
    
    const adminUser = usersResult.Items.find(u => 
      u.username?.toLowerCase().includes('admin') || 
      u.email?.toLowerCase().includes('admin') ||
      u.fullName?.toLowerCase().includes('admin')
    )

    if (adminUser) {
      console.log('\n[User Admin Information]')
      console.log(JSON.stringify(adminUser, null, 2))

      // 2. Fetch 1-2 posts of admin
      const postsResult = await postRepository.list({ authorId: adminUser.userId, limit: 2 })
      console.log('\n[Posts of User Admin (max 2)]')
      console.log(JSON.stringify(postsResult.posts, null, 2))
    } else {
      console.log('\n[User Admin Information]')
      console.log('No user with "admin" in username/email/name found.')
      
      // List a few users just in case
      console.log('\n[Recent Users Sample]')
      console.log(JSON.stringify(usersResult.Items.slice(0, 3), null, 2))
    }

    // 3. List valid categories
    console.log('\n[Valid Post Categories]')
    console.log(POST_CATEGORIES)

  } catch (error) {
    console.error('Error querying database:', error)
  }
}

main()
