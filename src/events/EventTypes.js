// User Events
export const USER_EVENTS = {
  REGISTERED: 'user:registered',
  LOGGED_IN: 'user:logged_in',
  LOGGED_OUT: 'user:logged_out',
  ONLINE: 'user:online',
  OFFLINE: 'user:offline',
  PROFILE_UPDATED: 'user:profile_updated',
  FRIEND_ADDED: 'user:friend_added',
  FRIEND_REMOVED: 'user:friend_removed',
  FRIEND_REQUEST_SENT: 'user:friend_request_sent',
  FRIEND_REQUEST_ACCEPTED: 'user:friend_request_accepted',
  FRIEND_REQUEST_REJECTED: 'user:friend_request_rejected',
  PASSWORD_RESET: 'user:password_reset',
  PASSWORD_CHANGED: 'user:password_changed',
  AVATAR_UPDATED: 'user:avatar_updated',
}

// Message Events
export const MESSAGE_EVENTS = {
  SENT: 'message:sent',
  DELIVERED: 'message:delivered',
  SEEN: 'message:seen',
  EDITED: 'message:edited',
  DELETED: 'message:deleted',
}

// Conversation Events
export const CONVERSATION_EVENTS = {
  CREATED: 'conversation:created',
  UPDATED: 'conversation:updated',
  DELETED: 'conversation:deleted',
  DISSOLVED: 'conversation:dissolved',
  PARTICIPANT_ADDED: 'conversation:participant_added',
  PARTICIPANT_REMOVED: 'conversation:participant_removed',
  PARTICIPANT_ROLE_UPDATED: 'conversation:participant_role_updated',
  ARCHIVED: 'conversation:archived',
}

// Typing Events
export const TYPING_EVENTS = {
  START: 'typing:start',
  STOP: 'typing:stop',
}
