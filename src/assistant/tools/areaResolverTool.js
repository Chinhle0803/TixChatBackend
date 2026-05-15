import config from '../../config/index.js'
import geocodeTool from './geocodeTool.js'

const normalizeAreaPhrase = (value = '') =>
  String(value || '')
    .replace(/^khu\s+vuc\s+/i, '')
    .replace(/^o\s+/i, '')
    .replace(/^tai\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

const resolveDefaultRadiusKm = (area = '') => {
  const normalized = String(area || '').toLowerCase()
  if (normalized.includes('phường') || normalized.includes('xa ') || normalized.includes('xã')) return 1.5
  if (normalized.includes('quận') || normalized.includes('quan ') || normalized.includes('huyện') || normalized.includes('huyen ')) return 2
  if (normalized.includes('thành phố') || normalized.includes('thanh pho') || normalized.includes('tỉnh') || normalized.includes('tinh ')) return 5
  return 2
}

class AreaResolverTool {
  constructor() {
    this.name = 'areaResolverTool'
  }

  async execute(args = {}, ctx = {}) {
    const area = normalizeAreaPhrase(args?.area || ctx?.parsedQuery?.spatial?.area || '')
    const fallbackProvince = ctx?.profileLocation?.province || ''
    if (!area) {
      return { available: false, reason: 'missing_area' }
    }

    const resolved = await geocodeTool.execute({
      query: area,
      fallbackProvince,
    })

    if (!resolved?.available) {
      return {
        available: false,
        reason: resolved?.reason || 'geocode_failed',
        area,
      }
    }

    return {
      available: true,
      area,
      center: {
        lat: resolved.lat,
        lng: resolved.lng,
      },
      district: resolved.district,
      province: resolved.province,
      address: resolved.address,
      radiusKm: Number(args?.radiusKm || resolveDefaultRadiusKm(area) || config.aiDefaultRadiusKm),
    }
  }
}

export default new AreaResolverTool()
