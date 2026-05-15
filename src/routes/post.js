import express from 'express'
import postController from '../controllers/PostController.js'
import { authenticateToken } from '../middleware/auth.js'
import { uploadPostImage } from '../middleware/upload.js'

const router = express.Router()

router.use(authenticateToken)

router.get('/', postController.listPosts.bind(postController))
router.post('/', postController.createPost.bind(postController))
router.post('/upload-url', postController.createUploadUrl.bind(postController))
router.post('/upload-image', uploadPostImage.single('image'), postController.uploadImage.bind(postController))
router.get('/nearby', postController.nearby.bind(postController))
router.get('/in-bounds', postController.inBounds.bind(postController))
router.get('/:postId', postController.getPost.bind(postController))
router.patch('/:postId/status', postController.updateStatus.bind(postController))
router.post('/:postId/reactions', postController.addReaction.bind(postController))
router.delete('/:postId/reactions/:reactionType', postController.removeReaction.bind(postController))
router.get('/:postId/comments', postController.listComments.bind(postController))
router.post('/:postId/comments', postController.createComment.bind(postController))
router.post('/:postId/comments/:commentId/reactions', postController.addCommentReaction.bind(postController))
router.delete('/:postId/comments/:commentId/reactions/:reactionType', postController.removeCommentReaction.bind(postController))

export default router
