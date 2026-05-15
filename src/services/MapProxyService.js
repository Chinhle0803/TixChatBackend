import {
  GeoMapsClient,
  GetGlyphsCommand,
  GetSpritesCommand,
  GetStyleDescriptorCommand,
  GetTileCommand,
} from '@aws-sdk/client-geo-maps'
import { createHash } from 'crypto'
import config from '../config/index.js'

const DEFAULT_TILESET = 'vector.basemap'

const createGeoMapsClient = () => new GeoMapsClient({
  region: config.awsLocationRegion,
  credentials: {
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  },
})

const toBuffer = (blob) => {
  if (!blob) return Buffer.alloc(0)
  if (Buffer.isBuffer(blob)) return blob
  if (blob instanceof Uint8Array) return Buffer.from(blob)
  return Buffer.from(blob)
}

const getAbsoluteMapBaseUrl = (req) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const protocol = forwardedProto || req.protocol || 'http'
  return `${protocol}://${req.get('host')}/api/maps`
}

const getTileProxyUrl = (mapBaseUrl, tileset = DEFAULT_TILESET) =>
  `${mapBaseUrl}/tiles/${encodeURIComponent(tileset)}/{z}/{x}/{y}`

const createWeakEtag = (body) => `W/"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`

const isTileNotFoundError = (error) => (
  Number(error?.$metadata?.httpStatusCode || error?.statusCode || 0) === 404 &&
  /tile not found/i.test(String(error?.message || ''))
)

const rewriteStyleDescriptor = (style, mapBaseUrl) => {
  const rewritten = {
    ...style,
    glyphs: `${mapBaseUrl}/glyphs/{fontstack}/{range}.pbf`,
    sprite: `${mapBaseUrl}/sprites/${encodeURIComponent(config.awsLocationColorScheme)}/${encodeURIComponent(config.awsLocationVariant)}/sprites`,
  }

  if (rewritten.sources && typeof rewritten.sources === 'object') {
    rewritten.sources = Object.fromEntries(
      Object.entries(rewritten.sources).map(([sourceName, source]) => {
        if (!source || typeof source !== 'object') {
          return [sourceName, source]
        }

        const sourceTiles = Array.isArray(source.tiles) ? source.tiles : []
        const firstTile = sourceTiles[0] || ''
        const matchedTileset = String(firstTile).match(/\/tiles\/([^/]+)\//)?.[1]
        const decodedTileset = matchedTileset ? decodeURIComponent(matchedTileset) : DEFAULT_TILESET

        if (source.type === 'vector' || sourceTiles.length > 0) {
          return [
            sourceName,
            {
              ...source,
              tiles: [getTileProxyUrl(mapBaseUrl, decodedTileset)],
            },
          ]
        }

        return [sourceName, source]
      })
    )
  }

  return rewritten
}

class MapProxyService {
  constructor() {
    this.client = createGeoMapsClient()
  }

  assertConfigured() {
    if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
      throw new Error('AWS credentials are required for map proxy')
    }
  }

  async getStyle(req) {
    this.assertConfigured()
    const response = await this.client.send(new GetStyleDescriptorCommand({
      Style: config.awsLocationStyle,
      ColorScheme: config.awsLocationColorScheme,
    }))

    const rawStyle = JSON.parse(toBuffer(response.Blob).toString('utf8'))
    const style = rewriteStyleDescriptor(rawStyle, getAbsoluteMapBaseUrl(req))
    const body = Buffer.from(JSON.stringify(style))

    return {
      body,
      contentType: response.ContentType || 'application/json',
      cacheControl: 'no-cache',
      etag: createWeakEtag(body),
    }
  }

  async getTile({ tileset, z, x, y }) {
    this.assertConfigured()
    try {
      const response = await this.client.send(new GetTileCommand({
        Tileset: tileset,
        Z: z,
        X: x,
        Y: y,
      }))

      return this.formatBinaryResponse(response, 'application/vnd.mapbox-vector-tile')
    } catch (error) {
      if (isTileNotFoundError(error)) {
        return {
          body: Buffer.alloc(0),
          contentType: 'application/vnd.mapbox-vector-tile',
          statusCode: 200,
          cacheControl: 'public, max-age=60',
        }
      }
      throw error
    }
  }

  async getSprites({ colorScheme, variant, fileName }) {
    this.assertConfigured()
    const response = await this.client.send(new GetSpritesCommand({
      Style: config.awsLocationStyle,
      ColorScheme: colorScheme,
      Variant: variant,
      FileName: fileName,
    }))

    const contentType = fileName.endsWith('.json') ? 'application/json' : 'image/png'
    return this.formatBinaryResponse(response, contentType)
  }

  async getGlyphs({ fontStack, fontUnicodeRange }) {
    this.assertConfigured()
    const response = await this.client.send(new GetGlyphsCommand({
      FontStack: fontStack,
      FontUnicodeRange: fontUnicodeRange,
    }))

    return this.formatBinaryResponse(response, 'application/octet-stream')
  }

  formatBinaryResponse(response, fallbackContentType) {
    return {
      body: toBuffer(response.Blob),
      contentType: response.ContentType || fallbackContentType,
      cacheControl: response.CacheControl,
      etag: response.ETag,
    }
  }
}

export default new MapProxyService()
