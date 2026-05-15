import multer from 'multer'
import { config } from '../config/index.js'

// Configure multer for in-memory storage (we'll upload to S3, not disk)
const storage = multer.memoryStorage()

// File filter for avatars
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Only image files are allowed (jpeg, png, gif, webp)'), false)
  }
}

// Configure multer
export const uploadAvatar = multer({
  storage: storage,
  limits: {
    fileSize: config.maxFileSize, // Max 50MB
  },
  fileFilter: fileFilter,
})

const messageAttachmentFilter = (req, file, cb) => {
  const allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-rar',
    'application/octet-stream',
  ])

  const allowedExtensions = new Set([
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'mp4',
    'webm',
    'mov',
    'mkv',
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'txt',
    'csv',
    'zip',
    'rar',
  ])

  const mimeType = String(file?.mimetype || '').toLowerCase()
  const extension = String(file?.originalname || '')
    .split('.')
    .pop()
    .toLowerCase()

  const isMimeAllowed = allowedMimeTypes.has(mimeType)
  const isExtensionAllowed = allowedExtensions.has(extension)

  if (isMimeAllowed || isExtensionAllowed) {
    cb(null, true)
  } else {
    cb(new Error('Unsupported file type for message attachment'), false)
  }
}

export const uploadMessageAttachment = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize,
  },
  fileFilter: messageAttachmentFilter,
})

export const uploadPostImage = multer({
  storage,
  limits: {
    fileSize: Math.min(config.maxFileSize, 8 * 1024 * 1024),
  },
  fileFilter,
})
