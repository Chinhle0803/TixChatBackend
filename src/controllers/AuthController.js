import authService from '../services/AuthService.js'
import { registerValidation, loginValidation } from '../utils/validation.js'

export class AuthController {
  async register(req, res, next) {
    try {
      const { error, value } = registerValidation(req.body)
      if (error) {
        return res.status(400).json({ error: error.details[0].message })
      }

      const user = await authService.register(value)
      
      // Normalize user object - add _id alias for frontend compatibility
      if (user) {
        user._id = user.userId
      }
      
      res.status(201).json({
        message: 'User registered successfully',
        user,
      })
    } catch (err) {
      next(err)
    }
  }

  async login(req, res, next) {
    try {
      const { error, value } = loginValidation(req.body)
      if (error) {
        return res.status(400).json({ error: error.details[0].message })
      }

      const result = await authService.login(value.email, value.password)
      
      // Normalize user object - add _id alias for frontend compatibility
      if (result.user) {
        result.user._id = result.user.userId
      }
      
      res.status(200).json({
        message: 'Login successful',
        data: result,
      })
    } catch (err) {
      if (err.message === 'Invalid email or password') {
        return res.status(401).json({ error: err.message })
      }
      next(err)
    }
  }

  async logout(req, res, next) {
    try {
      await authService.logout(req.userId)
      res.status(200).json({ message: 'Logout successful' })
    } catch (err) {
      next(err)
    }
  }

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body
      const result = await authService.refreshAccessToken(refreshToken)
      res.status(200).json(result)
    } catch (err) {
      res.status(403).json({ error: 'Invalid refresh token' })
    }
  }

  async getMe(req, res, next) {
    try {
      const userService = require('../services/UserService.js').default
      const user = await userService.getUserById(req.userId)
      
      // Normalize user object - add _id alias for frontend compatibility
      if (user) {
        user._id = user.userId
      }
      
      res.status(200).json({ user })
    } catch (err) {
      next(err)
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body
      if (!email) {
        return res.status(400).json({ error: 'Email is required' })
      }

      const result = await authService.forgotPassword(email)
      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  }

  async verifyResetToken(req, res, next) {
    try {
      const { email, token } = req.body
      if (!email || !token) {
        return res.status(400).json({ error: 'Email and token are required' })
      }

      await authService.verifyResetToken(email, token)
      res.status(200).json({ message: 'Token verified successfully' })
    } catch (err) {
      if (err.message.includes('Invalid') || err.message.includes('expired')) {
        return res.status(400).json({ error: err.message })
      }
      next(err)
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { email, token, newPassword, confirmPassword } = req.body

      if (!email || !token || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: 'All fields are required' })
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' })
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' })
      }

      const result = await authService.resetPassword(email, token, newPassword)
      res.status(200).json(result)
    } catch (err) {
      if (err.message.includes('Invalid') || err.message.includes('expired') || err.message.includes('not found')) {
        return res.status(400).json({ error: err.message })
      }
      next(err)
    }
  }

  async sendEmailVerificationOtp(req, res, next) {
    try {
      const { email } = req.body
      if (!email) {
        return res.status(400).json({ error: 'Email is required' })
      }

      const result = await authService.sendEmailVerificationOtp(email)
      res.status(200).json(result)
    } catch (err) {
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: err.message })
      }
      next(err)
    }
  }

  async verifyEmailOtp(req, res, next) {
    try {
      const { email, otp } = req.body
      if (!email || !otp) {
        return res.status(400).json({ error: 'Email and verification code are required' })
      }

      const result = await authService.verifyEmailOtp(email, otp)
      res.status(200).json({
        message: result.message,
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      })
    } catch (err) {
      if (err.message.includes('Invalid') || err.message.includes('expired') || err.message.includes('not found')) {
        return res.status(400).json({ error: err.message })
      }
      next(err)
    }
  }
}

export default new AuthController()
