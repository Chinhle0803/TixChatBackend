import { GeoRoutesClient, CalculateRoutesCommand } from '@aws-sdk/client-geo-routes'
import config from '../../config/index.js'
import geocodeTool from './geocodeTool.js'

const createClient = () => {
  const options = {
    region: config.awsGeoRoutesRegion,
  }

  if (config.awsAccessKeyId && config.awsSecretAccessKey) {
    options.credentials = {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    }
  }

  return new GeoRoutesClient(options)
}

class RouteTool {
  constructor() {
    this.name = 'routeTool'
    this.client = createClient()
  }

  async execute(args = {}, ctx = {}) {
    const fallbackProvince = ctx?.profileLocation?.province || ''
    const originResult = await geocodeTool.execute({
      query: args?.origin || ctx?.parsedQuery?.spatial?.origin || '',
      fallbackProvince,
    })
    const destinationResult = await geocodeTool.execute({
      query: args?.destination || ctx?.parsedQuery?.spatial?.destination || '',
      fallbackProvince,
    })

    if (!originResult?.available || !destinationResult?.available) {
      return {
        available: false,
        reason: 'route_endpoints_unresolved',
        origin: originResult,
        destination: destinationResult,
      }
    }

    const command = new CalculateRoutesCommand({
      Origin: [originResult.lng, originResult.lat],
      Destination: [destinationResult.lng, destinationResult.lat],
      TravelMode: args?.mode || config.awsGeoRouteMode,
      LegGeometryFormat: 'Simple',
    })

    const response = await this.client.send(command)
    const route = Array.isArray(response?.Routes) ? response.Routes[0] : null
    const legs = Array.isArray(route?.Legs) ? route.Legs : []
    const decodedPoints = legs.flatMap((leg) => leg?.Geometry?.LineString || [])
      .map((point) => ({
        lng: Number(point?.[0]),
        lat: Number(point?.[1]),
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))

    const steps = legs.flatMap((leg) => {
      const travelSteps =
        leg?.VehicleLegDetails?.TravelSteps ||
        leg?.PedestrianLegDetails?.TravelSteps ||
        leg?.FerryLegDetails?.TravelSteps ||
        []

      return travelSteps.map((step) => ({
        instruction: step?.Instruction || '',
        distanceMeters: Number(step?.Distance || 0),
        durationSeconds: Number(step?.Duration || 0),
      }))
    })

    return {
      available: Boolean(route),
      origin: originResult,
      destination: destinationResult,
      polyline: legs[0]?.Geometry?.Polyline || null,
      decodedPoints,
      distanceMeters: Number(route?.Summary?.Distance || 0),
      durationSeconds: Number(route?.Summary?.Duration || 0),
      steps,
      bounds: route?.MajorRoadLabels || null,
      raw: route,
    }
  }
}

export default new RouteTool()
