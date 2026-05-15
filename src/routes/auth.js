import { Router } from 'express'
import authController from '../controllers/AuthController.js'
import { authenticateToken, refreshTokenMiddleware } from '../middleware/auth.js'

const router = Router()

router.post('/register', authController.register.bind(authController))
router.post('/login', authController.login.bind(authController))
router.post('/logout', authenticateToken, authController.logout.bind(authController))
router.post('/refresh-token', refreshTokenMiddleware, authController.refreshToken.bind(authController))
router.get('/me', authenticateToken, authController.getMe.bind(authController))
router.post('/forgot-password', authController.forgotPassword.bind(authController))
router.post('/verify-reset-token', authController.verifyResetToken.bind(authController))
router.post('/reset-password', authController.resetPassword.bind(authController))
router.post('/send-email-verification-otp', authController.sendEmailVerificationOtp.bind(authController))
router.post('/verify-email-otp', authController.verifyEmailOtp.bind(authController))

export default router
