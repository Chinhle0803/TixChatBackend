import jwt from 'jsonwebtoken'
import config from '../config/index.js'

export const generateToken = (userId, type = 'access') => {
  const secret = type === 'access' ? config.jwtSecret : config.jwtRefreshSecret
  const expire = type === 'access' ? config.jwtExpire : config.jwtRefreshExpire

  return jwt.sign({ userId, type }, secret, {
    expiresIn: expire,
  })
}

export const verifyToken = (token, type = 'access') => {
  try {
    const secret = type === 'access' ? config.jwtSecret : config.jwtRefreshSecret
    return jwt.verify(token, secret)
  } catch (error) {
    return null
  }
}

export const generateTokens = (userId) => {
  const accessToken = generateToken(userId, 'access')
  const refreshToken = generateToken(userId, 'refresh')
  return { accessToken, refreshToken }
}
