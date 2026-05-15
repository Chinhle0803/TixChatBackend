import express from 'express'
import notificationController from '../controllers/NotificationController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

router.use(authenticateToken)

router.post('/register-token', notificationController.registerToken.bind(notificationController))
router.delete('/register-token', notificationController.unregisterToken.bind(notificationController))
router.patch('/preferences', notificationController.updatePreferences.bind(notificationController))

export default router
