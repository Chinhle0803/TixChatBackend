import { normalizeExecutionPlan } from './planSchemas.js'

class AIPlanner {
  buildPlan(parsedQuery = {}) {
    const intent = String(parsedQuery?.intent || 'unsupported')

    switch (intent) {
      case 'area_incident_check':
        return normalizeExecutionPlan({
          steps: [
            { tool: 'areaResolverTool', args: { area: parsedQuery?.spatial?.area || '' } },
            { tool: 'incidentSearchTool', args: { mode: 'withinArea' } },
            { tool: 'statisticsTool', args: { mode: 'area' } },
          ],
          responseMode: 'area_summary',
        })
      case 'route_incident_check':
        return normalizeExecutionPlan({
          steps: [
            {
              tool: 'routeTool',
              args: {
                origin: parsedQuery?.spatial?.origin || '',
                destination: parsedQuery?.spatial?.destination || '',
              },
            },
            {
              tool: 'incidentSearchTool',
              args: {
                alongRoute: true,
                radiusMeters: 300,
              },
            },
            { tool: 'statisticsTool', args: { mode: 'route' } },
          ],
          responseMode: 'route_summary',
        })
      case 'road_incident_check':
        return normalizeExecutionPlan({
          steps: [
            { tool: 'geocodeTool', args: { query: parsedQuery?.spatial?.road || '' } },
            { tool: 'incidentSearchTool', args: { mode: 'nearRoad' } },
            { tool: 'statisticsTool', args: { mode: 'road' } },
          ],
          responseMode: 'road_summary',
        })
      case 'nearby_incident_check':
        return normalizeExecutionPlan({
          steps: [
            { tool: 'nearbyTool', args: {} },
            { tool: 'statisticsTool', args: { mode: 'nearby' } },
          ],
          responseMode: 'nearby_summary',
        })
      case 'trend_summary':
        return normalizeExecutionPlan({
          steps: [
            { tool: 'incidentSearchTool', args: { mode: 'trend' } },
            { tool: 'statisticsTool', args: { mode: 'trend' } },
          ],
          responseMode: 'trend_summary',
        })
      case 'report_guidance':
        return normalizeExecutionPlan({
          steps: [
            { tool: 'areaResolverTool', args: { area: parsedQuery?.spatial?.area || '' } },
            { tool: 'incidentSearchTool', args: { mode: 'withinArea' } },
          ],
          responseMode: 'report_guidance',
        })
      default:
        return normalizeExecutionPlan({
          steps: [],
          responseMode: 'unsupported',
        })
    }
  }
}

export default new AIPlanner()
