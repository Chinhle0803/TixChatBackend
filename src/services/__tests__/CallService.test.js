import { jest } from '@jest/globals'

const calls = new Map()
const conversations = new Map()
const participantsByConversation = new Map()
const messages = new Map()
const ioEmit = jest.fn()
const ioTo = jest.fn(() => ({ emit: ioEmit }))
const messageEventEmit = jest.fn()
const conversationEventOn = jest.fn()
const chimeSend = jest.fn()

class CreateMeetingCommand {
  constructor(input) {
    this.input = input
  }
}

class CreateAttendeeCommand {
  constructor(input) {
    this.input = input
  }
}

class DeleteMeetingCommand {
  constructor(input) {
    this.input = input
  }
}

const normalizeId = (value) => String(value || '')

const getCallParticipantIds = (call) => [
  ...new Set([
    ...(Array.isArray(call?.participantIds) ? call.participantIds : []),
    call?.callerId,
    call?.calleeId,
  ].map(normalizeId).filter(Boolean)),
]

const createConversation = (conversationId, type, participantIds) => {
  conversations.set(conversationId, { conversationId, type })
  participantsByConversation.set(
    conversationId,
    participantIds.map((userId) => ({ conversationId, userId, leftAt: null }))
  )
}

const getMessageKey = (conversationId, messageId) => `${conversationId}:${messageId}`

await jest.unstable_mockModule('@aws-sdk/client-chime-sdk-meetings', () => ({
  ChimeSDKMeetingsClient: jest.fn(() => ({ send: chimeSend })),
  CreateAttendeeCommand,
  CreateMeetingCommand,
  DeleteMeetingCommand,
}))

await jest.unstable_mockModule('uuid', () => ({
  v4: jest.fn(() => `call-${calls.size + 1}`),
}))

await jest.unstable_mockModule('../../config/index.js', () => ({
  default: {
    awsChimeRegion: 'ap-southeast-1',
    awsAccessKeyId: 'test',
    awsSecretAccessKey: 'test',
    chimeMeetingRegion: 'ap-southeast-1',
    callRingTimeoutSeconds: 60,
  },
}))

await jest.unstable_mockModule('../../repositories/CallRepository.js', () => ({
  default: {
    create: jest.fn(async (call) => {
      calls.set(call.callId, { ...call })
      return calls.get(call.callId)
    }),
    findById: jest.fn(async (callId) => calls.get(callId) || null),
    update: jest.fn(async (callId, updates = {}) => {
      const current = calls.get(callId)
      const next = { ...current, ...updates, updatedAt: Date.now() }
      calls.set(callId, next)
      return next
    }),
    findActiveByConversation: jest.fn(async (conversationId) =>
      Array.from(calls.values()).find((call) =>
        call.conversationId === conversationId &&
        ['ringing', 'accepted'].includes(call.status)
      ) || null
    ),
    findLatestActiveByUser: jest.fn(async (userId) =>
      Array.from(calls.values())
        .filter((call) =>
          getCallParticipantIds(call).includes(userId) &&
          ['ringing', 'accepted'].includes(call.status)
        )
        .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0] || null
    ),
  },
}))

await jest.unstable_mockModule('../../repositories/ConversationRepository.js', () => ({
  default: {
    findById: jest.fn(async (conversationId) => conversations.get(conversationId) || null),
    update: jest.fn(async (conversationId, updates = {}) => {
      const current = conversations.get(conversationId) || { conversationId }
      const next = { ...current, ...updates }
      conversations.set(conversationId, next)
      return next
    }),
  },
}))

await jest.unstable_mockModule('../../repositories/ParticipantRepository.js', () => ({
  default: {
    findByConversationId: jest.fn(async (conversationId) =>
      participantsByConversation.get(conversationId) || []
    ),
    findOne: jest.fn(async (conversationId, userId) =>
      (participantsByConversation.get(conversationId) || [])
        .find((participant) => participant.userId === userId) || null
    ),
  },
}))

await jest.unstable_mockModule('../../repositories/MessageRepository.js', () => ({
  default: {
    create: jest.fn(async (message) => {
      const messageId = `message-${messages.size + 1}`
      const item = { ...message, messageId, createdAt: Date.now(), updatedAt: Date.now() }
      messages.set(getMessageKey(message.conversationId, messageId), item)
      return item
    }),
    findById: jest.fn(async (conversationId, messageId) =>
      messages.get(getMessageKey(conversationId, messageId)) || null
    ),
    update: jest.fn(async (conversationId, messageId, updates = {}) => {
      const key = getMessageKey(conversationId, messageId)
      const next = { ...(messages.get(key) || {}), ...updates, updatedAt: Date.now() }
      messages.set(key, next)
      return next
    }),
  },
}))

await jest.unstable_mockModule('../../events/EventBus.js', () => ({
  messageEvents: { emit: messageEventEmit },
  conversationEvents: { on: conversationEventOn },
}))

await jest.unstable_mockModule('../../events/EventTypes.js', () => ({
  MESSAGE_EVENTS: {
    SENT: 'message:sent',
    EDITED: 'message:edited',
  },
  CONVERSATION_EVENTS: {
    PARTICIPANT_ADDED: 'conversation:participant_added',
    PARTICIPANT_REMOVED: 'conversation:participant_removed',
  },
}))

await jest.unstable_mockModule('../../utils/ioInstance.js', () => ({
  getIO: () => ({ to: ioTo }),
}))

const { CallService } = await import('../CallService.js')

const createService = () => new CallService()

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(1700000000000)
  calls.clear()
  conversations.clear()
  participantsByConversation.clear()
  messages.clear()
  ioEmit.mockClear()
  ioTo.mockClear()
  messageEventEmit.mockClear()
  conversationEventOn.mockClear()
  chimeSend.mockImplementation(async (command) => {
    if (command instanceof CreateMeetingCommand) {
      return { Meeting: { MeetingId: `meeting-${command.input.ClientRequestToken}` } }
    }
    if (command instanceof CreateAttendeeCommand) {
      return {
        Attendee: {
          AttendeeId: `attendee-${command.input.ExternalUserId}`,
          ExternalUserId: command.input.ExternalUserId,
        },
      }
    }
    return {}
  })
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('CallService direct calls', () => {
  test('starts and accepts a 1-1 call', async () => {
    createConversation('direct-1', '1-1', ['user-a', 'user-b'])
    const service = createService()

    const started = await service.startCall('direct-1', 'user-a', 'video')
    expect(started.call.status).toBe('ringing')
    expect(started.call.joinedByIds).toEqual(['user-a'])

    const accepted = await service.acceptCall(started.call.callId, 'user-b')
    expect(accepted.call.status).toBe('accepted')
    expect(accepted.call.activeParticipantIds.sort()).toEqual(['user-a', 'user-b'])
    expect(accepted.call.viewerCallState).toBe('joined')
  })

  test('marks a ringing direct call as missed when declined', async () => {
    createConversation('direct-2', '1-1', ['user-a', 'user-b'])
    const service = createService()
    const started = await service.startCall('direct-2', 'user-a', 'audio')

    const declined = await service.declineCall(started.call.callId, 'user-b')

    expect(declined.call.status).toBe('missed')
    expect(declined.call.durationSeconds).toBe(0)
    expect(messageEventEmit).toHaveBeenCalledWith('message:sent', expect.objectContaining({
      conversationId: 'direct-2',
    }))
    expect(chimeSend).toHaveBeenCalledWith(expect.any(DeleteMeetingCommand))
  })
})

describe('CallService group calls', () => {
  test('allows available members to join, leave, rejoin, and ends when only one active joined user remains', async () => {
    createConversation('group-1', 'group', ['user-a', 'user-b', 'user-c'])
    const service = createService()
    const started = await service.startCall('group-1', 'user-a', 'video')
    const accepted = await service.acceptCall(started.call.callId, 'user-b')

    expect(accepted.call.status).toBe('accepted')
    expect(accepted.call.activeParticipantIds.sort()).toEqual(['user-a', 'user-b'])
    expect(accepted.call.activeNoticeMessageId).toBeTruthy()

    const currentForC = await service.getCurrentCallForUser('user-c')
    expect(currentForC.call.viewerCallState).toBe('available')

    const joinedC = await service.joinCall(started.call.callId, 'user-c')
    expect(joinedC.call.activeParticipantIds.sort()).toEqual(['user-a', 'user-b', 'user-c'])

    const leftC = await service.endCall(started.call.callId, 'user-c')
    expect(leftC.partial).toBe(true)
    expect(leftC.call.viewerCallState).toBe('available')
    expect(leftC.call.activeParticipantIds.sort()).toEqual(['user-a', 'user-b'])

    const rejoinedC = await service.joinCall(started.call.callId, 'user-c')
    expect(rejoinedC.call.activeParticipantIds.sort()).toEqual(['user-a', 'user-b', 'user-c'])

    await service.endCall(started.call.callId, 'user-c')
    const ended = await service.endCall(started.call.callId, 'user-a')

    expect(ended.partial).toBeUndefined()
    expect(ended.call.status).toBe('ended')
    expect(ended.call.activeParticipantIds).toEqual(['user-b'])
    expect(messageEventEmit).toHaveBeenCalledWith('message:edited', expect.objectContaining({
      conversationId: 'group-1',
      message: expect.objectContaining({
        metadata: expect.objectContaining({ active: false }),
      }),
    }))
  })

  test('emits an available-call event when a member is added during an active group call', async () => {
    createConversation('group-2', 'group', ['user-a', 'user-b'])
    const service = createService()
    const started = await service.startCall('group-2', 'user-a', 'video')
    await service.acceptCall(started.call.callId, 'user-b')

    participantsByConversation.set('group-2', [
      ...participantsByConversation.get('group-2'),
      { conversationId: 'group-2', userId: 'user-d', leftAt: null },
    ])

    await service.handleConversationParticipantAdded({
      conversationId: 'group-2',
      participantId: 'user-d',
    })

    const updated = calls.get(started.call.callId)
    expect(updated.participantIds).toContain('user-d')
    expect(ioEmit).toHaveBeenCalledWith('call:active_available', expect.objectContaining({
      call: expect.objectContaining({ viewerCallState: 'available' }),
    }))
  })

  test('removing an active participant ends a two-person active group call', async () => {
    createConversation('group-3', 'group', ['user-a', 'user-b', 'user-c'])
    const service = createService()
    const started = await service.startCall('group-3', 'user-a', 'audio')
    await service.acceptCall(started.call.callId, 'user-b')

    await service.handleConversationParticipantRemoved({
      conversationId: 'group-3',
      participantId: 'user-b',
    })

    expect(calls.get(started.call.callId).status).toBe('ended')
    expect(ioEmit).toHaveBeenCalledWith('call:ended', expect.any(Object))
  })

  test('marks a ringing group call missed after every recipient declines', async () => {
    createConversation('group-4', 'group', ['user-a', 'user-b', 'user-c'])
    const service = createService()
    const started = await service.startCall('group-4', 'user-a', 'audio')

    const firstDecline = await service.declineCall(started.call.callId, 'user-b')
    expect(firstDecline.partial).toBe(true)

    const secondDecline = await service.declineCall(started.call.callId, 'user-c')
    expect(secondDecline.call.status).toBe('missed')
  })
})
