import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'
import { docClient } from '../db/dynamodb.js'
import config from '../config/index.js'
import { comparePostsByRegion, normalizePostLocation, normalizeRegionContext } from '../utils/urbanRegion.js'

const POSTS_TABLE = config.dynamodbPostsTable
const COMMENTS_TABLE = config.dynamodbCommentsTable

const encodeCursor = (key) => key ? Buffer.from(JSON.stringify(key)).toString('base64') : null
const decodeCursor = (cursor) => {
  if (!cursor) return null
  if (typeof cursor === 'object') return cursor
  try {
    return JSON.parse(Buffer.from(String(cursor), 'base64').toString('utf8'))
  } catch {
    try {
      return JSON.parse(String(cursor))
    } catch {
      return null
    }
  }
}

const toNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const getDistanceKm = (a, b) => {
  const lat1 = toNumber(a?.lat)
  const lng1 = toNumber(a?.lng)
  const lat2 = toNumber(b?.lat)
  const lng2 = toNumber(b?.lng)
  if ([lat1, lng1, lat2, lng2].some((value) => value === null)) return Infinity

  const earthRadiusKm = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const rLat1 = (lat1 * Math.PI) / 180
  const rLat2 = (lat2 * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

class PostRepository {
  async scanPosts(params = {}) {
    const items = []
    let lastEvaluatedKey = params.ExclusiveStartKey || undefined

    do {
      const scanParams = { ...params }
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey
      } else {
        delete scanParams.ExclusiveStartKey
      }

      const result = await docClient.send(new ScanCommand(scanParams))
      items.push(...(result.Items || []))
      lastEvaluatedKey = result.LastEvaluatedKey
    } while (lastEvaluatedKey)

    return items
  }

  async create(postData) {
    const now = new Date().toISOString()
    const postId = uuidv4()
    const location = normalizePostLocation(postData.location)
    const item = {
      postId,
      authorId: postData.authorId,
      content: postData.content,
      images: postData.images || [],
      location,
      geohashPrefix: location?.geohash ? String(location.geohash).slice(0, 6) : 'unknown',
      category: postData.category,
      status: postData.status || 'pending',
      reactions: {},
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    await docClient.send(new PutCommand({ TableName: POSTS_TABLE, Item: item }))
    return item
  }

  async findById(postId) {
    const result = await docClient.send(new GetCommand({
      TableName: POSTS_TABLE,
      Key: { postId },
    }))

    return result.Item || null
  }

  async list({ limit = 20, cursor = null, category, status, authorId, province, district, fallbackProvince } = {}) {
    const requestedLimit = Math.min(Number(limit) || 20, 100)
    const regionContext = normalizeRegionContext({ province, district, fallbackProvince })
    const expressionNames = {}
    const expressionValues = {}
    const filters = []

    if (category) {
      expressionNames['#category'] = 'category'
      expressionValues[':category'] = category
      filters.push('#category = :category')
    }

    if (status) {
      expressionNames['#status'] = 'status'
      expressionValues[':status'] = status
      filters.push('#status = :status')
    }

    if (authorId) {
      expressionNames['#authorId'] = 'authorId'
      expressionValues[':authorId'] = authorId
      filters.push('#authorId = :authorId')
    }

    const params = {
      TableName: POSTS_TABLE,
    }

    const decodedCursor = decodeCursor(cursor)
    if (decodedCursor) {
      params.ExclusiveStartKey = decodedCursor
    }

    if (filters.length) {
      params.FilterExpression = filters.join(' AND ')
      params.ExpressionAttributeNames = expressionNames
      params.ExpressionAttributeValues = expressionValues
    }

    const allItems = await this.scanPosts(params)
    const posts = allItems
      .map((post) => ({
        ...post,
        location: normalizePostLocation(post.location),
      }))
      .sort((a, b) => comparePostsByRegion(a, b, regionContext))
      .slice(0, requestedLimit)

    return {
      posts,
      nextCursor: null,
    }
  }

  async updateStatus(postId, status) {
    const result = await docClient.send(new UpdateCommand({
      TableName: POSTS_TABLE,
      Key: { postId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }))

    return result.Attributes || null
  }

  async updateLocation(postId, location) {
    const normalizedLocation = normalizePostLocation(location)
    const result = await docClient.send(new UpdateCommand({
      TableName: POSTS_TABLE,
      Key: { postId },
      UpdateExpression: 'SET #location = :location, geohashPrefix = :geohashPrefix, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#location': 'location',
      },
      ExpressionAttributeValues: {
        ':location': normalizedLocation,
        ':geohashPrefix': normalizedLocation?.geohash ? String(normalizedLocation.geohash).slice(0, 6) : 'unknown',
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }))

    return result.Attributes || null
  }

  async updateReactions(postId, reactions) {
    const result = await docClient.send(new UpdateCommand({
      TableName: POSTS_TABLE,
      Key: { postId },
      UpdateExpression: 'SET reactions = :reactions, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':reactions': reactions,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }))

    return result.Attributes || null
  }

  async createComment({ postId, authorId, content, parentCommentId = null }) {
    const now = new Date().toISOString()
    const commentId = uuidv4()
    const item = {
      postId,
      commentKey: `${now}#${commentId}`,
      commentId,
      authorId,
      content,
      parentCommentId,
      reactions: {},
      replyCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    await docClient.send(new PutCommand({ TableName: COMMENTS_TABLE, Item: item }))
    await docClient.send(new UpdateCommand({
      TableName: POSTS_TABLE,
      Key: { postId },
      UpdateExpression: 'SET updatedAt = :updatedAt ADD commentCount :inc',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':updatedAt': now,
      },
    }))

    return item
  }

  async findCommentById(postId, commentId) {
    const result = await docClient.send(new QueryCommand({
      TableName: COMMENTS_TABLE,
      KeyConditionExpression: 'postId = :postId',
      FilterExpression: 'commentId = :commentId',
      ExpressionAttributeValues: {
        ':postId': postId,
        ':commentId': commentId,
      },
    }))

    return result.Items?.[0] || null
  }

  async updateCommentReactions({ postId, commentKey, reactions }) {
    const result = await docClient.send(new UpdateCommand({
      TableName: COMMENTS_TABLE,
      Key: { postId, commentKey },
      UpdateExpression: 'SET reactions = :reactions, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':reactions': reactions,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }))

    return result.Attributes || null
  }

  async incrementCommentReplyCount({ postId, commentKey }) {
    await docClient.send(new UpdateCommand({
      TableName: COMMENTS_TABLE,
      Key: { postId, commentKey },
      UpdateExpression: 'SET updatedAt = :updatedAt ADD replyCount :inc',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':updatedAt': new Date().toISOString(),
      },
    }))
  }

  async listComments({ postId, limit = 20, cursor = null }) {
    const params = {
      TableName: COMMENTS_TABLE,
      KeyConditionExpression: 'postId = :postId',
      ExpressionAttributeValues: { ':postId': postId },
      ScanIndexForward: false,
      Limit: Math.min(Number(limit) || 20, 50),
    }

    const decodedCursor = decodeCursor(cursor)
    if (decodedCursor) {
      params.ExclusiveStartKey = decodedCursor
    }

    const result = await docClient.send(new QueryCommand(params))

    return {
      comments: result.Items || [],
      nextCursor: encodeCursor(result.LastEvaluatedKey),
    }
  }

  async nearby({ lat, lng, radiusKm = 5, limit = 50 }) {
    const result = await this.list({ limit: 100 })
    const origin = { lat, lng }
    const posts = result.posts
      .map((post) => ({ ...post, distanceKm: getDistanceKm(origin, post.location) }))
      .filter((post) => post.distanceKm <= Number(radiusKm || 5))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, Math.min(Number(limit) || 50, 100))

    return { posts }
  }

  async inBounds({ north, south, east, west, limit = 100 }) {
    const n = toNumber(north)
    const s = toNumber(south)
    const e = toNumber(east)
    const w = toNumber(west)
    const result = await this.list({ limit: 100 })
    const posts = result.posts.filter((post) => {
      const lat = toNumber(post?.location?.lat)
      const lng = toNumber(post?.location?.lng)
      if (lat === null || lng === null) return false
      return lat <= n && lat >= s && lng <= e && lng >= w
    }).slice(0, Math.min(Number(limit) || 100, 100))

    return { posts }
  }

  async deleteComment(postId, commentKey) {
    await docClient.send(new DeleteCommand({
      TableName: COMMENTS_TABLE,
      Key: { postId, commentKey },
    }))
  }
}

export default new PostRepository()
