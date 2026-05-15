import userService from '../services/UserService.js'
import { updateProfileValidation, changePasswordValidation } from '../utils/validation.js'

export class UserController {
  async getProfile(req, res, next) {
    try {
      const user = await userService.getUserById(req.params.userId)
      res.status(200).json({ user })
    } catch (err) {
      if (err.message === 'User not found') {
        return res.status(404).json({ error: err.message })
      }
      next(err)
    }
  }

  async updateProfile(req, res, next) {
    try {
      const { error, value } = updateProfileValidation(req.body)
      if (error) {
        return res.status(400).json({ error: error.details[0].message })
      }

      const user = await userService.updateProfile(req.userId, value)
      res.status(200).json({
        message: 'Profile updated successfully',
        user,
      })
    } catch (err) {
      next(err)
    }
  }

  async searchUsers(req, res, next) {
    try {
      const { q, limit } = req.query
      if (!q) {
        return res.status(400).json({ error: 'Search query is required' })
      }

      const users = await userService.searchUsers(q, parseInt(limit) || 10)
      res.status(200).json({ users })
    } catch (err) {
      next(err)
    }
  }

  async addFriend(req, res, next) {
    try {
      const { friendId } = req.body
      if (!friendId) {
        return res.status(400).json({ error: 'Friend ID is required' })
      }

      const result = await userService.addFriend(req.userId, friendId)
      res.status(200).json({
        message: 'Friend added successfully',
        user: result.user,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async sendFriendRequest(req, res, next) {
    try {
      const { friendId } = req.body
      await userService.sendFriendRequest(req.userId, friendId)

      res.status(200).json({
        message: 'Friend request sent successfully',
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async getPendingFriendRequests(req, res, next) {
    try {
      const requests = await userService.getPendingFriendRequests(req.userId)
      res.status(200).json({ requests })
    } catch (err) {
      next(err)
    }
  }

  async acceptFriendRequest(req, res, next) {
    try {
      const { requesterId } = req.body
      const result = await userService.acceptFriendRequest(req.userId, requesterId)
      const conversation = result?.conversation
        ? {
            ...result.conversation,
            _id: result.conversation.conversationId,
          }
        : null

      res.status(200).json({
        message: 'Friend request accepted',
        conversation,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async rejectFriendRequest(req, res, next) {
    try {
      const { requesterId } = req.body
      await userService.rejectFriendRequest(req.userId, requesterId)

      res.status(200).json({
        message: 'Friend request rejected',
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }

  async removeFriend(req, res, next) {
    try {
      const { friendId } = req.body
      const user = await userService.removeFriend(req.userId, friendId)
      res.status(200).json({
        message: 'Friend removed successfully',
        user,
      })
    } catch (err) {
      next(err)
    }
  }

  async getFriends(req, res, next) {
    try {
      const friends = await userService.getFriendsList(req.userId)
      res.status(200).json({ friends })
    } catch (err) {
      next(err)
    }
  }

  async getOnlineUsers(req, res, next) {
    try {
      const users = await userService.getOnlineUsers()
      res.status(200).json({ users })
    } catch (err) {
      next(err)
    }
  }

  async blockUser(req, res, next) {
    try {
      const { userId } = req.body
      const user = await userService.blockUser(req.userId, userId)
      res.status(200).json({
        message: 'User blocked successfully',
        user,
      })
    } catch (err) {
      next(err)
    }
  }

  async unblockUser(req, res, next) {
    try {
      const { userId } = req.body
      const user = await userService.unblockUser(req.userId, userId)
      res.status(200).json({
        message: 'User unblocked successfully',
        user,
      })
    } catch (err) {
      next(err)
    }
  }

  /**
   * Get current user profile
   */
  async getCurrentProfile(req, res, next) {
    try {
      const user = await userService.getProfile(req.userId)
      res.status(200).json({ user })
    } catch (err) {
      if (err.message === 'User not found') {
        return res.status(404).json({ error: err.message })
      }
      next(err)
    }
  }

  /**
   * Change user password
   */
  async changePassword(req, res, next) {
    try {
      const { error, value } = changePasswordValidation(req.body)
      if (error) {
        return res.status(400).json({ error: error.details[0].message })
      }

      await userService.changePassword(
        req.userId,
        value.currentPassword,
        value.newPassword
      )

      res.status(200).json({
        message: 'Password changed successfully',
      })
    } catch (err) {
      if (err.message === 'Current password is incorrect') {
        return res.status(401).json({ error: err.message })
      }
      if (err.message === 'User not found') {
        return res.status(404).json({ error: err.message })
      }
      next(err)
    }
  }

  /**
   * Update user avatar with file upload
   */
  async updateAvatar(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' })
      }

      // Validate file is an image
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ 
          error: 'Only image files are allowed (jpeg, png, gif, webp)' 
        })
      }

      const user = await userService.updateAvatar(
        req.userId,
        req.file.buffer,
        req.file.originalname
      )

      res.status(200).json({
        message: 'Avatar updated successfully',
        user,
      })
    } catch (err) {
      if (err.message === 'User not found') {
        return res.status(404).json({ error: err.message })
      }
      next(err)
    }
  }
}

export default new UserController()
