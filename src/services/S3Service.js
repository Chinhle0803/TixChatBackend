import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { config } from '../config/index.js'

class S3Service {
  constructor() {
    this.s3Client = new S3Client({ 
      region: config.awsS3Region,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      },
    })
    this.bucketName = config.s3BucketName
    this.avatarFolder = config.s3AvatarFolder
    this.messageFolder = config.s3MessageFolder
    this.postImagesBucket = config.s3PostImagesBucket
    this.postImagesFolder = config.s3PostImagesFolder
  }

  /**
   * Upload avatar file to S3
   * @param {string} userId - User ID
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} fileName - Original file name
   * @returns {Promise<string>} S3 file URL
   */
  async uploadAvatar(userId, fileBuffer, fileName) {
    try {
      // Generate unique key with userId and timestamp
      const fileExtension = fileName.split('.').pop()
      const timestamp = Date.now()
      const key = `${this.avatarFolder}/${userId}/${timestamp}.${fileExtension}`

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: this.getContentType(fileExtension),
        ACL: 'public-read', // Make avatar publicly readable
      })

      await this.s3Client.send(command)

      // Return the public URL
      const s3Url = `https://${this.bucketName}.s3.${config.awsS3Region}.amazonaws.com/${key}`
      return s3Url
    } catch (error) {
      throw new Error(`Failed to upload avatar to S3: ${error.message}`)
    }
  }

  /**
   * Delete avatar file from S3
   * @param {string} avatarUrl - Avatar URL to delete
   * @returns {Promise<boolean>}
   */
  async deleteAvatar(avatarUrl) {
    try {
      if (!avatarUrl) return true

      // Extract key from URL
      // URL format: https://bucket-name.s3.region.amazonaws.com/key
      const urlParts = avatarUrl.split('/')
      const key = urlParts.slice(4).join('/')

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })

      await this.s3Client.send(command)
      return true
    } catch (error) {
      // Log error but don't fail the operation
      console.error(`Failed to delete avatar from S3: ${error.message}`)
      return false
    }
  }

  /**
   * Delete old avatar and upload new one
   * @param {string} userId - User ID
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} fileName - Original file name
   * @param {string} oldAvatarUrl - Old avatar URL to delete
   * @returns {Promise<string>} New S3 file URL
   */
  async replaceAvatar(userId, fileBuffer, fileName, oldAvatarUrl) {
    try {
      // Upload new avatar
      const newAvatarUrl = await this.uploadAvatar(userId, fileBuffer, fileName)

      // Delete old avatar asynchronously (don't wait)
      if (oldAvatarUrl) {
        this.deleteAvatar(oldAvatarUrl).catch(err => {
          console.error('Failed to delete old avatar:', err)
        })
      }

      return newAvatarUrl
    } catch (error) {
      throw new Error(`Failed to replace avatar: ${error.message}`)
    }
  }

  async uploadMessageAttachment({ conversationId, senderId, fileBuffer, fileName, mimeType }) {
    try {
      const safeName = String(fileName || 'attachment')
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '')
      const timestamp = Date.now()
      const key = `${this.messageFolder}/${conversationId}/${senderId}/${timestamp}-${safeName}`

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType || this.getContentType(fileName?.split('.').pop() || ''),
        ACL: 'public-read',
      })

      await this.s3Client.send(command)

      const url = `https://${this.bucketName}.s3.${config.awsS3Region}.amazonaws.com/${key}`
      return {
        key,
        url,
      }
    } catch (error) {
      throw new Error(`Failed to upload message attachment to S3: ${error.message}`)
    }
  }

  async uploadPostImage({ userId, fileBuffer, fileName, mimeType }) {
    try {
      const safeName = String(fileName || `incident-${Date.now()}.jpg`)
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '')
      const timestamp = Date.now()
      const key = `${this.postImagesFolder}/${userId}/${timestamp}-${safeName}`

      const command = new PutObjectCommand({
        Bucket: this.postImagesBucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType || this.getContentType(safeName.split('.').pop() || 'jpg'),
        ACL: 'public-read',
      })

      await this.s3Client.send(command)

      return {
        key,
        url: `https://${this.postImagesBucket}.s3.${config.awsS3Region}.amazonaws.com/${key}`,
      }
    } catch (error) {
      throw new Error(`Failed to upload post image to S3: ${error.message}`)
    }
  }

  /**
   * Get content type based on file extension
   * @param {string} extension - File extension
   * @returns {string} MIME type
   */
  getContentType(extension) {
    const mimeTypes = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      mkv: 'video/x-matroska',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      csv: 'text/csv',
      zip: 'application/zip',
      rar: 'application/x-rar-compressed',
    }
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream'
  }
}

export default new S3Service()
