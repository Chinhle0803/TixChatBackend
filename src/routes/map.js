import express from 'express'
import mapProxyController from '../controllers/MapProxyController.js'
import { authenticateToken } from '../middleware/auth.js'
import { createIpAllowlistMiddleware } from '../middleware/ipAllowlist.js'
import config from '../config/index.js'

const router = express.Router()

router.use(authenticateToken)
router.use(createIpAllowlistMiddleware(config.awsLocationAllowedIps))

router.get('/style', mapProxyController.getStyle.bind(mapProxyController))
router.get('/tiles/:tileset/:z/:x/:y', mapProxyController.getTile.bind(mapProxyController))
router.get('/sprites/:colorScheme/:variant/:fileName', mapProxyController.getSprites.bind(mapProxyController))
router.get('/glyphs/:fontStack/:fontUnicodeRange', mapProxyController.getGlyphs.bind(mapProxyController))

export default router
