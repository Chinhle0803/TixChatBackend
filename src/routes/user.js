import { Router } from 'express'
import userController from '../controllers/UserController.js'
import { authenticateToken } from '../middleware/auth.js'
import { uploadAvatar } from '../middleware/upload.js'

const router = Router()

router.use(authenticateToken)

// Profile endpoints
router.get('/profile/current', userController.getCurrentProfile.bind(userController))
router.get('/profile/:userId', userController.getProfile.bind(userController))
router.put('/profile', userController.updateProfile.bind(userController))

// Password endpoints
router.post('/password/change', userController.changePassword.bind(userController))

// Avatar endpoints
router.post('/avatar', uploadAvatar.single('avatar'), userController.updateAvatar.bind(userController))

// Search and friends endpoints
router.get('/search', userController.searchUsers.bind(userController))
router.post('/friend/request', userController.sendFriendRequest.bind(userController))
router.get('/friend/requests', userController.getPendingFriendRequests.bind(userController))
router.post('/friend/accept', userController.acceptFriendRequest.bind(userController))
router.post('/friend/reject', userController.rejectFriendRequest.bind(userController))
router.post('/friend/add', userController.addFriend.bind(userController))
router.post('/friend/remove', userController.removeFriend.bind(userController))
router.get('/friends', userController.getFriends.bind(userController))
router.get('/online', userController.getOnlineUsers.bind(userController))

// Block endpoints
router.post('/block', userController.blockUser.bind(userController))
router.post('/unblock', userController.unblockUser.bind(userController))

export default router
