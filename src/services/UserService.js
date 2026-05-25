import UserRepository from '../repositories/UserRepository.js'
import conversationService from './ConversationService.js'
import { userEvents } from '../events/EventBus.js'
import { USER_EVENTS } from '../events/EventTypes.js'
import { hashPassword, comparePassword } from '../utils/passwordUtils.js'
import S3Service from './S3Service.js'
import config from '../config/index.js'
import redisCache, { stableSerialize } from './RedisCacheService.js'
import { normalizePostLocation } from '../utils/urbanRegion.js'

const USER_SEARCH_CACHE_PATTERN = 'users:search:*'
const USER_USERNAME_CACHE_PATTERN = 'users:username:*'
const USER_ONLINE_CACHE_PATTERN = 'users:online:*'

const getUserByIdCacheKey = (userId) => `users:id:${userId}`
const getUserByUsernameCacheKey = (username) => `users:username:${String(username || '').trim().toLowerCase()}`
const getUserSearchCacheKey = (query, limit) => `users:search:${stableSerialize({
  query: String(query || '').trim().toLowerCase(),
  limit: Number(limit) || 10,
})}`

const toPublicUser = (user) => {
  if (!user) return user

  const safeUser = { ...user }
  delete safeUser.password
  delete safeUser.passwordHash
  delete safeUser.resetPasswordToken
  delete safeUser.resetPasswordExpires
  delete safeUser.verificationToken
  delete safeUser.verificationTokenExpires
  delete safeUser.emailVerificationOtp
  delete safeUser.emailVerificationOtpExpires
  return safeUser
}

const normalizeProfileLocation = (location) => {
  if (!location || typeof location !== 'object') return null

  const lat = Number(location.lat)
  const lng = Number(location.lng)
  return normalizePostLocation({
    address: String(location.address || '').trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    province: String(location.province || '').trim(),
    district: String(location.district || '').trim(),
  })
}

const invalidateUserReadCaches = async (...userIds) => {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean).map(String))]
  await Promise.all([
    ...uniqueUserIds.map((userId) => redisCache.del(getUserByIdCacheKey(userId))),
    redisCache.delPattern(USER_USERNAME_CACHE_PATTERN),
    redisCache.delPattern(USER_SEARCH_CACHE_PATTERN),
    redisCache.delPattern(USER_ONLINE_CACHE_PATTERN),
  ])
}

export class UserService {
  async getUserById(userId) {
    const user = await redisCache.remember(
      getUserByIdCacheKey(userId),
      config.redisUserTtlSeconds,
      async () => toPublicUser(await UserRepository.findById(userId, false))
    )

    if (!user) {
      throw new Error('User not found')
    }

    return user
  }

  async getUserByUsername(username) {
    const user = await redisCache.remember(
      getUserByUsernameCacheKey(username),
      config.redisUserTtlSeconds,
      async () => toPublicUser(await UserRepository.findByUsername(username, false))
    )

    if (!user) {
      throw new Error('User not found')
    }

    return user
  }

  async updateProfile(userId, updateData) {
    const { fullName, displayName, bio, avatar, province, district, location } = updateData

    const updates = {}
    const normalizedLocation = location !== undefined ? normalizeProfileLocation(location) : undefined
    if (fullName !== undefined) updates.fullName = fullName
    if (displayName !== undefined) updates.fullName = displayName // Use displayName as fullName
    if (bio !== undefined) updates.bio = bio
    if (avatar !== undefined) updates.avatar = avatar
    if (province !== undefined) updates.province = province
    if (district !== undefined) updates.district = district
    if (normalizedLocation !== undefined) {
      updates.location = normalizedLocation
      if (province === undefined) updates.province = normalizedLocation?.province || ''
      if (district === undefined) updates.district = normalizedLocation?.district || ''
    }

    const user = await UserRepository.update(userId, updates)
    const publicUser = toPublicUser(user)
    await invalidateUserReadCaches(userId)
    await redisCache.setJson(getUserByIdCacheKey(userId), publicUser, config.redisUserTtlSeconds)

    // Emit event
    userEvents.emit(USER_EVENTS.PROFILE_UPDATED, {
      userId: publicUser.userId,
      user: publicUser,
    })

    return publicUser
  }

  async searchUsers(query, limit = 10) {
    return redisCache.remember(
      getUserSearchCacheKey(query, limit),
      config.redisUserTtlSeconds,
      async () => {
        // Note: DynamoDB doesn't support full-text search like MongoDB.
        const { users } = await UserRepository.getAll(limit)
        const normalizedQuery = String(query || '').toLowerCase()

        const filtered = users.filter(user =>
          user.username?.toLowerCase().includes(normalizedQuery) ||
          user.fullName?.toLowerCase().includes(normalizedQuery)
        )

        return filtered.slice(0, limit).map(toPublicUser)
      }
    )
  }

  async setOnlineStatus(userId, isOnline) {
    const user = await UserRepository.updateOnlineStatus(userId, isOnline)
    const publicUser = toPublicUser(user)
    await invalidateUserReadCaches(userId)

    const eventType = isOnline ? USER_EVENTS.ONLINE : USER_EVENTS.OFFLINE

    userEvents.emit(eventType, {
      userId: publicUser.userId,
      username: publicUser.username,
      isOnline,
    })

    return publicUser
  }

  async addFriend(userId, friendId) {
    // Check if already friends
    let user = await UserRepository.findById(userId)
    if (user.friends && user.friends.includes(friendId)) {
      throw new Error('Already friends')
    }

    // Add friend relationship (bidirectional)
    user = await UserRepository.addFriend(userId, friendId)
    const friend = await UserRepository.addFriend(friendId, userId)
    await invalidateUserReadCaches(userId, friendId)

    // Emit event
    userEvents.emit(USER_EVENTS.FRIEND_ADDED, {
      userId,
      friendId,
    })

    return { user: toPublicUser(user), friend: toPublicUser(friend) }
  }

  async sendFriendRequest(userId, friendId) {
    if (!friendId) {
      throw new Error('Friend ID is required')
    }

    if (userId === friendId) {
      throw new Error('Cannot send friend request to yourself')
    }

    const user = await UserRepository.findById(userId)
    if (user?.friends?.includes(friendId)) {
      throw new Error('Already friends')
    }

    const pendingOutgoing = user?.friendRequestsSent || []
    if (pendingOutgoing.includes(friendId)) {
      throw new Error('Friend request already sent')
    }

    await UserRepository.sendFriendRequest(userId, friendId)
    await invalidateUserReadCaches(userId, friendId)

    userEvents.emit(USER_EVENTS.FRIEND_REQUEST_SENT, {
      userId,
      friendId,
    })

    return true
  }

  async getPendingFriendRequests(userId) {
    const requestIds = await UserRepository.getFriendRequestsReceived(userId)
    return requestIds
  }

  async acceptFriendRequest(userId, requesterId) {
    await UserRepository.acceptFriendRequest(userId, requesterId)
    await invalidateUserReadCaches(userId, requesterId)

    const conversation = await conversationService.getOrCreateDirectConversation(
      userId,
      requesterId
    )

    userEvents.emit(USER_EVENTS.FRIEND_REQUEST_ACCEPTED, {
      userId,
      requesterId,
    })

    return {
      accepted: true,
      conversation,
    }
  }

  async rejectFriendRequest(userId, requesterId) {
    await UserRepository.rejectFriendRequest(userId, requesterId)
    await invalidateUserReadCaches(userId, requesterId)

    userEvents.emit(USER_EVENTS.FRIEND_REQUEST_REJECTED, {
      userId,
      requesterId,
    })

    return true
  }

  async removeFriend(userId, friendId) {
    const user = await UserRepository.removeFriend(userId, friendId)
    await UserRepository.removeFriend(friendId, userId)
    await invalidateUserReadCaches(userId, friendId)

    // Emit event
    userEvents.emit(USER_EVENTS.FRIEND_REMOVED, {
      userId,
      friendId,
    })

    return toPublicUser(user)
  }

  async blockUser(userId, blockUserId) {
    const user = await UserRepository.blockUser(userId, blockUserId)
    await invalidateUserReadCaches(userId)
    return toPublicUser(user)
  }

  async unblockUser(userId, blockUserId) {
    const user = await UserRepository.unblockUser(userId, blockUserId)
    await invalidateUserReadCaches(userId)
    return toPublicUser(user)
  }

  async getOnlineUsers(userIds = null) {
    const users = await UserRepository.getOnlineUsers(100)
    
    if (userIds && userIds.length > 0) {
      return users.filter(user => userIds.includes(user.userId)).map(toPublicUser)
    }

    return users.map(toPublicUser)
  }

  async getFriendsList(userId) {
    const user = await this.getUserById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    return user.friends || []
  }

  /**
   * Get current user profile
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User profile data
   */
  async getProfile(userId) {
    return this.getUserById(userId)
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Updated user object
   */
  async changePassword(userId, currentPassword, newPassword) {
    // Get user with password
    const user = await UserRepository.findByIdWithPassword(userId)
    if (!user) {
      throw new Error('User not found')
    }

    // Verify current password
    const isPasswordValid = await comparePassword(currentPassword, user.password)
    if (!isPasswordValid) {
      throw new Error('Current password is incorrect')
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword)

    // Update password
    const updatedUser = await UserRepository.update(userId, {
      password: hashedPassword,
    })
    await invalidateUserReadCaches(userId)

    // Emit event
    userEvents.emit(USER_EVENTS.PASSWORD_CHANGED, {
      userId: user.userId,
    })

    return toPublicUser(updatedUser)
  }

  /**
   * Update user avatar
   * @param {string} userId - User ID
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} fileName - Original file name
   * @returns {Promise<Object>} Updated user object with new avatar URL
   */
  async updateAvatar(userId, fileBuffer, fileName) {
    // Get current user
    const user = await UserRepository.findById(userId, false)
    if (!user) {
      throw new Error('User not found')
    }

    // Upload to S3 and delete old avatar
    const newAvatarUrl = await S3Service.replaceAvatar(
      userId,
      fileBuffer,
      fileName,
      user.avatar
    )

    // Update user avatar URL in database
    const updatedUser = await UserRepository.update(userId, {
      avatar: newAvatarUrl,
    })
    const publicUser = toPublicUser(updatedUser)
    await invalidateUserReadCaches(userId)
    await redisCache.setJson(getUserByIdCacheKey(userId), publicUser, config.redisUserTtlSeconds)

    // Emit event
    userEvents.emit(USER_EVENTS.AVATAR_UPDATED, {
      userId: publicUser.userId,
      avatarUrl: newAvatarUrl,
    })

    return publicUser
  }
}

export default new UserService()
