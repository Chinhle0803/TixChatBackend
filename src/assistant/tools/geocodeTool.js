import { GeoPlacesClient, GeocodeCommand, SearchTextCommand } from '@aws-sdk/client-geo-places'
import config from '../../config/index.js'
import { normalizePostLocation } from '../../utils/urbanRegion.js'
import locationResolutionService from '../../services/LocationResolutionService.js'

const DEFAULT_BIAS_POSITION = [106.700806, 10.776889]

const createClient = () => {
  const options = {
    region: config.awsGeoPlacesRegion,
  }

  if (config.awsAccessKeyId && config.awsSecretAccessKey) {
    options.credentials = {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    }
  }

  return new GeoPlacesClient(options)
}

const formatAddressFromResult = (item = {}) => {
  const address = item?.Address || {}
  const streetLine = [address.AddressNumber, address.Street].filter(Boolean).join(' ').trim()
  return normalizePostLocation({
    address: address.Label || streetLine || item?.Title || '',
    district: address.District || address.SubDistrict || address.Locality || '',
    province: address.Region?.Name || address.SubRegion?.Name || '',
    lat: Array.isArray(item?.Position) ? item.Position[1] : null,
    lng: Array.isArray(item?.Position) ? item.Position[0] : null,
  })
}

const looksLikeAdministrativeArea = (query = '') => {
  const normalized = String(query || '').trim().toLowerCase()
  if (!normalized) return false
  if (/\d/.test(normalized)) return false
  const tokens = normalized.split(/\s+/).filter(Boolean)
  return tokens.length <= 4
}

class GeocodeTool {
  constructor() {
    this.name = 'geocodeTool'
    this.client = createClient()
  }

  async execute(args = {}) {
    const query = String(args?.query || '').trim()
    const fallbackProvince = String(args?.fallbackProvince || '').trim()
    if (!query) {
      return { available: false, reason: 'missing_query' }
    }

    const queryText = fallbackProvince && !query.toLowerCase().includes(fallbackProvince.toLowerCase())
      ? `${query}, ${fallbackProvince}`
      : query

    const biasPosition = Array.isArray(args?.biasPosition) && args.biasPosition.length === 2
      ? args.biasPosition
      : DEFAULT_BIAS_POSITION

    if (looksLikeAdministrativeArea(query)) {
      const legacyResult = await this.executeLegacyFallback(queryText)
      if (legacyResult?.available) {
        return legacyResult
      }
    }

    try {
      const command = new GeocodeCommand({
        QueryText: queryText,
        MaxResults: 5,
        Language: 'vi',
        BiasPosition: biasPosition,
        Filter: {
          IncludeCountries: ['VNM'],
        },
      })

      const response = await this.client.send(command)
      const first = Array.isArray(response?.ResultItems) ? response.ResultItems[0] : null
      if (!first) {
        return await this.executeSearchTextFallback(queryText, biasPosition)
      }

      const location = formatAddressFromResult(first)
      return {
        available: true,
        query: queryText,
        address: location?.address || '',
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        district: location?.district || '',
        province: location?.province || '',
        raw: first,
      }
    } catch (error) {
      if (String(error?.reason || '').includes('UnknownOperation') || String(error?.message || '').includes('Operation Geocode is not supported')) {
        return this.executeSearchTextFallback(queryText, biasPosition)
      }
      return this.executeLegacyFallback(queryText)
    }
  }

  async executeSearchTextFallback(queryText, biasPosition) {
    try {
      const command = new SearchTextCommand({
        QueryText: queryText,
        MaxResults: 5,
        Language: 'vi',
        BiasPosition: biasPosition,
      })

      const response = await this.client.send(command)
      const first = Array.isArray(response?.ResultItems) ? response.ResultItems[0] : null
      if (!first) {
        return this.executeLegacyFallback(queryText)
      }

      const location = formatAddressFromResult(first)
      return {
        available: true,
        query: queryText,
        address: location?.address || '',
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        district: location?.district || '',
        province: location?.province || '',
        raw: first,
      }
    } catch {
      return this.executeLegacyFallback(queryText)
    }
  }

  async executeLegacyFallback(queryText) {
    try {
      const location = await locationResolutionService.geocodeAddress(queryText)
      return {
        available: true,
        query: queryText,
        address: location?.address || '',
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
        district: location?.district || '',
        province: location?.province || '',
        raw: null,
      }
    } catch {
      return { available: false, reason: 'no_result', query: queryText }
    }
  }
}

export default new GeocodeTool()
