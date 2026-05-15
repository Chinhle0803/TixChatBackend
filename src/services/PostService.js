import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import postRepository from '../repositories/PostRepository.js'
import s3Service from './S3Service.js'
import config from '../config/index.js'
import { getIO } from '../utils/ioInstance.js'
import { normalizePostLocation } from '../utils/urbanRegion.js'
import redisCache, { stableSerialize } from './RedisCacheService.js'
import locationResolutionService from './LocationResolutionService.js'

export const POST_CATEGORIES = [
  'electricity',
  'water',
  'traffic',
  'tree',
  'flood',
  'waste',
  'street_light',
  'construction',
  'other',
]

export const POST_STATUSES = ['pending', 'in_progress', 'resolved']
export const REACTION_TYPES = ['like', 'support', 'seen', 'urgent']
export const COMMENT_REACTION_TYPES = ['heart', 'smile', 'like']

const POST_LIST_CACHE_PATTERN = 'posts:list:*'
const POST_MAP_CACHE_PATTERN = 'posts:map:*'

const emitPostEvent = (eventName, payload) => {
  const io = getIO()
  if (io) io.emit(eventName, payload)
}

const getPostCacheKey = (postId) => `posts:detail:${postId}`
const getPostListCacheKey = (query = {}) => `posts:list:${stableSerialize(query)}`
const getPostCommentsCacheKey = (postId, query = {}) => `posts:comments:${postId}:${stableSerialize(query)}`
const getNearbyCacheKey = (query = {}) => `posts:map:nearby:${stableSerialize(query)}`
const getInBoundsCacheKey = (query = {}) => `posts:map:bounds:${stableSerialize(query)}`

const invalidatePostReadCaches = async () => {
  await Promise.all([
    redisCache.delPattern(POST_LIST_CACHE_PATTERN),
    redisCache.delPattern(POST_MAP_CACHE_PATTERN),
  ])
}

const invalidatePostCommentCaches = async (postId) => {
  await Promise.all([
    redisCache.delPattern(`posts:comments:${postId}:*`),
    redisCache.del(getPostCacheKey(postId)),
    invalidatePostReadCaches(),
  ])
}

const assertEnum = (value, allowed, fieldName) => {
  if (!allowed.includes(value)) {
    throw new Error(`${fieldName} is invalid`)
  }
}

const normalizeImages = (images) => {
  if (!Array.isArray(images)) return []
  return images
    .map((image) => {
      if (typeof image === 'string') return image.trim()
      if (image && typeof image === 'object') return image.url || image.key || ''
      return ''
    })
    .filter(Boolean)
    .slice(0, 6)
}

const normalizeLocation = (location = {}) => {
  if (!location || typeof location !== 'object') return null
  const lat = Number(location.lat)
  const lng = Number(location.lng)
  return normalizePostLocation({
    address: String(location.address || '').trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    geohash: String(location.geohash || '').trim(),
    province: String(location.province || '').trim(),
    district: String(location.district || '').trim(),
    fallbackProvince: String(location.fallbackProvince || '').trim(),
    fallbackDistrict: String(location.fallbackDistrict || '').trim(),
  })
}

const isSameLocation = (a = null, b = null) =>
  JSON.stringify(a || null) === JSON.stringify(b || null)

class PostService {
  async normalizePostForRead(post = null) {
    if (!post || typeof post !== 'object') return post

    const normalizedLocation = normalizeLocation(post.location)
    const nextLocation = normalizedLocation
      ? await locationResolutionService.enrichLocation(normalizedLocation)
      : null

    if (!nextLocation) {
      return post
    }

    if (isSameLocation(post.location, nextLocation)) {
      return {
        ...post,
        location: nextLocation,
      }
    }

    try {
      const updated = await postRepository.updateLocation(post.postId, nextLocation)
      const safeUpdated = updated || { ...post, location: nextLocation }

      await redisCache.setJson(
        getPostCacheKey(post.postId),
        safeUpdated,
        config.redisPostTtlSeconds
      )

      return safeUpdated
    } catch {
      return {
        ...post,
        location: nextLocation,
      }
    }
  }

  async normalizePostsForRead(posts = []) {
    if (!Array.isArray(posts) || posts.length === 0) return []

    const normalizedPosts = await Promise.all(
      posts.map((post) => this.normalizePostForRead(post))
    )

    return normalizedPosts
  }

  async listPosts(query = {}) {
    const result = await redisCache.remember(
      getPostListCacheKey(query),
      config.redisPostTtlSeconds,
      () => postRepository.list(query)
    )

    const normalizedPosts = await this.normalizePostsForRead(result?.posts || [])
    const normalizedResult = {
      ...(result || {}),
      posts: normalizedPosts,
    }

    await redisCache.setJson(
      getPostListCacheKey(query),
      normalizedResult,
      config.redisPostTtlSeconds
    )

    return normalizedResult
  }

  async createPost(userId, payload = {}) {
    const content = String(payload.content || '').trim()
    if (!content) throw new Error('content is required')
    assertEnum(payload.category, POST_CATEGORIES, 'category')
    const location = await locationResolutionService.enrichLocation(normalizeLocation(payload.location))

    const post = await postRepository.create({
      authorId: userId,
      content,
      images: normalizeImages(payload.images),
      location,
      category: payload.category,
      status: POST_STATUSES.includes(payload.status) ? payload.status : 'pending',
    })

    await Promise.all([
      redisCache.setJson(getPostCacheKey(post.postId), post, config.redisPostTtlSeconds),
      invalidatePostReadCaches(),
    ])

    emitPostEvent('post:created', { post })
    return post
  }

  async getPost(postId) {
    const post = await redisCache.remember(
      getPostCacheKey(postId),
      config.redisPostTtlSeconds,
      () => postRepository.findById(postId)
    )
    if (!post) throw new Error('Post not found')

    return this.normalizePostForRead(post)
  }

  async updateStatus(postId, userId, status) {
    assertEnum(status, POST_STATUSES, 'status')
    const post = await this.getPost(postId)
    if (post.authorId !== userId) {
      throw new Error('Only the author can update status in this version')
    }

    const updated = await postRepository.updateStatus(postId, status)
    await Promise.all([
      redisCache.setJson(getPostCacheKey(postId), updated, config.redisPostTtlSeconds),
      invalidatePostReadCaches(),
    ])
    emitPostEvent('post:status_changed', { post: updated, postId, status })
    emitPostEvent('post:updated', { post: updated })
    return updated
  }

  async addReaction(postId, userId, reactionType) {
    assertEnum(reactionType, REACTION_TYPES, 'reactionType')
    const post = await this.getPost(postId)
    const reactions = { ...(post.reactions || {}) }
    const users = Array.isArray(reactions[reactionType]) ? reactions[reactionType] : []
    reactions[reactionType] = users.includes(userId) ? users : users.concat(userId)
    const updated = await postRepository.updateReactions(postId, reactions)
    await Promise.all([
      redisCache.setJson(getPostCacheKey(postId), updated, config.redisPostTtlSeconds),
      invalidatePostReadCaches(),
    ])
    emitPostEvent('post:reaction_updated', { post: updated, postId, reactions })
    return updated
  }

  async removeReaction(postId, userId, reactionType) {
    assertEnum(reactionType, REACTION_TYPES, 'reactionType')
    const post = await this.getPost(postId)
    const reactions = { ...(post.reactions || {}) }
    reactions[reactionType] = (reactions[reactionType] || []).filter((id) => id !== userId)
    if (reactions[reactionType].length === 0) delete reactions[reactionType]
    const updated = await postRepository.updateReactions(postId, reactions)
    await Promise.all([
      redisCache.setJson(getPostCacheKey(postId), updated, config.redisPostTtlSeconds),
      invalidatePostReadCaches(),
    ])
    emitPostEvent('post:reaction_updated', { post: updated, postId, reactions })
    return updated
  }

  async listComments(postId, query = {}) {
    await this.getPost(postId)
    return redisCache.remember(
      getPostCommentsCacheKey(postId, query),
      config.redisPostTtlSeconds,
      () => postRepository.listComments({ postId, ...query })
    )
  }

  async createComment(postId, userId, payload = {}) {
    const content = String(payload.content || '').trim()
    if (!content) throw new Error('content is required')
    await this.getPost(postId)
    const parentCommentId = String(payload.parentCommentId || '').trim() || null
    let parentComment = null
    if (parentCommentId) {
      parentComment = await postRepository.findCommentById(postId, parentCommentId)
      if (!parentComment) throw new Error('Parent comment not found')
    }

    const comment = await postRepository.createComment({
      postId,
      authorId: userId,
      content,
      parentCommentId,
    })
    if (parentComment) {
      await postRepository.incrementCommentReplyCount({
        postId,
        commentKey: parentComment.commentKey,
      })
    }
    await invalidatePostCommentCaches(postId)
    const post = await this.getPost(postId)
    emitPostEvent('post:comment_created', { postId, comment, post })
    emitPostEvent('post:updated', { post })
    return { comment, post }
  }

  async addCommentReaction(postId, commentId, userId, reactionType) {
    assertEnum(reactionType, COMMENT_REACTION_TYPES, 'reactionType')
    await this.getPost(postId)
    const comment = await postRepository.findCommentById(postId, commentId)
    if (!comment) throw new Error('Comment not found')

    const reactions = { ...(comment.reactions || {}) }
    const users = Array.isArray(reactions[reactionType]) ? reactions[reactionType] : []
    reactions[reactionType] = users.includes(userId) ? users : users.concat(userId)
    const updatedComment = await postRepository.updateCommentReactions({
      postId,
      commentKey: comment.commentKey,
      reactions,
    })
    await redisCache.delPattern(`posts:comments:${postId}:*`)
    emitPostEvent('post:comment_reaction_updated', { postId, comment: updatedComment })
    return { comment: updatedComment }
  }

  async removeCommentReaction(postId, commentId, userId, reactionType) {
    assertEnum(reactionType, COMMENT_REACTION_TYPES, 'reactionType')
    await this.getPost(postId)
    const comment = await postRepository.findCommentById(postId, commentId)
    if (!comment) throw new Error('Comment not found')

    const reactions = { ...(comment.reactions || {}) }
    reactions[reactionType] = (reactions[reactionType] || []).filter((id) => id !== userId)
    if (reactions[reactionType].length === 0) delete reactions[reactionType]
    const updatedComment = await postRepository.updateCommentReactions({
      postId,
      commentKey: comment.commentKey,
      reactions,
    })
    await redisCache.delPattern(`posts:comments:${postId}:*`)
    emitPostEvent('post:comment_reaction_updated', { postId, comment: updatedComment })
    return { comment: updatedComment }
  }

  async createUploadUrl(userId, payload = {}) {
    const fileName = String(payload.fileName || `incident-${Date.now()}.jpg`)
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
    const extension = fileName.split('.').pop() || 'jpg'
    const contentType = payload.contentType || s3Service.getContentType(extension)
    const key = `${config.s3PostImagesFolder}/${userId}/${Date.now()}-${uuidv4()}-${fileName}`
    const bucket = config.s3PostImagesBucket
    const publicUrl = `https://${bucket}.s3.${config.awsS3Region}.amazonaws.com/${key}`

    const uploadUrl = await getSignedUrl(
      s3Service.s3Client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ACL: 'public-read',
      }),
      { expiresIn: 300 }
    )

    return { uploadUrl, key, url: publicUrl, contentType, expiresIn: 300 }
  }

  async uploadImage(userId, file) {
    if (!file) throw new Error('image file is required')
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Only image files are allowed (jpeg, png, gif, webp)')
    }

    return s3Service.uploadPostImage({
      userId,
      fileBuffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    })
  }

  async nearby(query = {}) {
    const lat = Number(query.lat)
    const lng = Number(query.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error('lat and lng are required')
    }
    const normalizedQuery = {
      lat,
      lng,
      radiusKm: Number(query.radius || query.radiusKm || 5),
      limit: Number(query.limit || 50),
    }

    const result = await redisCache.remember(
      getNearbyCacheKey(normalizedQuery),
      config.redisPostTtlSeconds,
      () => postRepository.nearby(normalizedQuery)
    )

    const normalizedPosts = await this.normalizePostsForRead(result?.posts || [])
    const normalizedResult = {
      ...(result || {}),
      posts: normalizedPosts,
    }

    await redisCache.setJson(
      getNearbyCacheKey(normalizedQuery),
      normalizedResult,
      config.redisPostTtlSeconds
    )

    return normalizedResult
  }

  async inBounds(query = {}) {
    const required = ['north', 'south', 'east', 'west']
    required.forEach((field) => {
      if (!Number.isFinite(Number(query[field]))) throw new Error(`${field} is required`)
    })
    const result = await redisCache.remember(
      getInBoundsCacheKey(query),
      config.redisPostTtlSeconds,
      () => postRepository.inBounds(query)
    )

    const normalizedPosts = await this.normalizePostsForRead(result?.posts || [])
    const normalizedResult = {
      ...(result || {}),
      posts: normalizedPosts,
    }

    await redisCache.setJson(
      getInBoundsCacheKey(query),
      normalizedResult,
      config.redisPostTtlSeconds
    )

    return normalizedResult
  }
}

export default new PostService()
