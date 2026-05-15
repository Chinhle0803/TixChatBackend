import { EventEmitter } from 'events'

class UserEventEmitter extends EventEmitter {}
class MessageEventEmitter extends EventEmitter {}
class ConversationEventEmitter extends EventEmitter {}

export const userEvents = new UserEventEmitter()
export const messageEvents = new MessageEventEmitter()
export const conversationEvents = new ConversationEventEmitter()
