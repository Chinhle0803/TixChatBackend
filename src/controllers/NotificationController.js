import notificationService from '../services/NotificationService.js'

class NotificationController {
  async registerToken(req, res) {
    try {
      const token = await notificationService.registerToken(req.userId, req.body || {})
      res.status(200).json({ token })
    } catch (error) {
      res.status(400).json({ error: error.message || 'Failed to register notification token' })
    }
  }

  async unregisterToken(req, res) {
    try {
      await notificationService.unregisterToken(req.userId, req.body || {})
      res.status(200).json({ success: true })
    } catch (error) {
      res.status(400).json({ error: error.message || 'Failed to unregister notification token' })
    }
  }

  async updatePreferences(req, res) {
    try {
      const result = await notificationService.updatePreferences(req.userId, req.body || {})
      res.status(200).json(result)
    } catch (error) {
      res.status(400).json({ error: error.message || 'Failed to update notification preferences' })
    }
  }
}

export default new NotificationController()
