import mediaProxyService from '../services/MediaProxyService.js'

const getErrorStatus = (error) => {
  const statusCode = Number(error?.statusCode || 0)
  if ([400, 403, 404].includes(statusCode)) return statusCode
  if (error?.message === 'url is required' || error?.message === 'url is invalid') return 400
  if (error?.message?.includes('not allowed')) return 403
  if (error?.message?.includes('not an image')) return 415
  return 502
}

class MediaProxyController {
  async getImage(req, res) {
    try {
      const payload = await mediaProxyService.fetchImage(req.query?.url)
      res.status(payload.statusCode)
      res.setHeader('Content-Type', payload.contentType)
      res.setHeader('Cache-Control', payload.cacheControl)
      res.send(payload.body)
    } catch (error) {
      res.status(getErrorStatus(error)).json({ error: error.message || 'Failed to proxy image' })
    }
  }
}

export default new MediaProxyController()
