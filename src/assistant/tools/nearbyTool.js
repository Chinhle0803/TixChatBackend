import postRepository from '../../repositories/PostRepository.js'

class NearbyTool {
  constructor() {
    this.name = 'nearbyTool'
  }

  async execute(args = {}, ctx = {}) {
    const location =
      args?.location ||
      ctx?.request?.location ||
      ctx?.profileLocation ||
      ctx?.toolOutputs?.areaResolverTool?.center ||
      null

    const lat = Number(location?.lat)
    const lng = Number(location?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { available: false, reason: 'missing_coordinates', incidents: [] }
    }

    const radiusKm = Number(args?.radiusKm || ctx?.toolOutputs?.areaResolverTool?.radiusKm || ctx?.request?.radiusKm || 2)
    const result = await postRepository.nearby({
      lat,
      lng,
      radiusKm,
      limit: Number(args?.limit || 20),
    })

    return {
      available: true,
      center: { lat, lng },
      radiusKm,
      incidents: result?.posts || [],
    }
  }
}

export default new NearbyTool()
