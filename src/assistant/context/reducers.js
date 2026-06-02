const STATUS_PRIORITY = {
  pending: 3,
  in_progress: 2,
  resolved: 1,
}

const CATEGORY_PRIORITY = {
  flood: 4,
  traffic: 4,
  electricity: 3,
  water: 3,
  construction: 2,
  tree: 2,
  waste: 1,
  street_light: 1,
  other: 0,
}

const normalizeForMatch = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[.,/?#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const dedupeIncidents = (incidents = []) => {
  const map = new Map()
  incidents.forEach((incident) => {
    const key = String(incident?.postId || '')
    if (!key) return
    const existing = map.get(key)
    if (!existing || Number(incident?.minDistanceMeters || Infinity) < Number(existing?.minDistanceMeters || Infinity)) {
      map.set(key, incident)
    }
  })
  return [...map.values()]
}

export const sortIncidents = (incidents = [], parsedQuery = {}) => {
  const road = normalizeForMatch(parsedQuery?.spatial?.road || '')
  const area = normalizeForMatch(parsedQuery?.spatial?.area || '')

  const getMatchScore = (incident) => {
    let score = 0
    if (!incident) return score

    const address = normalizeForMatch(incident.location?.address || '')
    const content = normalizeForMatch(incident.content || '')
    const district = normalizeForMatch(incident.location?.district || '')
    const province = normalizeForMatch(incident.location?.province || '')

    // Match road
    if (road) {
      if (address.includes(road) || content.includes(road)) {
        score += 100
      }
    }
    // Match area (district/province/address)
    if (area) {
      if (address.includes(area) || content.includes(area) || district.includes(area) || province.includes(area)) {
        score += 10
      }
    }
    return score
  }

  return [...incidents].sort((a, b) => {
    // 1. Sort by relevance match score
    const scoreA = getMatchScore(a)
    const scoreB = getMatchScore(b)
    const scoreDiff = scoreB - scoreA
    if (scoreDiff !== 0) return scoreDiff

    // 2. Sort by status
    const statusDiff = (STATUS_PRIORITY[b?.status] || 0) - (STATUS_PRIORITY[a?.status] || 0)
    if (statusDiff !== 0) return statusDiff

    // 3. Sort by category
    const categoryDiff = (CATEGORY_PRIORITY[b?.category] || 0) - (CATEGORY_PRIORITY[a?.category] || 0)
    if (categoryDiff !== 0) return categoryDiff

    // 4. Sort by distance
    const distanceDiff = Number(a?.minDistanceMeters || 0) - Number(b?.minDistanceMeters || 0)
    if (distanceDiff !== 0) return distanceDiff

    return String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''))
  })
}
