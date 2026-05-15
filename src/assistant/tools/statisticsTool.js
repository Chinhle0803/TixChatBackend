import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import config from '../../config/index.js'
import { docClient } from '../../db/dynamodb.js'

class StatisticsTool {
  constructor() {
    this.name = 'statisticsTool'
  }

  async execute(args = {}, ctx = {}) {
    try {
      const response = await docClient.send(
        new ScanCommand({
          TableName: config.dynamodbUrbanStatsTable,
          Limit: 50,
        })
      )

      const stats = Array.isArray(response?.Items) ? response.Items : []
      const areaContext = ctx?.toolOutputs?.areaResolverTool || null
      const category = ctx?.parsedQuery?.entities?.category || ''

      const filtered = stats.filter((item) => {
        if (category && String(item?.category || '').toLowerCase() !== String(category).toLowerCase()) {
          return false
        }
        if (areaContext?.district && String(item?.scopeValue || '').toLowerCase().includes(String(areaContext.district).toLowerCase())) {
          return true
        }
        return !areaContext?.district
      })

      return {
        available: true,
        stats: filtered.slice(0, 10),
      }
    } catch (error) {
      return {
        available: false,
        reason: error?.message || 'statistics_failed',
        stats: [],
      }
    }
  }
}

export default new StatisticsTool()
