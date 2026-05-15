import config from '../../config/index.js'
import { dedupeIncidents, sortIncidents } from './reducers.js'

const summarizeLocation = (incident) =>
  String(
    incident?.location?.address ||
    [incident?.location?.district, incident?.location?.province].filter(Boolean).join(', ')
  ).trim()

const buildMapTarget = (incident) => {
  const lat = Number(incident?.location?.lat)
  const lng = Number(incident?.location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '/urban/map'
  const params = new URLSearchParams({
    postId: String(incident?.postId || ''),
    lat: String(lat),
    lng: String(lng),
  })
  return `/urban/map?${params.toString()}`
}

class ContextAssembler {
  assemble({ parsedQuery, execution = {} }) {
    const outputs = execution?.toolOutputs || {}
    const incidentLists = [
      ...(Array.isArray(outputs?.incidentSearchTool?.incidents) ? outputs.incidentSearchTool.incidents : []),
      ...(Array.isArray(outputs?.nearbyTool?.incidents) ? outputs.nearbyTool.incidents : []),
    ]

    const incidents = sortIncidents(dedupeIncidents(incidentLists)).slice(0, config.aiMaxContextPosts)
    const relatedPosts = incidents.slice(0, 3).map((incident) => ({
      postId: incident.postId,
      title: incident.content,
      status: incident.status,
      category: incident.category,
      location: summarizeLocation(incident),
      target: buildMapTarget(incident),
      detailTarget: `/urban/posts/${incident.postId}`,
    }))

    return {
      incidents,
      stats: outputs?.statisticsTool?.stats || [],
      route: outputs?.routeTool?.available ? outputs.routeTool : null,
      area: outputs?.areaResolverTool?.available ? outputs.areaResolverTool : null,
      weather: outputs?.weatherTool || null,
      uncertainty: execution?.trace?.filter((item) => !item.ok) || [],
      uiHints: {
        showIncidentCards: relatedPosts.length > 0,
        actions: [
          { label: 'Mo bang tin', target: '/urban', kind: 'link' },
          { label: 'Mo ban do', target: '/urban/map', kind: 'link' },
          ...(relatedPosts[0] ? [{ label: 'Mo su co gan nhat', target: relatedPosts[0].target, kind: 'link' }] : []),
        ],
        relatedPosts,
      },
    }
  }
}

export default new ContextAssembler()
