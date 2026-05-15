import assistantService from '../services/AssistantService.js'
import { urbanAssistantChatValidation } from '../utils/validation.js'

class AssistantController {
  async getUrbanSuggestions(req, res) {
    try {
      const suggestions = await assistantService.getUrbanSuggestions(req.userId)
      return res.json({ suggestions })
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load assistant suggestions' })
    }
  }

  async urbanChat(req, res) {
    try {
      const { error, value } = urbanAssistantChatValidation(req.body)
      if (error) {
        return res.status(400).json({ error: error.details[0].message })
      }

      const result = await assistantService.answerUrbanQuestion(req.userId, value)
      return res.json(result)
    } catch (error) {
      const status = Number(error?.statusCode || 500)
      return res.status(status).json({
        error: status >= 500 ? 'Urban assistant is temporarily unavailable' : (error.message || 'Urban assistant request failed'),
      })
    }
  }
}

export default new AssistantController()
