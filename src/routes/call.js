import express from 'express'
import callController from '../controllers/CallController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/active/current', callController.getCurrentCall.bind(callController))
router.get('/conversations/:conversationId/active', callController.getActiveConversationCall.bind(callController))
router.post('/start', callController.startCall.bind(callController))
router.post('/:callId/accept', callController.acceptCall.bind(callController))
router.post('/:callId/join', callController.joinCall.bind(callController))
router.post('/:callId/decline', callController.declineCall.bind(callController))
router.post('/:callId/end', callController.endCall.bind(callController))
router.post('/:callId/attendee', callController.getAttendee.bind(callController))
router.get('/:callId', callController.getCall.bind(callController))

export default router
