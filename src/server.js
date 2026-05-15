import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import connectDB from './db/connection.js'
import config from './config/index.js'
import { initializeSocketHandlers } from './socket/handlers.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { setIO } from './utils/ioInstance.js'
import redisCache from './services/RedisCacheService.js'

// Import routes
import authRoutes from './routes/auth.js'
import userRoutes from './routes/user.js'
import conversationRoutes from './routes/conversation.js'
import messageRoutes from './routes/message.js'
import callRoutes from './routes/call.js'
import notificationRoutes from './routes/notification.js'
import postRoutes from './routes/post.js'
import mapRoutes from './routes/map.js'
import assistantRoutes from './routes/assistant.js'

const app = express()

const isAllowedOrigin = (origin) => {
  if (!origin) return true
  return true
}

const corsOriginHandler = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true)
    return
  }

  callback(new Error(`Origin ${origin} is not allowed by CORS`))
}

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: corsOriginHandler,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
})

// Set global io instance to avoid circular imports
setIO(io)
console.log('✅ Socket.IO instance set globally')

// Middleware
app.use(
  cors({
    origin: corsOriginHandler,
    credentials: true,
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/conversations', conversationRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/calls', callRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/posts', postRoutes)
app.use('/api/maps', mapRoutes)
app.use('/api/assistant', assistantRoutes)

// Socket.IO
initializeSocketHandlers(io)

// Error handling
app.use(notFoundHandler)
app.use(errorHandler)

// Connect to database and start server
const startServer = async () => {
  try {
    await connectDB()
    await redisCache.connect()

    httpServer.listen(config.port, '0.0.0.0', () => {
      console.log(`
        🚀 Server is running!
        📍 Port: ${config.port}
        🌍 Environment: ${config.nodeEnv}
        💾 Database: AWS DynamoDB (${config.awsRegion})
      `)
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }
}

startServer()

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down server...`)
  await redisCache.disconnect()
  httpServer.close(() => {
    process.exit(0)
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

export { app }
