import config from '../../config/index.js'
import postRepository from '../../repositories/PostRepository.js'
import semanticRetriever from '../retrieval/SemanticRetriever.js'

const EARTH_RADIUS_METERS = 6371000

const toRadians = (value) => (Number(value) * Math.PI) / 180

const distanceMetersBetween = (a, b) => {
  const lat1 = Number(a?.lat)
  const lng1 = Number(a?.lng)
  const lat2 = Number(b?.lat)
  const lng2 = Number(b?.lng)
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity

  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const rLat1 = toRadians(lat1)
  const rLat2 = toRadians(lat2)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

const interpolatePoint = (start, end, fraction) => ({
  lat: start.lat + (end.lat - start.lat) * fraction,
  lng: start.lng + (end.lng - start.lng) * fraction,
})

const sampleRoutePoints = (points = [], sampleMeters = config.assistantRouteSampleMeters) => {
  if (!Array.isArray(points) || points.length < 2) return points

  const sampled = [points[0]]
  let carry = 0

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    const segmentDistance = distanceMetersBetween(start, end)
    if (!Number.isFinite(segmentDistance) || segmentDistance <= 0) continue

    let travelled = sampleMeters - carry
    while (travelled < segmentDistance) {
      const fraction = travelled / segmentDistance
      sampled.push(interpolatePoint(start, end, fraction))
      travelled += sampleMeters
    }
    carry = segmentDistance - (travelled - sampleMeters)
  }

  sampled.push(points[points.length - 1])
  return sampled.slice(0, 80)
}

const normalizeForMatch = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[.,/?#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const filterBySemanticTerms = (posts = [], query = '') => {
  const terms = semanticRetriever.buildSearchTerms(query).filter((term) => term.length > 2)
  if (terms.length === 0) return posts

  return posts.filter((post) => {
    const haystack = [
      post?.content,
      post?.category,
      post?.status,
      post?.location?.address,
      post?.location?.district,
      post?.location?.province,
    ]
      .map((item) => normalizeForMatch(item))
      .join(' ')

    return terms.some((term) => haystack.includes(term))
  })
}

const dedupeIncidents = (items = []) => {
  const map = new Map()

  items.forEach((item) => {
    const key = String(item?.postId || '')
    if (!key) return

    const existing = map.get(key)
    if (!existing || Number(item?.minDistanceMeters || Infinity) < Number(existing?.minDistanceMeters || Infinity)) {
      map.set(key, item)
    }
  })

  return [...map.values()]
}

class IncidentSearchTool {
  constructor() {
    this.name = 'incidentSearchTool'
  }

  async execute(args = {}, ctx = {}) {
    const query = ctx?.rewrittenQuestion || ctx?.request?.question || ''

    if (args?.alongRoute) {
      const route = ctx?.toolOutputs?.routeTool
      if (!route?.available || !Array.isArray(route?.decodedPoints) || route.decodedPoints.length === 0) {
        return { available: false, reason: 'route_unavailable', incidents: [] }
      }

      const radiusMeters = Number(args?.radiusMeters || config.assistantRouteIncidentRadiusMeters)
      const sampledPoints = sampleRoutePoints(route.decodedPoints, config.assistantRouteSampleMeters)
      const batches = await Promise.all(
        sampledPoints.map(async (point, index) => {
          const result = await postRepository.nearby({
            lat: point.lat,
            lng: point.lng,
            radiusKm: radiusMeters / 1000,
            limit: 20,
          })

          return (result?.posts || []).map((post) => ({
            ...post,
            minDistanceMeters: distanceMetersBetween(point, post?.location || {}),
            nearestPointIndex: index,
          }))
        })
      )

      const incidents = dedupeIncidents(filterBySemanticTerms(batches.flat(), query))
      return { available: true, incidents, mode: 'alongRoute', sampledPoints }
    }

    const center =
      args?.point ||
      ctx?.toolOutputs?.areaResolverTool?.center ||
      ctx?.toolOutputs?.geocodeTool ||
      ctx?.profileLocation ||
      ctx?.request?.location ||
      null

    const lat = Number(center?.lat)
    const lng = Number(center?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { available: false, reason: 'missing_search_center', incidents: [] }
    }

    const radiusKm = Number(
      args?.radiusKm ||
      ctx?.toolOutputs?.areaResolverTool?.radiusKm ||
      ctx?.request?.radiusKm ||
      config.aiDefaultRadiusKm
    )

    const result = await postRepository.nearby({
      lat,
      lng,
      radiusKm,
      limit: 30,
    })

    const incidents = filterBySemanticTerms(result?.posts || [], query)
    return {
      available: true,
      incidents,
      mode: args?.mode || 'nearPoint',
      center: { lat, lng },
      radiusKm,
    }
  }
}

export default new IncidentSearchTool()
