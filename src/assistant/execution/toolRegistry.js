import geocodeTool from '../tools/geocodeTool.js'
import areaResolverTool from '../tools/areaResolverTool.js'
import routeTool from '../tools/routeTool.js'
import incidentSearchTool from '../tools/incidentSearchTool.js'
import nearbyTool from '../tools/nearbyTool.js'
import statisticsTool from '../tools/statisticsTool.js'
import weatherTool from '../tools/weatherTool.js'

export const toolRegistry = {
  [geocodeTool.name]: geocodeTool,
  [areaResolverTool.name]: areaResolverTool,
  [routeTool.name]: routeTool,
  [incidentSearchTool.name]: incidentSearchTool,
  [nearbyTool.name]: nearbyTool,
  [statisticsTool.name]: statisticsTool,
  [weatherTool.name]: weatherTool,
}

export default toolRegistry
