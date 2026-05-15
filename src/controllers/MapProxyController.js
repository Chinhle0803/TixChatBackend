import mapProxyService from '../services/MapProxyService.js'

const sendProxyResponse = (res, payload) => {
  if (payload.statusCode) res.status(payload.statusCode)
  if (payload.contentType) res.setHeader('Content-Type', payload.contentType)
  if (payload.cacheControl) res.setHeader('Cache-Control', payload.cacheControl)
  if (payload.etag) res.setHeader('ETag', payload.etag)
  if (payload.statusCode === 204) {
    res.end()
    return
  }
  res.send(payload.body)
}

const getStatusFromError = (error) => {
  const statusCode = Number(error?.$metadata?.httpStatusCode || error?.statusCode || 0)
  if ([400, 401, 403, 404, 429].includes(statusCode)) return statusCode
  if (error?.message?.includes('AWS credentials')) return 500
  return 502
}

const getSafeErrorMessage = (error) => {
  const status = getStatusFromError(error)
  if (status === 403) return 'AWS Location denied the map request'
  if (status === 404) return 'AWS Location map resource was not found'
  if (status === 429) return 'AWS Location map request was throttled'
  if (error?.message?.includes('AWS credentials')) return error.message
  return 'Failed to load map resource'
}

class MapProxyController {
  async getStyle(req, res) {
    try {
      const payload = await mapProxyService.getStyle(req)
      sendProxyResponse(res, payload)
    } catch (error) {
      res.status(getStatusFromError(error)).json({ error: getSafeErrorMessage(error) })
    }
  }

  async getTile(req, res) {
    try {
      const payload = await mapProxyService.getTile({
        tileset: decodeURIComponent(req.params.tileset),
        z: req.params.z,
        x: req.params.x,
        y: req.params.y,
      })
      sendProxyResponse(res, payload)
    } catch (error) {
      res.status(getStatusFromError(error)).json({ error: getSafeErrorMessage(error) })
    }
  }

  async getSprites(req, res) {
    try {
      const payload = await mapProxyService.getSprites({
        colorScheme: decodeURIComponent(req.params.colorScheme),
        variant: decodeURIComponent(req.params.variant),
        fileName: decodeURIComponent(req.params.fileName),
      })
      sendProxyResponse(res, payload)
    } catch (error) {
      res.status(getStatusFromError(error)).json({ error: getSafeErrorMessage(error) })
    }
  }

  async getGlyphs(req, res) {
    try {
      const payload = await mapProxyService.getGlyphs({
        fontStack: decodeURIComponent(req.params.fontStack),
        fontUnicodeRange: decodeURIComponent(req.params.fontUnicodeRange),
      })
      sendProxyResponse(res, payload)
    } catch (error) {
      res.status(getStatusFromError(error)).json({ error: getSafeErrorMessage(error) })
    }
  }
}

export default new MapProxyController()
