import dotenv from 'dotenv'

dotenv.config()

const parseOrigins = (value, fallback = []) => {
  const normalized = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (normalized.length) return normalized
  return fallback
}

const defaultFrontendOrigins = [
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19006',
]

const frontendOrigins = parseOrigins(process.env.FRONTEND_URLS, defaultFrontendOrigins)

export const config = {
  // Server
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // AWS DynamoDB
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  dynamodbLocal: process.env.DYNAMODB_LOCAL, // For local development (e.g., http://localhost:8000)
  useLocalDynamoDB: process.env.USE_LOCAL_DYNAMODB === 'true',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your_super_secret_jwt_key',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your_super_secret_refresh_key',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d',

  // Frontend
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  frontendOrigins,

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisEnabled: process.env.REDIS_ENABLED === 'true',
  redisKeyPrefix: process.env.REDIS_KEY_PREFIX || 'tixchat',
  redisConnectTimeoutMs: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '1500', 10),
  redisDefaultTtlSeconds: parseInt(process.env.REDIS_DEFAULT_TTL_SECONDS || '60', 10),
  redisPostTtlSeconds: parseInt(process.env.REDIS_POST_TTL_SECONDS || '30', 10),
  redisUserTtlSeconds: parseInt(process.env.REDIS_USER_TTL_SECONDS || '120', 10),

  // File Upload
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'),
  allowedExtensions: (process.env.ALLOWED_EXTENSIONS || 'jpg,jpeg,png,gif,pdf').split(','),

  // AWS SES (Email)
  awsSesRegion: process.env.AWS_SES_REGION || 'us-east-1',
  emailFrom: process.env.AWS_SES_SENDER_EMAIL || 'noreply@tixchat.com',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // AWS S3 (File Storage)
  awsS3Region: process.env.AWS_S3_REGION || 'us-east-1',
  s3BucketName: process.env.S3_BUCKET_NAME || 'tixchat-avatars',
  s3AvatarFolder: process.env.S3_AVATAR_FOLDER || 'avatars',
  s3MessageFolder: process.env.S3_MESSAGE_FOLDER || 'messages',
  s3PostImagesBucket: process.env.S3_POST_IMAGES_BUCKET || process.env.S3_BUCKET_NAME || 'tixchat-avatars',
  s3PostImagesFolder: process.env.S3_POST_IMAGES_FOLDER || 'urban-posts',

  // Urban incident feed
  dynamodbPostsTable: process.env.DYNAMODB_POSTS_TABLE || 'tixchat-posts',
  dynamodbCommentsTable: process.env.DYNAMODB_COMMENTS_TABLE || 'tixchat-comments',
  dynamodbUrbanStatsTable: process.env.DYNAMODB_URBAN_STATS_TABLE || 'tixchat-urban-incident-stats',

  // AI assistant
  aiProvider: process.env.AI_PROVIDER || 'gemini',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
  awsBearerTokenBedrock: process.env.AWS_BEARER_TOKEN_BEDROCK || '',
  awsBedrockRegion: process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1',
  awsBedrockModelId: process.env.AWS_BEDROCK_MODEL_ID || 'amazon.nova-micro-v1:0',
  awsGeoPlacesRegion: process.env.AWS_GEO_PLACES_REGION || process.env.AWS_LOCATION_REGION || process.env.AWS_REGION || 'ap-southeast-2',
  awsGeoRoutesRegion: process.env.AWS_GEO_ROUTES_REGION || process.env.AWS_LOCATION_REGION || process.env.AWS_REGION || 'ap-southeast-2',
  awsGeoRouteMode: process.env.AWS_GEO_ROUTE_MODE || 'Car',
  aiMaxContextPosts: parseInt(process.env.AI_MAX_CONTEXT_POSTS || '5', 10),
  aiDefaultRadiusKm: parseInt(process.env.AI_DEFAULT_RADIUS_KM || '5', 10),
  aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '12000', 10),
  assistantRouteSampleMeters: parseInt(process.env.ASSISTANT_ROUTE_SAMPLE_METERS || '150', 10),
  assistantRouteIncidentRadiusMeters: parseInt(process.env.ASSISTANT_ROUTE_INCIDENT_RADIUS_METERS || '300', 10),
  assistantMemoryTtlSeconds: parseInt(process.env.ASSISTANT_MEMORY_TTL_SECONDS || '1800', 10),
  assistantMaxToolSteps: parseInt(process.env.ASSISTANT_MAX_TOOL_STEPS || '6', 10),
  embeddingProvider: process.env.EMBEDDING_PROVIDER || '',
  embeddingModel: process.env.EMBEDDING_MODEL || '',
  opensearchVectorEndpoint: process.env.OPENSEARCH_VECTOR_ENDPOINT || '',

  // AWS Location Service Maps V2
  awsLocationRegion: process.env.AWS_LOCATION_REGION || process.env.AWS_REGION || 'us-east-1',
  awsLocationStyle: process.env.AWS_LOCATION_STYLE || 'Standard',
  awsLocationColorScheme: process.env.AWS_LOCATION_COLOR_SCHEME || 'Light',
  awsLocationVariant: process.env.AWS_LOCATION_VARIANT || 'Default',
  awsLocationAllowedIps: parseOrigins(process.env.AWS_LOCATION_ALLOWED_IPS, []),

  // AWS Chime SDK Meetings
  awsChimeRegion: process.env.AWS_CHIME_REGION || process.env.AWS_REGION || 'us-east-1',
  chimeMeetingRegion: process.env.CHIME_MEETING_REGION || process.env.AWS_CHIME_REGION || process.env.AWS_REGION || 'us-east-1',
  callRingTimeoutSeconds: parseInt(process.env.CALL_RING_TIMEOUT_SECONDS || '60', 10),
}

export default config
