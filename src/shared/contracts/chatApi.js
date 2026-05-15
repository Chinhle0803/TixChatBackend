import { serializeCursor } from '../utils/normalize.js'

const appendAttachment = (formData, attachmentFile) => {
  if (!attachmentFile) return

  const isBlobLike = typeof Blob !== 'undefined' && attachmentFile instanceof Blob
  if (isBlobLike) {
    formData.append('attachment', attachmentFile)
    return
  }

  if (typeof attachmentFile === 'object' && attachmentFile.uri) {
    formData.append('attachment', {
      uri: attachmentFile.uri,
      name: attachmentFile.name || `attachment-${Date.now()}`,
      type: attachmentFile.mimeType || attachmentFile.type || 'application/octet-stream',
    })
    return
  }

  formData.append('attachment', attachmentFile)
}

export const createAuthApi = (apiClient) => ({
  register: (payload) => apiClient.post('/auth/register', payload),
  login: (email, password) => apiClient.post('/auth/login', { email, password }),
  forgotPassword: (email) => apiClient.post('/auth/forgot-password', { email }),
  verifyResetToken: (email, token) => apiClient.post('/auth/verify-reset-token', { email, token }),
  resetPassword: (email, token, newPassword, confirmPassword) =>
    apiClient.post('/auth/reset-password', {
      email,
      token,
      newPassword,
      confirmPassword,
    }),
  sendEmailVerificationOtp: (email) =>
    apiClient.post('/auth/send-email-verification-otp', { email }),
  verifyEmailOtp: (email, otp) => apiClient.post('/auth/verify-email-otp', { email, otp }),
  refreshToken: (refreshToken) => apiClient.post('/auth/refresh-token', { refreshToken }),
  logout: () => apiClient.post('/auth/logout'),
  getMe: () => apiClient.get('/auth/me'),
})

export const createUserApi = (apiClient) => ({
  getProfile: (userId) => apiClient.get(`/users/profile/${userId}`),
  getCurrentProfile: () => apiClient.get('/users/profile/current'),
  updateProfile: (data) => apiClient.put('/users/profile', data),
  updateAvatar: (formData) =>
    apiClient.post('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  changePassword: (data) => apiClient.post('/users/password/change', data),
  searchUsers: (query) => apiClient.get('/users/search', { params: { q: query } }),
  getFriends: () => apiClient.get('/users/friends'),
  getFriendRequests: () => apiClient.get('/users/friend/requests'),
  sendFriendRequest: (friendId) => apiClient.post('/users/friend/request', { friendId }),
  acceptFriendRequest: (requesterId) => apiClient.post('/users/friend/accept', { requesterId }),
  rejectFriendRequest: (requesterId) => apiClient.post('/users/friend/reject', { requesterId }),
  addFriend: (friendId) => apiClient.post('/users/friend/add', { friendId }),
  removeFriend: (friendId) => apiClient.post('/users/friend/remove', { friendId }),
  getOnlineUsers: () => apiClient.get('/users/online'),
  blockUser: (userId) => apiClient.post('/users/block', { userId }),
  unblockUser: (userId) => apiClient.post('/users/unblock', { userId }),
})

export const createConversationApi = (apiClient) => ({
  createConversation: (type, participantIds, name = null) => {
    const payload = { type, participantIds }
    if (type === 'group' && typeof name === 'string' && name.trim()) {
      payload.name = name.trim()
    }
    return apiClient.post('/conversations', payload)
  },
  getConversations: (limit = 20, skip = 0) =>
    apiClient.get('/conversations', { params: { limit, skip } }),
  getConversation: (conversationId) => apiClient.get(`/conversations/${conversationId}`),
  updateConversation: (conversationId, data) =>
    apiClient.put(`/conversations/${conversationId}`, data),
  updateConversationAvatar: (conversationId, formData) =>
    apiClient.post(`/conversations/${conversationId}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  addParticipant: (conversationId, participantId) =>
    apiClient.post(`/conversations/${conversationId}/participants`, { participantId }),
  removeParticipant: (conversationId, participantId) =>
    apiClient.delete(`/conversations/${conversationId}/participants/${participantId}`),
  getParticipants: (conversationId) =>
    apiClient.get(`/conversations/${conversationId}/participants`),
  updateParticipantRole: (conversationId, participantId, role) =>
    apiClient.patch(`/conversations/${conversationId}/participants/${participantId}/role`, { role }),
  updateGroupSettings: (conversationId, data) =>
    apiClient.patch(`/conversations/${conversationId}/group-settings`, data),
  getBlockedUsers: (conversationId) =>
    apiClient.get(`/conversations/${conversationId}/blocked-users`),
  blockUserInConversation: (conversationId, userId) =>
    apiClient.post(`/conversations/${conversationId}/blocked-users/${userId}`),
  unblockUserInConversation: (conversationId, userId) =>
    apiClient.delete(`/conversations/${conversationId}/blocked-users/${userId}`),
  leaveConversation: (conversationId, leaveSilently = false) =>
    apiClient.post(`/conversations/${conversationId}/leave`, { leaveSilently }),
  dissolveConversation: (conversationId) =>
    apiClient.delete(`/conversations/${conversationId}/dissolve`),
  archiveConversation: (conversationId) =>
    apiClient.post(`/conversations/${conversationId}/archive`),
  deleteConversation: (conversationId) =>
    apiClient.delete(`/conversations/${conversationId}`),
  searchConversations: (query) =>
    apiClient.get('/conversations/search', { params: { q: query } }),
})

export const createMessageApi = (apiClient) => ({
  sendMessage: (conversationId, content, replyTo = null, options = {}) => {
    const payload = { conversationId, content }
    if (replyTo) payload.replyTo = replyTo
    if (options?.clientMessageId) payload.clientMessageId = options.clientMessageId
    return apiClient.post('/messages', payload)
  },
  sendAttachment: (conversationId, attachmentFile, content = '', replyTo = null, options = {}) => {
    const formData = new FormData()
    formData.append('conversationId', conversationId)
    appendAttachment(formData, attachmentFile)
    if (typeof content === 'string') formData.append('content', content)
    if (replyTo) formData.append('replyTo', replyTo)
    if (options?.clientMessageId) formData.append('clientMessageId', options.clientMessageId)
    return apiClient.post('/messages/attachment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (typeof options?.onUploadProgress !== 'function') return
        const loaded = Number(progressEvent?.loaded || 0)
        const total = Number(progressEvent?.total || 0)
        const percentage = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
        options.onUploadProgress({ loaded, total, percentage })
      },
    })
  },
  forwardAttachmentByUrl: (conversationId, sourceUrl, metadata = {}, content = '', replyTo = null, options = {}) => {
    const payload = {
      conversationId, sourceUrl, content,
      fileName: metadata?.name || metadata?.fileName || '',
      mimeType: metadata?.mimeType || metadata?.type || '',
      size: metadata?.size,
    }
    if (replyTo) payload.replyTo = replyTo
    if (options?.clientMessageId) payload.clientMessageId = options.clientMessageId
    return apiClient.post('/messages/attachment/forward', payload)
  },
  getMessages: (conversationId, limit = 50, lastEvaluatedKey = null) =>
    apiClient.get(`/messages/${conversationId}`, {
      params: { limit, lastEvaluatedKey: serializeCursor(lastEvaluatedKey) },
    }),
  editMessage: (conversationId, messageId, content) =>
    apiClient.put(`/messages/${conversationId}/${messageId}`, { content }),
  deleteMessage: (conversationId, messageId) =>
    apiClient.delete(`/messages/${conversationId}/${messageId}`),
  markAsDelivered: (conversationId, messageId) =>
    apiClient.post(`/messages/${conversationId}/${messageId}/delivered`),
  markAsSeen: (conversationId) => apiClient.post(`/messages/${conversationId}/seen`),
  getUnreadCounts: () => apiClient.get('/messages/unread/counts'),
  addEmoji: (conversationId, messageId, emoji) =>
    apiClient.post(`/messages/${conversationId}/${messageId}/emoji`, { emoji }),
  removeEmoji: (conversationId, messageId, emoji) =>
    apiClient.delete(`/messages/${conversationId}/${messageId}/emoji`, { data: { emoji } }),
})

export const createChatApiServices = (apiClient) => ({
  authApi: createAuthApi(apiClient),
  userApi: createUserApi(apiClient),
  conversationApi: createConversationApi(apiClient),
  messageApi: createMessageApi(apiClient),
})
