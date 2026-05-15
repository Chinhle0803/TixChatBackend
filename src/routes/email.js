import express from 'express'
import AuthService from '../services/AuthService.js'

const router = express.Router()

/**
 * Verify email with token
 * GET /api/email/verify/:token
 *
 * @param {string} token - Email verification token
 * @returns {object} Success message and user data
 */
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params

    if (!token) {
      return res.status(400).json({
        error: 'Verification token is required',
      })
    }

    const result = await AuthService.verifyEmail(token)

    return res.status(200).json(result)
  } catch (error) {
    console.error('❌ Email verification error:', error.message)

    return res.status(400).json({
      error: error.message || 'Email verification failed',
    })
  }
})

export default router
