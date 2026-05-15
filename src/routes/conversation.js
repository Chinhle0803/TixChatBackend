import { Router } from 'express'
import conversationController from '../controllers/ConversationController.js'
import { authenticateToken } from '../middleware/auth.js'
import { uploadAvatar } from '../middleware/upload.js'

const router = Router()

router.use(authenticateToken)

router.post('/', conversationController.createConversation.bind(conversationController))
router.get('/', conversationController.getUserConversations.bind(conversationController))
router.get('/search', conversationController.searchConversations.bind(conversationController))
router.get('/:conversationId/participants', conversationController.getParticipants.bind(conversationController))
router.patch('/:conversationId/participants/:participantId/role', conversationController.updateParticipantRole.bind(conversationController))
router.patch('/:conversationId/group-settings', conversationController.updateGroupSettings.bind(conversationController))
router.post('/:conversationId/avatar', uploadAvatar.single('avatar'), conversationController.updateConversationAvatar.bind(conversationController))
router.get('/:conversationId/blocked-users', conversationController.getBlockedUsers.bind(conversationController))
router.post('/:conversationId/blocked-users/:userId', conversationController.blockUser.bind(conversationController))
router.delete('/:conversationId/blocked-users/:userId', conversationController.unblockUser.bind(conversationController))
router.post('/:conversationId/leave', conversationController.leaveConversation.bind(conversationController))
router.delete('/:conversationId/dissolve', conversationController.dissolveConversation.bind(conversationController))
router.get('/:conversationId', conversationController.getConversation.bind(conversationController))
router.put('/:conversationId', conversationController.updateConversation.bind(conversationController))
router.post('/:conversationId/participants', conversationController.addParticipant.bind(conversationController))
router.delete('/:conversationId/participants/:participantId', conversationController.removeParticipant.bind(conversationController))
router.post('/:conversationId/archive', conversationController.archiveConversation.bind(conversationController))
router.delete('/:conversationId', conversationController.deleteConversation.bind(conversationController))

export default router
