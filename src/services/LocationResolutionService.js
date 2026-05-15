import redisCache from './RedisCacheService.js'
import {
  buildVietnameseAddressFromGeocode,
  isMeaningfulAddress,
  normalizePostLocation,
} from '../utils/urbanRegion.js'

const REVERSE_GEOCODE_TTL_SECONDS = 24 * 60 * 60
const FORWARD_GEOCODE_TTL_SECONDS = 24 * 60 * 60

const normalizeComparable = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()

const hasUsableCoordinates = (location = {}) => (
  Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng))
)

const buildSearchAddress = (location = {}) => {
  const parts = [
    String(location?.address || '').trim(),
    String(location?.district || '').trim(),
    String(location?.province || '').trim(),
    'Viet Nam',
  ].filter(Boolean)

  return [...new Set(parts)].join(', ')
}

const toRoundedCoordinate = (value) => Number(Number(value || 0).toFixed(5))

const extractRegionFromReverseGeocode = (payload = {}, coordinates = {}) => {
  const address = payload?.address || {}
  const formatted = buildVietnameseAddressFromGeocode(address, coordinates)
  return {
    address: formatted.address,
    lat: coordinates.lat,
    lng: coordinates.lng,
    province: formatted.province,
    district: formatted.district,
  }
}

class LocationResolutionService {
  buildCacheKey({ lat, lng }) {
    return `geo:reverse:${toRoundedCoordinate(lat)}:${toRoundedCoordinate(lng)}`
  }

  buildForwardCacheKey(query) {
    return `geo:forward:${normalizeComparable(query).replace(/\s+/g, '-')}`
  }

  needsEnrichment(location = {}) {
    if (!location || typeof location !== 'object') return false
    const hasCoordinates = Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng))
    if (!hasCoordinates) return false

    const normalized = normalizePostLocation(location)
    return !(
      isMeaningfulAddress(normalized?.address) &&
      normalized?.province &&
      normalized?.district
    )
  }

  async reverseGeocode({ lat, lng }) {
    const cacheKey = this.buildCacheKey({ lat, lng })
    return redisCache.remember(cacheKey, REVERSE_GEOCODE_TTL_SECONDS, async () => {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=vi`,
        {
          headers: {
            'User-Agent': 'TixChat/1.0 (urban-location-resolution)',
            Accept: 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Reverse geocode failed (${response.status})`)
      }

      const payload = await response.json()
      return extractRegionFromReverseGeocode(payload, { lat, lng })
    })
  }

  async geocodeAddress(query) {
    const normalizedQuery = String(query || '').trim()
    if (!normalizedQuery) {
      throw new Error('Address query is required')
    }

    const cacheKey = this.buildForwardCacheKey(normalizedQuery)
    return redisCache.remember(cacheKey, FORWARD_GEOCODE_TTL_SECONDS, async () => {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=vi&q=${encodeURIComponent(normalizedQuery)}`,
        {
          headers: {
            'User-Agent': 'TixChat/1.0 (urban-location-resolution)',
            Accept: 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Forward geocode failed (${response.status})`)
      }

      const payload = await response.json()
      const first = Array.isArray(payload) ? payload[0] : null
      if (!first) {
        throw new Error('No geocode result found')
      }

      return extractRegionFromReverseGeocode(
        {
          display_name: first.display_name,
          address: first.address || {},
        },
        {
          lat: Number(first.lat),
          lng: Number(first.lon),
        }
      )
    })
  }

  async enrichLocation(location = {}) {
    const normalized = normalizePostLocation(location)
    if (!this.needsEnrichment(normalized)) {
      return normalized
    }

    const lat = Number(normalized?.lat)
    const lng = Number(normalized?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return normalized
    }

    try {
      const resolved = await this.reverseGeocode({ lat, lng })
      return normalizePostLocation({
        ...normalized,
        address: isMeaningfulAddress(normalized?.address) ? normalized.address : resolved.address,
        province: normalized?.province || resolved?.province || '',
        district: normalized?.district || resolved?.district || '',
      })
    } catch {
      return normalized
    }
  }

  async resolveProfileLocation(location = {}) {
    const normalized = normalizePostLocation(location)
    if (!normalized) return null

    if (hasUsableCoordinates(normalized)) {
      return this.enrichLocation(normalized)
    }

    const query = buildSearchAddress(normalized)
    if (!query) {
      return normalized
    }

    try {
      const resolved = await this.geocodeAddress(query)
      return normalizePostLocation({
        ...resolved,
        address: isMeaningfulAddress(normalized?.address) ? normalized.address : resolved.address,
        province: normalized?.province || resolved?.province || '',
        district: normalized?.district || resolved?.district || '',
      })
    } catch {
      return normalized
    }
  }
}

export default new LocationResolutionService()
