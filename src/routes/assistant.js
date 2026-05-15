import { Router } from 'express'
import assistantController from '../controllers/AssistantController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = Router()

router.use(authenticateToken)

router.get('/urban-suggestions', assistantController.getUrbanSuggestions.bind(assistantController))
router.post('/urban-chat', assistantController.urbanChat.bind(assistantController))

export default router
