import { verifyToken } from '../utils/tokenUtils.js'

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token is required' })
  }

  const decoded = verifyToken(token, 'access')
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' })
  }

  req.userId = decoded.userId
  next()
}

export const refreshTokenMiddleware = (req, res, next) => {
  const refreshToken = req.body.refreshToken

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token is required' })
  }

  const decoded = verifyToken(refreshToken, 'refresh')
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired refresh token' })
  }

  req.userId = decoded.userId
  next()
}
