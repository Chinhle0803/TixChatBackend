import { User } from '../models/User.js'
import { hashPassword, comparePassword } from '../utils/passwordUtils.js'
import { generateTokens } from '../utils/tokenUtils.js'
import { userEvents } from '../events/EventBus.js'
import { USER_EVENTS } from '../events/EventTypes.js'
import UserRepository from '../repositories/UserRepository.js'
import EmailService from './EmailService.js'
import crypto from 'crypto'
import redisCache from './RedisCacheService.js'

const invalidateAuthUserCaches = async (userId = null) => {
  await Promise.all([
    userId ? redisCache.del(`users:id:${userId}`) : Promise.resolve(false),
    redisCache.delPattern('users:username:*'),
    redisCache.delPattern('users:search:*'),
    redisCache.delPattern('users:online:*'),
  ])
}

export class AuthService {
  async register(userData) {
    const { username, password, fullName } = userData
    const email = String(userData?.email || '').trim().toLowerCase()

    // Check if user exists
    const existingUserByEmail = await UserRepository.findByEmail(email)
    const existingUserByUsername = await UserRepository.findByUsername(username)
    
    if (existingUserByEmail || existingUserByUsername) {
      throw new Error('Username or email already in use')
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const user = await UserRepository.create({
      username,
      email,
      password: hashedPassword,
      fullName,
    })

    // Generate OTP (6-digit code)
    const otp = this.generateOTP()
    const otpExpires = Date.now() + 10 * 60 * 1000 // 10 minutes

    // Store OTP in user record
    await UserRepository.update(user.userId, {
      emailVerificationOtp: otp,
      emailVerificationOtpExpires: otpExpires,
    })
    await invalidateAuthUserCaches(user.userId)

    // Send verification email with OTP
    try {
      await EmailService.sendEmailVerificationOtp(email, otp, fullName)
    } catch (error) {
      console.error('Failed to send verification email:', error)
      // Don't throw error here - user is created, let them verify later
    }

    // Emit event
    userEvents.emit(USER_EVENTS.REGISTERED, {
      userId: user.userId,
      username: user.username,
      email: user.email,
    })

    return {
      userId: user.userId,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
    }
  }

  async login(email, password) {
    const rawEmail = String(email || '').trim()
    const normalizedEmail = rawEmail.toLowerCase()
    const lookupCandidates = [...new Set([normalizedEmail, rawEmail])].filter(Boolean)

    // Find user with password (support legacy data that might keep email casing)
    let user = null
    for (const candidate of lookupCandidates) {
      user = await UserRepository.findByEmailWithPassword(candidate)
      if (user) break
    }

    if (!user) {
      throw new Error('Invalid email or password')
    }

    const storedPassword = String(user?.password || user?.passwordHash || '')
    const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(storedPassword)

    // Compare password (supports legacy plain-text password and upgrades it)
    let isPasswordValid = false
    if (storedPassword) {
      if (isBcryptHash) {
        isPasswordValid = await comparePassword(password, storedPassword)
      } else {
        isPasswordValid = String(password) === storedPassword
      }
    }

    if (!isPasswordValid) {
      throw new Error('Invalid email or password')
    }

    if (!isBcryptHash) {
      const upgradedHash = await hashPassword(String(password))
      await UserRepository.update(user.userId, { password: upgradedHash })
      user.password = upgradedHash
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.userId)

    // Update online status
    await UserRepository.update(user.userId, {
      isOnline: true,
      lastSeen: Date.now(),
    })
    await invalidateAuthUserCaches(user.userId)

    // Emit event
    userEvents.emit(USER_EVENTS.LOGGED_IN, {
      userId: user.userId,
      username: user.username,
    })

    return {
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        avatar: user.avatar,
      },
      accessToken,
      refreshToken,
    }
  }

  async logout(userId) {
    const user = await UserRepository.findById(userId)
    if (user) {
      await UserRepository.update(userId, {
        isOnline: false,
        lastSeen: Date.now(),
      })
      await invalidateAuthUserCaches(userId)

      // Emit event
      userEvents.emit(USER_EVENTS.LOGGED_OUT, {
        userId: user.userId,
        username: user.username,
      })
    }
  }

  async refreshAccessToken(refreshToken) {
    const { verifyToken } = await import('../utils/tokenUtils.js')
    const decoded = verifyToken(refreshToken, 'refresh')
    if (!decoded) {
      throw new Error('Invalid refresh token')
    }

    const user = await UserRepository.findById(decoded.userId)
    if (!user) {
      throw new Error('User not found')
    }

    const { accessToken } = generateTokens(user.userId)
    return { accessToken }
  }

  async forgotPassword(email) {
    const user = await UserRepository.findByEmail(email)
    if (!user) {
      // Return success anyway for security (don't reveal if email exists)
      return { message: 'If email exists, reset link will be sent' }
    }

    // Generate reset token (6 digit OTP)
    const resetToken = crypto.randomBytes(3).toString('hex').toUpperCase()
    const resetTokenExpires = Date.now() + 15 * 60 * 1000 // 15 minutes

    await UserRepository.update(user.userId, {
      verificationToken: resetToken,
      verificationTokenExpires: resetTokenExpires,
    })
    await invalidateAuthUserCaches(user.userId)

    // Send email with reset code
    try {
      await EmailService.sendPasswordResetEmail(email, resetToken)
    } catch (error) {
      console.error('Failed to send password reset email:', error)
      throw new Error('Failed to send reset email. Please try again.')
    }

    return {
      message: 'Reset code sent to your email',
      expiresIn: 15 * 60, // 15 minutes in seconds
    }
  }

  async verifyResetToken(email, token) {
    const user = await UserRepository.findByEmail(email)
    if (!user) {
      throw new Error('User not found')
    }

    if (user.verificationToken !== token) {
      throw new Error('Invalid verification code')
    }

    if (!user.verificationTokenExpires || user.verificationTokenExpires < Date.now()) {
      throw new Error('Verification code expired')
    }

    return { message: 'Token verified successfully' }
  }

  async resetPassword(email, token, newPassword) {
    const user = await UserRepository.findByEmail(email)
    if (!user) {
      throw new Error('User not found')
    }

    if (user.verificationToken !== token) {
      throw new Error('Invalid verification code')
    }

    if (!user.verificationTokenExpires || user.verificationTokenExpires < Date.now()) {
      throw new Error('Verification code expired')
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword)
    
    await UserRepository.update(user.userId, {
      password: hashedPassword,
      verificationToken: null,
      verificationTokenExpires: null,
    })
    await invalidateAuthUserCaches(user.userId)

    // Emit event
    userEvents.emit(USER_EVENTS.PASSWORD_RESET, {
      userId: user.userId,
      email: user.email,
    })

    return { message: 'Password reset successfully' }
  }

  // Helper function to generate 6-digit OTP
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  async sendEmailVerificationOtp(email) {
    const user = await UserRepository.findByEmail(email)
    if (!user) {
      throw new Error('User not found')
    }

    // Generate new OTP
    const otp = this.generateOTP()
    const otpExpires = Date.now() + 10 * 60 * 1000 // 10 minutes

    // Update user with new OTP
    await UserRepository.update(user.userId, {
      emailVerificationOtp: otp,
      emailVerificationOtpExpires: otpExpires,
    })
    await invalidateAuthUserCaches(user.userId)

    // Send email with OTP
    try {
      await EmailService.sendEmailVerificationOtp(email, otp, user.fullName)
    } catch (error) {
      console.error('Failed to send OTP email:', error)
      throw new Error('Failed to send verification email')
    }

    return {
      message: 'Verification code sent to your email',
      expiresIn: 10 * 60, // 10 minutes in seconds
    }
  }

  async verifyEmailOtp(email, otp) {
    const user = await UserRepository.findByEmail(email)
    if (!user) {
      throw new Error('User not found')
    }

    // Check if OTP is correct
    if (user.emailVerificationOtp !== otp) {
      throw new Error('Invalid verification code')
    }

    // Check if OTP is expired
    if (!user.emailVerificationOtpExpires || user.emailVerificationOtpExpires < Date.now()) {
      throw new Error('Verification code expired')
    }

    // Mark email as verified and clear OTP
    const updatedUser = await UserRepository.update(user.userId, {
      isEmailVerified: true,
      emailVerificationOtp: null,
      emailVerificationOtpExpires: null,
    })
    await invalidateAuthUserCaches(user.userId)

    // Generate tokens for auto-login
    const { accessToken, refreshToken } = generateTokens(user.userId)

    // Update online status
    await UserRepository.update(user.userId, {
      isOnline: true,
      lastSeen: Date.now(),
    })
    await invalidateAuthUserCaches(user.userId)

    // Emit event
    userEvents.emit(USER_EVENTS.LOGGED_IN, {
      userId: user.userId,
      username: user.username,
    })

    return {
      message: 'Email verified successfully',
      user: {
        userId: updatedUser.userId,
        username: updatedUser.username,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        avatar: updatedUser.avatar,
        isEmailVerified: updatedUser.isEmailVerified,
      },
      accessToken,
      refreshToken,
    }
  }
}

export default new AuthService()
