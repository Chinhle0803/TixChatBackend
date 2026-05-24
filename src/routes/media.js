import express from 'express'
import mediaProxyController from '../controllers/MediaProxyController.js'

const router = express.Router()

router.get('/image', mediaProxyController.getImage.bind(mediaProxyController))

export default router
