import { Router } from 'express'
import messageController from '../controllers/MessageController.js'
import { authenticateToken } from '../middleware/auth.js'
import { uploadMessageAttachment } from '../middleware/upload.js'

const router = Router()

router.use(authenticateToken)

router.post('/', (req, res, next) => {
  console.log('📨 POST /messages endpoint hit')
  messageController.sendMessage(req, res, next)
})
router.post(
  '/attachment/forward',
  messageController.forwardAttachmentByUrl.bind(messageController)
)
router.post(
  '/attachment',
  uploadMessageAttachment.single('attachment'),
  messageController.sendAttachmentMessage.bind(messageController)
)
router.get('/unread/counts', messageController.getUnreadCounts.bind(messageController))
router.get('/:conversationId', messageController.getConversationMessages.bind(messageController))
router.put('/:conversationId/:messageId', messageController.editMessage.bind(messageController))
router.delete('/:conversationId/:messageId/delete-for', messageController.deleteMessage.bind(messageController))
router.delete('/:conversationId/:messageId', messageController.deleteMessageForAll.bind(messageController))
router.post('/:conversationId/:messageId/delivered', messageController.markAsDelivered.bind(messageController))
router.post('/:conversationId/seen', messageController.markAsSeen.bind(messageController))
router.post('/:conversationId/:messageId/emoji', messageController.addEmoji.bind(messageController))
router.delete('/:conversationId/:messageId/emoji', messageController.removeEmoji.bind(messageController))

export default router
