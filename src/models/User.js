/**
 * User Model for DynamoDB
 * Table: Users
 * Primary Key: userId (UUID)
 * GSI: email-index, username-index
 */

export class User {
  constructor(data = {}) {
    this.userId = data.userId // UUID
    this.username = data.username // String, unique
    this.email = data.email // String, unique
    this.password = data.password // Hashed password
    this.fullName = data.fullName // String
    this.avatar = data.avatar || null // String (URL)
    this.bio = data.bio || '' // String, max 500 chars
    this.province = data.province || '' // String, preferred province/city for local feeds
    this.district = data.district || '' // String, preferred district for local feeds
    this.location = data.location || null // Object, selected profile map location
    this.isOnline = data.isOnline !== undefined ? data.isOnline : false // Boolean
    this.lastSeen = data.lastSeen || new Date().toISOString() // ISO string
    this.friends = data.friends || [] // Array of userIds
    this.blockedUsers = data.blockedUsers || [] // Array of userIds
    this.resetPasswordToken = data.resetPasswordToken || null // String
    this.resetPasswordExpires = data.resetPasswordExpires || null // ISO string
    this.verificationToken = data.verificationToken || null // String
    this.verificationTokenExpires = data.verificationTokenExpires || null // ISO string
    this.isEmailVerified = data.isEmailVerified !== undefined ? data.isEmailVerified : false // Boolean
    this.emailVerificationOtp = data.emailVerificationOtp || null // String (6-digit code)
    this.emailVerificationOtpExpires = data.emailVerificationOtpExpires || null // ISO string
    this.createdAt = data.createdAt || new Date().toISOString() // ISO string
    this.updatedAt = data.updatedAt || new Date().toISOString() // ISO string
  }

  // Validation
  static validate(user) {
    const errors = []
    
    if (!user.username || user.username.length < 3 || user.username.length > 30) {
      errors.push('Username must be between 3 and 30 characters')
    }
    
    if (!user.email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(user.email)) {
      errors.push('Invalid email format')
    }
    
    if (!user.password || user.password.length < 6) {
      errors.push('Password must be at least 6 characters')
    }
    
    if (!user.fullName) {
      errors.push('Full name is required')
    }
    
    if (user.bio && user.bio.length > 500) {
      errors.push('Bio must not exceed 500 characters')
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  // Convert to DynamoDB format
  toDynamoDB() {
    return {
      userId: this.userId,
      username: this.username,
      email: this.email,
      password: this.password,
      fullName: this.fullName,
      avatar: this.avatar,
      bio: this.bio,
      province: this.province,
      district: this.district,
      location: this.location,
      isOnline: this.isOnline,
      lastSeen: this.lastSeen,
      friends: this.friends,
      blockedUsers: this.blockedUsers,
      resetPasswordToken: this.resetPasswordToken,
      resetPasswordExpires: this.resetPasswordExpires,
      verificationToken: this.verificationToken,
      verificationTokenExpires: this.verificationTokenExpires,
      isEmailVerified: this.isEmailVerified,
      emailVerificationOtp: this.emailVerificationOtp,
      emailVerificationOtpExpires: this.emailVerificationOtpExpires,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }

  // Convert from DynamoDB format
  static fromDynamoDB(data) {
    return new User(data)
  }
}
