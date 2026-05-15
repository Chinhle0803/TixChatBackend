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

export const sortIncidents = (incidents = []) =>
  [...incidents].sort((a, b) => {
    const statusDiff = (STATUS_PRIORITY[b?.status] || 0) - (STATUS_PRIORITY[a?.status] || 0)
    if (statusDiff !== 0) return statusDiff

    const categoryDiff = (CATEGORY_PRIORITY[b?.category] || 0) - (CATEGORY_PRIORITY[a?.category] || 0)
    if (categoryDiff !== 0) return categoryDiff

    const distanceDiff = Number(a?.minDistanceMeters || 0) - Number(b?.minDistanceMeters || 0)
    if (distanceDiff !== 0) return distanceDiff

    return String(b?.createdAt || '').localeCompare(String(a?.createdAt || ''))
  })
