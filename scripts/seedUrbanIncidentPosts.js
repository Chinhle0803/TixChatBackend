import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import dotenv from 'dotenv'

dotenv.config()

const POSTS_TABLE = process.env.DYNAMODB_POSTS_TABLE || 'tixchat-posts'

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  ...(process.env.DYNAMODB_LOCAL ? { endpoint: process.env.DYNAMODB_LOCAL } : {}),
})

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: true,
  },
})

const now = Date.now()

const samplePosts = [
  {
    postId: 'urban-sample-001',
    content: 'Trụ đèn đường trên đường Nguyễn Huệ bị chập chờn, khu vực khá tối vào buổi tối.',
    category: 'street_light',
    status: 'pending',
    location: { address: 'Nguyễn Huệ, Quận 1, TP.HCM', lat: 10.7758, lng: 106.7019, geohash: 'w3gv' },
    reactions: { like: ['sample-user-02'], urgent: ['sample-user-03'] },
  },
  {
    postId: 'urban-sample-002',
    content: 'Đoạn giao Nguyễn Trãi - Cống Quỳnh đang ùn tắc do mặt đường bị đào thi công.',
    category: 'traffic',
    status: 'in_progress',
    location: { address: 'Nguyễn Trãi, Quận 1, TP.HCM', lat: 10.7641, lng: 106.691, geohash: 'w3gv' },
    reactions: { like: ['sample-user-04', 'sample-user-05'] },
  },
  {
    postId: 'urban-sample-003',
    content: 'Có rò rỉ nước sạch trước hẻm, nước chảy liên tục ra lòng đường.',
    category: 'water',
    status: 'pending',
    location: { address: 'Lê Văn Sỹ, Quận 3, TP.HCM', lat: 10.7882, lng: 106.6782, geohash: 'w3gv' },
    reactions: { urgent: ['sample-user-01', 'sample-user-06'] },
  },
  {
    postId: 'urban-sample-004',
    content: 'Cây xanh nghiêng sát dây điện sau mưa lớn, cần kiểm tra trước giờ cao điểm.',
    category: 'tree',
    status: 'pending',
    location: { address: 'Điện Biên Phủ, Bình Thạnh, TP.HCM', lat: 10.8011, lng: 106.7104, geohash: 'w3gv' },
    reactions: { support: ['sample-user-03'] },
  },
  {
    postId: 'urban-sample-005',
    content: 'Khu vực chợ bị ngập khoảng 20cm sau mưa, xe máy di chuyển khó khăn.',
    category: 'flood',
    status: 'in_progress',
    location: { address: 'Chợ Tân Định, Quận 1, TP.HCM', lat: 10.791, lng: 106.6908, geohash: 'w3gv' },
    reactions: { like: ['sample-user-02'], urgent: ['sample-user-04', 'sample-user-07'] },
  },
  {
    postId: 'urban-sample-006',
    content: 'Điểm tập kết rác quá tải, có mùi nặng gần khu dân cư.',
    category: 'waste',
    status: 'pending',
    location: { address: 'Phan Xích Long, Phú Nhuận, TP.HCM', lat: 10.8005, lng: 106.6856, geohash: 'w3gv' },
    reactions: { like: ['sample-user-08'] },
  },
  {
    postId: 'urban-sample-007',
    content: 'Nắp cống bị vỡ một phần, người đi bộ dễ vấp vào buổi tối.',
    category: 'construction',
    status: 'resolved',
    location: { address: 'Pasteur, Quận 3, TP.HCM', lat: 10.7828, lng: 106.6951, geohash: 'w3gv' },
    reactions: { support: ['sample-user-02', 'sample-user-09'] },
  },
  {
    postId: 'urban-sample-008',
    content: 'Khu phố mất điện cục bộ khoảng 30 phút, hiện vẫn chưa có thông báo sửa chữa.',
    category: 'electricity',
    status: 'in_progress',
    location: { address: 'Bạch Đằng, Bình Thạnh, TP.HCM', lat: 10.806, lng: 106.7118, geohash: 'w3gv' },
    reactions: { urgent: ['sample-user-01'] },
  },
  {
    postId: 'urban-sample-009',
    content: 'Biển báo giao thông bị che khuất bởi tán cây, tài xế khó quan sát.',
    category: 'traffic',
    status: 'pending',
    location: { address: 'Võ Văn Tần, Quận 3, TP.HCM', lat: 10.7754, lng: 106.6867, geohash: 'w3gv' },
    reactions: { like: ['sample-user-05'], support: ['sample-user-06'] },
  },
  {
    postId: 'urban-sample-010',
    content: 'Mặt đường xuất hiện ổ gà lớn sau nhiều ngày mưa, cần vá tạm để tránh tai nạn.',
    category: 'other',
    status: 'pending',
    location: { address: 'Hoàng Sa, Quận 3, TP.HCM', lat: 10.7895, lng: 106.6928, geohash: 'w3gv' },
    reactions: { urgent: ['sample-user-10'], like: ['sample-user-11'] },
  },
]

const toItem = (post, index) => {
  const createdAt = new Date(now - index * 1000 * 60 * 45).toISOString()
  const reactionCount = Object.values(post.reactions || {}).reduce(
    (total, users) => total + (Array.isArray(users) ? users.length : 0),
    0
  )

  return {
    ...post,
    authorId: `sample-author-${String(index + 1).padStart(2, '0')}`,
    images: [],
    geohashPrefix: String(post.location?.geohash || 'unknown').slice(0, 6),
    commentCount: index % 3,
    sample: true,
    createdAt,
    updatedAt: createdAt,
    metadata: {
      source: 'seedUrbanIncidentPosts',
      reactionCount,
    },
  }
}

const seed = async () => {
  const requests = samplePosts.map((post, index) => ({
    PutRequest: {
      Item: toItem(post, index),
    },
  }))

  await docClient.send(new BatchWriteCommand({
    RequestItems: {
      [POSTS_TABLE]: requests,
    },
  }))

  console.log(`Seeded ${requests.length} sample urban posts into ${POSTS_TABLE}`)
  console.log('Sample post IDs:', samplePosts.map((post) => post.postId).join(', '))
}

seed().catch((error) => {
  console.error('Failed to seed sample urban posts:', error?.message || error)
  process.exit(1)
})
