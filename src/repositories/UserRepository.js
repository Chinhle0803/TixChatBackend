import { GetCommand, PutCommand, UpdateCommand, QueryCommand, ScanCommand, DeleteCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { docClient } from '../db/dynamodb.js'
import { v4 as uuidv4 } from 'uuid'

const TABLE_NAME = 'tixchat-users'

class UserRepository {
  /**
   * Create a new user
   */
  async create(userData) {
    const userId = uuidv4()
    const timestamp = Date.now()

    const item = {
      userId,
      username: userData.username,
      email: userData.email,
      password: userData.password,
      fullName: userData.fullName,
      avatar: userData.avatar || null,
      bio: userData.bio || '',
      province: userData.province || '',
      district: userData.district || '',
      location: userData.location || null,
      isOnline: false,
      lastSeen: timestamp,
      friends: [],
  friendRequestsSent: [],
  friendRequestsReceived: [],
      blockedUsers: [],
      resetPasswordToken: null,
      resetPasswordExpires: null,
      verificationToken: null,
      verificationTokenExpires: null,
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
      throw new Error(`Failed to create user: ${error.message}`)
    }
  }

  /**
   * Get user by ID
   */
  async findById(userId, includePassword = false) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { userId },
      }))

      if (!result.Item) return null

      // Remove password by default
      if (!includePassword) {
        delete result.Item.password
      }

      return result.Item
    } catch (error) {
      throw new Error(`Failed to find user: ${error.message}`)
    }
  }

  /**
   * Get user by email
   */
  async findByEmail(email, includePassword = false) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email,
        },
      }))

      if (!result.Items || result.Items.length === 0) return null

      const user = result.Items[0]

      // Remove password by default
      if (!includePassword) {
        delete user.password
      }

      return user
    } catch (error) {
      throw new Error(`Failed to find user by email: ${error.message}`)
    }
  }

  /**
   * Get user by username
   */
  async findByUsername(username, includePassword = false) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'username-index',
        KeyConditionExpression: 'username = :username',
        ExpressionAttributeValues: {
          ':username': username,
        },
      }))

      if (!result.Items || result.Items.length === 0) return null

      const user = result.Items[0]

      // Remove password by default
      if (!includePassword) {
        delete user.password
      }

      return user
    } catch (error) {
      throw new Error(`Failed to find user by username: ${error.message}`)
    }
  }

  /**
   * Get user with password (for authentication)
   */
  async findByIdWithPassword(userId) {
    return this.findById(userId, true)
  }

  async findByEmailWithPassword(email) {
    return this.findByEmail(email, true)
  }

  /**
   * Update user
   */
  async update(userId, updates) {
    const updateExpressions = []
    const expressionAttributeValues = {}
    const expressionAttributeNames = {}

    Object.entries(updates).forEach(([key, value]) => {
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
        Key: { userId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
      }))

      // Fetch the updated user - include password to preserve it in the database
      return this.findById(userId, true)
    } catch (error) {
      throw new Error(`Failed to update user: ${error.message}`)
    }
  }

  /**
   * Update password
   */
  async updatePassword(userId, hashedPassword) {
    return this.update(userId, { password: hashedPassword })
  }

  /**
   * Set reset password token
   */
  async setResetPasswordToken(userId, token, expiresIn) {
    return this.update(userId, {
      resetPasswordToken: token,
      resetPasswordExpires: Date.now() + expiresIn,
    })
  }

  /**
   * Clear reset password token
   */
  async clearResetPasswordToken(userId) {
    return this.update(userId, {
      resetPasswordToken: null,
      resetPasswordExpires: null,
    })
  }

  /**
   * Update online status
   */
  async updateOnlineStatus(userId, isOnline) {
    const updates = {
      isOnline,
    }

    if (isOnline === false) {
      updates.lastSeen = Date.now()
    }

    return this.update(userId, updates)
  }

  /**
   * Add friend
   */
  async addFriend(userId, friendId) {
    try {
      // Get current friends list
      const user = await this.findById(userId)
      const friends = user.friends || []

      // Add if not already in list
      if (!friends.includes(friendId)) {
        friends.push(friendId)
        return this.update(userId, { friends })
      }

      return user
    } catch (error) {
      throw new Error(`Failed to add friend: ${error.message}`)
    }
  }

  /**
   * Remove friend
   */
  async removeFriend(userId, friendId) {
    try {
      const user = await this.findById(userId)
      const friends = user.friends || []
      const updatedFriends = friends.filter(id => id !== friendId)

      return this.update(userId, { friends: updatedFriends })
    } catch (error) {
      throw new Error(`Failed to remove friend: ${error.message}`)
    }
  }

  async sendFriendRequest(senderId, receiverId) {
    try {
      const sender = await this.findById(senderId)
      const receiver = await this.findById(receiverId)

      if (!sender || !receiver) {
        throw new Error('User not found')
      }

      const senderRequests = sender.friendRequestsSent || []
      const receiverRequests = receiver.friendRequestsReceived || []

      if (!senderRequests.includes(receiverId)) {
        senderRequests.push(receiverId)
        await this.update(senderId, { friendRequestsSent: senderRequests })
      }

      if (!receiverRequests.includes(senderId)) {
        receiverRequests.push(senderId)
        await this.update(receiverId, { friendRequestsReceived: receiverRequests })
      }

      return true
    } catch (error) {
      throw new Error(`Failed to send friend request: ${error.message}`)
    }
  }

  async getFriendRequestsReceived(userId) {
    const user = await this.findById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    return user.friendRequestsReceived || []
  }

  async acceptFriendRequest(userId, requesterId) {
    try {
      const user = await this.findById(userId)
      const requester = await this.findById(requesterId)

      if (!user || !requester) {
        throw new Error('User not found')
      }

      const incoming = (user.friendRequestsReceived || []).filter((id) => id !== requesterId)
      const outgoing = (requester.friendRequestsSent || []).filter((id) => id !== userId)

      await this.update(userId, { friendRequestsReceived: incoming })
      await this.update(requesterId, { friendRequestsSent: outgoing })

      await this.addFriend(userId, requesterId)
      await this.addFriend(requesterId, userId)

      return true
    } catch (error) {
      throw new Error(`Failed to accept friend request: ${error.message}`)
    }
  }

  async rejectFriendRequest(userId, requesterId) {
    try {
      const user = await this.findById(userId)
      const requester = await this.findById(requesterId)

      if (!user || !requester) {
        throw new Error('User not found')
      }

      const incoming = (user.friendRequestsReceived || []).filter((id) => id !== requesterId)
      const outgoing = (requester.friendRequestsSent || []).filter((id) => id !== userId)

      await this.update(userId, { friendRequestsReceived: incoming })
      await this.update(requesterId, { friendRequestsSent: outgoing })

      return true
    } catch (error) {
      throw new Error(`Failed to reject friend request: ${error.message}`)
    }
  }

  /**
   * Block user
   */
  async blockUser(userId, blockedUserId) {
    try {
      const user = await this.findById(userId)
      const blockedUsers = user.blockedUsers || []

      if (!blockedUsers.includes(blockedUserId)) {
        blockedUsers.push(blockedUserId)
        return this.update(userId, { blockedUsers })
      }

      return user
    } catch (error) {
      throw new Error(`Failed to block user: ${error.message}`)
    }
  }

  /**
   * Unblock user
   */
  async unblockUser(userId, blockedUserId) {
    try {
      const user = await this.findById(userId)
      const blockedUsers = user.blockedUsers || []
      const updatedBlockedUsers = blockedUsers.filter(id => id !== blockedUserId)

      return this.update(userId, { blockedUsers: updatedBlockedUsers })
    } catch (error) {
      throw new Error(`Failed to unblock user: ${error.message}`)
    }
  }

  /**
   * Delete user
   */
  async delete(userId) {
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { userId },
      }))

      return true
    } catch (error) {
      throw new Error(`Failed to delete user: ${error.message}`)
    }
  }

  /**
   * Get all users (paginated)
   */
  async getAll(limit = 10, lastEvaluatedKey = null) {
    try {
      const params = {
        TableName: TABLE_NAME,
        Limit: limit,
      }

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey
      }

      const result = await docClient.send(new ScanCommand(params))

      // Remove passwords from all users
      const users = result.Items.map(user => {
        delete user.password
        return user
      })

      return {
        users,
        lastEvaluatedKey: result.LastEvaluatedKey,
      }
    } catch (error) {
      throw new Error(`Failed to get all users: ${error.message}`)
    }
  }

  /**
   * Get online users
   */
  async getOnlineUsers(limit = 100) {
    try {
      // Note: Scanning for isOnline = true (not ideal for large datasets)
      // Consider adding a Global Secondary Index on isOnline for better performance
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'isOnline = :isOnline',
        ExpressionAttributeValues: {
          ':isOnline': true,
        },
        Limit: limit,
      }))

      return result.Items || []
    } catch (error) {
      throw new Error(`Failed to get online users: ${error.message}`)
    }
  }

  /**
   * Get users by IDs
   */
  async findByIds(userIds) {
    try {
      // Batch get
      const result = await docClient.send(new BatchGetCommand({
        RequestItems: {
          [TABLE_NAME]: {
            Keys: userIds.map(userId => ({ userId })),
          },
        },
      }))

      return result.Responses[TABLE_NAME] || []
    } catch (error) {
      throw new Error(`Failed to get users by IDs: ${error.message}`)
    }
  }
}

export default new UserRepository()
