import {
  ChimeSDKMeetingsClient,
  CreateAttendeeCommand,
  CreateMeetingCommand,
  DeleteMeetingCommand,
} from '@aws-sdk/client-chime-sdk-meetings'
import { v4 as uuidv4 } from 'uuid'
import config from '../config/index.js'
import CallRepository from '../repositories/CallRepository.js'
import ConversationRepository from '../repositories/ConversationRepository.js'
import MessageRepository from '../repositories/MessageRepository.js'
import ParticipantRepository from '../repositories/ParticipantRepository.js'
import { conversationEvents, messageEvents } from '../events/EventBus.js'
import { CONVERSATION_EVENTS, MESSAGE_EVENTS } from '../events/EventTypes.js'
import { getIO } from '../utils/ioInstance.js'

const TERMINAL_STATUSES = ['declined', 'ended', 'missed']
const ACTIVE_STATUSES = ['ringing', 'accepted']
const RINGING_EVENT_INTERVAL_MS = 5000
const GROUP_CALL_ACTIVE_NOTICE_KIND = 'group_call_active'

export class CallService {
  constructor() {
    this.chimeClient = new ChimeSDKMeetingsClient({
      region: config.awsChimeRegion,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      },
    })
    this.missedCallTimers = new Map()
    this.ringingEventTimers = new Map()
    this.boundConversationEvents = false
    this.bindConversationEvents()
  }

  bindConversationEvents() {
    if (this.boundConversationEvents) return
    this.boundConversationEvents = true

    conversationEvents.on(CONVERSATION_EVENTS.PARTICIPANT_ADDED, (payload) => {
      this.handleConversationParticipantAdded(payload).catch((error) => {
        console.warn('Failed to sync participant added with active call:', error?.message || error)
      })
    })

    conversationEvents.on(CONVERSATION_EVENTS.PARTICIPANT_REMOVED, (payload) => {
      this.handleConversationParticipantRemoved(payload).catch((error) => {
        console.warn('Failed to sync participant removed with active call:', error?.message || error)
      })
    })
  }

  normalizeId(value) {
    if (!value) return ''
    if (typeof value === 'object') return String(value._id || value.userId || value.id || '')
    return String(value)
  }

  uniqueIds(values = []) {
    return [...new Set((values || []).map((id) => this.normalizeId(id)).filter(Boolean))]
  }

  removeIds(values = [], idsToRemove = []) {
    const removeSet = new Set(this.uniqueIds(idsToRemove))
    return this.uniqueIds(values).filter((id) => !removeSet.has(id))
  }

  isGroupCall(call) {
    const conversationType = String(call?.conversationType || '').toLowerCase()
    if (conversationType === 'group') return true
    return this.getCallParticipantIds(call).length > 2
  }

  getCallParticipantIds(call) {
    const participantIds = Array.isArray(call?.participantIds) ? call.participantIds : []
    const fallbackIds = [call?.callerId, call?.calleeId]
    return this.uniqueIds([...participantIds, ...fallbackIds])
  }

  getJoinedCallParticipantIds(call) {
    const joinedByIds = this.uniqueIds(call?.joinedByIds || [])
    if (joinedByIds.length > 0) return joinedByIds

    if (call?.status === 'accepted') {
      return this.getRemainingCallParticipantIds(call)
    }

    const callerId = this.normalizeId(call?.callerId)
    return callerId ? [callerId] : []
  }

  getInactiveParticipantIds(call) {
    return this.uniqueIds([
      ...(Array.isArray(call?.leftByIds) ? call.leftByIds : []),
      ...(Array.isArray(call?.declinedByIds) ? call.declinedByIds : []),
    ])
  }

  getRemainingCallParticipantIds(call) {
    const inactiveIds = new Set(this.getInactiveParticipantIds(call))
    return this.getCallParticipantIds(call).filter((userId) => !inactiveIds.has(userId))
  }

  getActiveJoinedParticipantIds(call) {
    const inactiveIds = new Set(this.getInactiveParticipantIds(call))
    return this.getJoinedCallParticipantIds(call).filter((userId) => !inactiveIds.has(userId))
  }

  isParticipantInactive(call, userId) {
    const normalizedUserId = this.normalizeId(userId)
    return normalizedUserId ? this.getInactiveParticipantIds(call).includes(normalizedUserId) : false
  }

  getViewerCallState(call, userId) {
    const normalizedUserId = this.normalizeId(userId)
    if (!call || !normalizedUserId) return ''

    const status = String(call?.status || '').toLowerCase()
    if (TERMINAL_STATUSES.includes(status)) return status

    const participantIds = this.getCallParticipantIds(call)
    const isCallParticipant = participantIds.includes(normalizedUserId)
    if (!isCallParticipant) return 'unavailable'

    if (status === 'ringing') {
      if (this.normalizeId(call.callerId) === normalizedUserId) return 'ringing'
      return this.isParticipantInactive(call, normalizedUserId) ? 'declined' : 'incoming'
    }

    if (status === 'accepted') {
      if (this.getActiveJoinedParticipantIds(call).includes(normalizedUserId)) {
        return 'joined'
      }

      if (this.isGroupCall(call)) {
        return 'available'
      }
    }

    return status || 'unknown'
  }

  toPublicCall(call, viewerUserId = null) {
    if (!call) return null
    const { meeting, attendees, ...publicCall } = call
    const normalizedCall = {
      ...publicCall,
      participantIds: this.getCallParticipantIds(publicCall),
      joinedByIds: this.getJoinedCallParticipantIds(publicCall),
      leftByIds: this.uniqueIds(publicCall.leftByIds || []),
      declinedByIds: this.uniqueIds(publicCall.declinedByIds || []),
      activeParticipantIds: this.getActiveJoinedParticipantIds(publicCall),
    }

    if (viewerUserId) {
      normalizedCall.viewerCallState = this.getViewerCallState(publicCall, viewerUserId)
    }

    return normalizedCall
  }

  emitToCallParticipants(eventName, call, payload = {}) {
    if (!call) return

    try {
      const io = getIO()
      this.getCallParticipantIds(call).forEach((userId) => {
        io.to(`user:${userId}`).emit(eventName, {
          call: this.toPublicCall(call, userId),
          ...payload,
        })
      })
    } catch (error) {
      console.warn(`Failed to emit ${eventName}:`, error?.message || error)
    }
  }

  emitToUser(eventName, userId, call, payload = {}) {
    const normalizedUserId = this.normalizeId(userId)
    if (!call || !normalizedUserId) return

    try {
      const io = getIO()
      io.to(`user:${normalizedUserId}`).emit(eventName, {
        call: this.toPublicCall(call, normalizedUserId),
        ...payload,
      })
    } catch (error) {
      console.warn(`Failed to emit ${eventName}:`, error?.message || error)
    }
  }

  emitActiveGroupCallAvailable(call, excludeIds = []) {
    if (!this.isGroupCall(call) || call?.status !== 'accepted') return

    const excluded = new Set(this.uniqueIds(excludeIds))
    const activeIds = new Set(this.getActiveJoinedParticipantIds(call))

    this.getCallParticipantIds(call).forEach((userId) => {
      if (excluded.has(userId) || activeIds.has(userId)) return
      this.emitToUser('call:active_available', userId, call)
    })
  }

  async getActiveConversationParticipantIds(conversationId) {
    const participants = await ParticipantRepository.findByConversationId(conversationId, 1000)
    return this.uniqueIds((participants || []).filter((participant) => !participant?.leftAt).map((participant) => participant.userId))
  }

  async ensureCurrentConversationParticipant(conversationId, userId) {
    const participant = await ParticipantRepository.findOne(conversationId, userId)
    if (!participant || participant.leftAt) {
      throw new Error('You are not an active participant of this conversation')
    }
    return participant
  }

  async ensureCallParticipants(conversationId, actorId) {
    const conversation = await ConversationRepository.findById(conversationId)
    if (!conversation) {
      throw new Error('Conversation not found')
    }

    const conversationType = String(conversation?.type || '').toLowerCase()
    if (!['1-1', 'direct', 'group'].includes(conversationType)) {
      throw new Error('Calls support direct and group conversations only')
    }

    const participants = (await ParticipantRepository.findByConversationId(conversationId, 1000))
      .filter((participant) => !participant?.leftAt)

    const actor = participants.find((participant) => this.normalizeId(participant.userId) === this.normalizeId(actorId))
    if (!actor) {
      throw new Error('You are not a participant of this conversation')
    }

    const callee = participants.find((participant) => this.normalizeId(participant.userId) !== this.normalizeId(actorId))
    if (!callee && conversationType !== 'group') {
      throw new Error('No callee found for this conversation')
    }

    if (conversationType === 'group' && participants.length < 2) {
      throw new Error('Group calls need at least two active participants')
    }

    return {
      conversation,
      conversationType,
      callerId: this.normalizeId(actorId),
      calleeId: this.normalizeId(callee?.userId),
      participantIds: participants.map((participant) => this.normalizeId(participant.userId)).filter(Boolean),
    }
  }

  async assertCanJoinCall(call, userId) {
    const normalizedUserId = this.normalizeId(userId)
    if (!normalizedUserId) {
      throw new Error('Invalid user')
    }

    if (this.getCallParticipantIds(call).includes(normalizedUserId)) {
      return
    }

    if (this.isGroupCall(call) && call?.conversationId) {
      await this.ensureCurrentConversationParticipant(call.conversationId, normalizedUserId)
      return
    }

    throw new Error('You are not a participant of this call')
  }

  assertCallParticipant(call, userId) {
    const normalizedUserId = this.normalizeId(userId)
    if (!this.getCallParticipantIds(call).includes(normalizedUserId)) {
      throw new Error('You are not a participant of this call')
    }
  }

  calculateDurationSeconds(call, endedAt = Date.now()) {
    const acceptedAt = Number(call?.acceptedAt || 0)
    if (!acceptedAt) return 0
    return Math.max(0, Math.floor((Number(endedAt || Date.now()) - acceptedAt) / 1000))
  }

  hasAcceptedCall(call) {
    return Boolean(Number(call?.acceptedAt || call?.answeredAt || 0))
  }

  getCallMessageDisplayStatus(call) {
    return this.hasAcceptedCall(call) ? 'completed' : 'missed'
  }

  formatDuration(totalSeconds = 0) {
    const safeSeconds = Math.max(0, Number(totalSeconds || 0))
    const minutes = Math.floor(safeSeconds / 60)
    const seconds = safeSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  buildCallMessageContent(call) {
    const callLabel = call?.callType === 'video' ? 'video' : 'thoại'
    const duration = this.formatDuration(call?.durationSeconds || this.calculateDurationSeconds(call))
    const displayStatus = this.getCallMessageDisplayStatus(call)

    if (displayStatus === 'missed') {
      return `Cuộc gọi ${callLabel} nhỡ.`
    }

    return `Cuộc gọi ${callLabel}. Thời gian gọi: ${duration}.`
  }

  buildGroupCallActiveNoticeContent(call, active = true) {
    const callLabel = call?.callType === 'video' ? 'video' : 'thoại'
    return active
      ? `Cuộc gọi nhóm ${callLabel} đang diễn ra. Nhấn để tham gia.`
      : `Cuộc gọi nhóm ${callLabel} đã kết thúc.`
  }

  async persistCallMessage(call) {
    const publicCall = this.toPublicCall(call)
    const content = this.buildCallMessageContent(publicCall)
    if (!publicCall?.conversationId || !content) return null
    const displayStatus = this.getCallMessageDisplayStatus(publicCall)
    const durationSeconds =
      displayStatus === 'completed'
        ? Number(publicCall.durationSeconds || this.calculateDurationSeconds(publicCall))
        : 0

    const message = await MessageRepository.create({
      conversationId: publicCall.conversationId,
      senderId: publicCall.callerId || 'system',
      content,
      type: 'text',
      attachments: [],
      status: 'sent',
      seenBy: [],
      deliveredTo: [],
      metadata: {
        kind: 'call',
        callId: publicCall.callId,
        callType: publicCall.callType,
        callStatus: publicCall.status,
        displayStatus,
        durationSeconds,
        acceptedAt: Number(publicCall.acceptedAt || publicCall.answeredAt || 0),
      },
    })

    await ConversationRepository.update(publicCall.conversationId, {
      updatedAt: Number(message?.createdAt || Date.now()),
    })

    messageEvents.emit(MESSAGE_EVENTS.SENT, {
      conversationId: publicCall.conversationId,
      message,
    })

    return message
  }

  async persistGroupCallActiveNotice(call) {
    if (!this.isGroupCall(call) || call?.status !== 'accepted' || call?.activeNoticeMessageId) {
      return call
    }

    const publicCall = this.toPublicCall(call)
    const message = await MessageRepository.create({
      conversationId: publicCall.conversationId,
      senderId: 'system',
      content: this.buildGroupCallActiveNoticeContent(publicCall, true),
      type: 'system',
      attachments: [],
      status: 'sent',
      seenBy: [],
      deliveredTo: [],
      metadata: {
        kind: GROUP_CALL_ACTIVE_NOTICE_KIND,
        callId: publicCall.callId,
        callType: publicCall.callType,
        conversationId: publicCall.conversationId,
        active: true,
        startedAt: Number(publicCall.acceptedAt || publicCall.startedAt || Date.now()),
        endedAt: null,
      },
    })

    await ConversationRepository.update(publicCall.conversationId, {
      updatedAt: Number(message?.createdAt || Date.now()),
    })

    messageEvents.emit(MESSAGE_EVENTS.SENT, {
      conversationId: publicCall.conversationId,
      message,
    })

    return CallRepository.update(publicCall.callId, {
      activeNoticeMessageId: message.messageId,
    })
  }

  async completeGroupCallActiveNotice(call, endedAt = Date.now()) {
    if (!this.isGroupCall(call) || !call?.activeNoticeMessageId || !call?.conversationId) return null

    const existing = await MessageRepository.findById(call.conversationId, call.activeNoticeMessageId)
    if (!existing) return null

    const nextMetadata = {
      ...(existing.metadata || {}),
      kind: GROUP_CALL_ACTIVE_NOTICE_KIND,
      callId: call.callId,
      callType: call.callType,
      conversationId: call.conversationId,
      active: false,
      startedAt: Number(existing.metadata?.startedAt || call.acceptedAt || call.startedAt || 0),
      endedAt,
    }

    const message = await MessageRepository.update(call.conversationId, call.activeNoticeMessageId, {
      content: this.buildGroupCallActiveNoticeContent(call, false),
      metadata: nextMetadata,
      isEdited: false,
      editedAt: null,
    })

    messageEvents.emit(MESSAGE_EVENTS.EDITED, {
      conversationId: call.conversationId,
      messageId: call.activeNoticeMessageId,
      message,
    })

    return message
  }

  async createAttendeeForUser(call, userId) {
    const normalizedUserId = this.normalizeId(userId)
    const attendees = { ...(call.attendees || {}) }
    if (attendees[normalizedUserId]) {
      return attendees[normalizedUserId]
    }

    const response = await this.chimeClient.send(new CreateAttendeeCommand({
      MeetingId: call.meetingId,
      ExternalUserId: normalizedUserId.slice(0, 64),
    }))

    const attendee = response.Attendee
    attendees[normalizedUserId] = attendee
    await CallRepository.update(call.callId, { attendees })
    return attendee
  }

  scheduleRingingEvents(callId) {
    const existing = this.ringingEventTimers.get(callId)
    if (existing) clearInterval(existing)

    const timer = setInterval(async () => {
      try {
        const call = await CallRepository.findById(callId)
        if (call?.status !== 'ringing') {
          this.clearRingingEvents(callId)
          return
        }

        this.getIncomingCallRecipientIds(call).forEach((userId) => {
          this.emitToUser('call:incoming', userId, call, { repeated: true })
        })
        this.emitToUser('call:ringing', call.callerId, call, { repeated: true })
      } catch (error) {
        console.error('Failed to emit repeated ringing event:', error?.message || error)
      }
    }, RINGING_EVENT_INTERVAL_MS)

    this.ringingEventTimers.set(callId, timer)
  }

  scheduleMissedTimeout(callId) {
    const timeoutMs = Math.max(5, Number(config.callRingTimeoutSeconds || 60)) * 1000
    const existing = this.missedCallTimers.get(callId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(async () => {
      try {
        const call = await CallRepository.findById(callId)
        if (call?.status === 'ringing') {
          const updated = await CallRepository.update(callId, {
            status: 'missed',
            missedAt: Date.now(),
            durationSeconds: 0,
          })
          await this.persistCallMessage(updated)
          this.emitToCallParticipants('call:missed', updated)
          await this.deleteMeetingQuietly(call.meetingId)
        }
      } catch (error) {
        console.error('Failed to mark call as missed:', error?.message || error)
      } finally {
        this.clearCallTimers(callId)
      }
    }, timeoutMs)

    this.missedCallTimers.set(callId, timer)
    this.scheduleRingingEvents(callId)
  }

  clearRingingEvents(callId) {
    const timer = this.ringingEventTimers.get(callId)
    if (timer) clearInterval(timer)
    this.ringingEventTimers.delete(callId)
  }

  clearMissedTimeout(callId) {
    const timer = this.missedCallTimers.get(callId)
    if (timer) clearTimeout(timer)
    this.missedCallTimers.delete(callId)
  }

  clearCallTimers(callId) {
    this.clearMissedTimeout(callId)
    this.clearRingingEvents(callId)
  }

  getIncomingCallRecipientIds(call) {
    const callerId = this.normalizeId(call?.callerId)
    return this.getCallParticipantIds(call).filter((userId) => userId && userId !== callerId && !this.isParticipantInactive(call, userId))
  }

  async startCall(conversationId, callerId, callType) {
    const normalizedType = String(callType || '').toLowerCase()
    if (!['audio', 'video'].includes(normalizedType)) {
      throw new Error('Call type must be audio or video')
    }

    const activeCall = await CallRepository.findActiveByConversation(conversationId)
    if (activeCall) {
      throw new Error('There is already an active call in this conversation')
    }

    const { calleeId, conversationType, participantIds } = await this.ensureCallParticipants(conversationId, callerId)
    const normalizedCallerId = this.normalizeId(callerId)
    const callId = uuidv4()
    const meetingResponse = await this.chimeClient.send(new CreateMeetingCommand({
      ClientRequestToken: callId,
      MediaRegion: config.chimeMeetingRegion,
      ExternalMeetingId: conversationId.slice(0, 64),
    }))

    const meeting = meetingResponse.Meeting
    const attendeeResponse = await this.chimeClient.send(new CreateAttendeeCommand({
      MeetingId: meeting.MeetingId,
      ExternalUserId: normalizedCallerId.slice(0, 64),
    }))

    const callerAttendee = attendeeResponse.Attendee
    const now = Date.now()
    const call = await CallRepository.create({
      callId,
      conversationId,
      conversationType,
      callerId: normalizedCallerId,
      calleeId,
      participantIds,
      joinedByIds: [normalizedCallerId],
      leftByIds: [],
      declinedByIds: [],
      callType: normalizedType,
      status: 'ringing',
      meetingId: meeting.MeetingId,
      meeting,
      attendees: {
        [normalizedCallerId]: callerAttendee,
      },
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    this.scheduleMissedTimeout(callId)
    return { call: this.toPublicCall(call, normalizedCallerId), meeting, attendee: callerAttendee }
  }

  async acceptCall(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')
    this.assertCallParticipant(call, userId)

    if (call.status === 'accepted') {
      const result = await this.joinAcceptedCall(call, userId)
      return { ...result, joinedExisting: true }
    }

    if (call.status !== 'ringing') {
      throw new Error(`Cannot accept a call with status ${call.status}`)
    }

    const acceptedAt = call.acceptedAt || Date.now()
    const normalizedUserId = this.normalizeId(userId)
    const callerId = this.normalizeId(call.callerId)
    this.clearCallTimers(callId)

    let attendee
    let updated
    try {
      attendee = await this.createAttendeeForUser(call, normalizedUserId)
      updated = await CallRepository.update(callId, {
        status: 'accepted',
        acceptedAt,
        answeredAt: acceptedAt,
        joinedByIds: this.uniqueIds([...(call.joinedByIds || []), callerId, normalizedUserId]),
        leftByIds: this.removeIds(call.leftByIds || [], [normalizedUserId, callerId]),
        declinedByIds: this.removeIds(call.declinedByIds || [], [normalizedUserId, callerId]),
      })
      updated = await this.persistGroupCallActiveNotice(updated)
    } catch (error) {
      this.scheduleMissedTimeout(callId)
      throw error
    }

    this.clearCallTimers(callId)
    this.emitActiveGroupCallAvailable(updated, [normalizedUserId, callerId])

    return { call: this.toPublicCall(updated, normalizedUserId), meeting: updated.meeting, attendee }
  }

  async joinAcceptedCall(call, userId) {
    if (call.status !== 'accepted') {
      throw new Error(`Cannot join a call with status ${call.status}`)
    }

    const normalizedUserId = this.normalizeId(userId)
    await this.assertCanJoinCall(call, normalizedUserId)

    const participantIds = this.isGroupCall(call)
      ? this.uniqueIds([...this.getCallParticipantIds(call), ...(await this.getActiveConversationParticipantIds(call.conversationId))])
      : this.getCallParticipantIds(call)
    const attendee = await this.createAttendeeForUser(call, normalizedUserId)
    const updated = await CallRepository.update(call.callId, {
      participantIds,
      joinedByIds: this.uniqueIds([...(call.joinedByIds || []), normalizedUserId]),
      leftByIds: this.removeIds(call.leftByIds || [], [normalizedUserId]),
      declinedByIds: this.removeIds(call.declinedByIds || [], [normalizedUserId]),
    })

    return { call: this.toPublicCall(updated, normalizedUserId), meeting: updated.meeting, attendee }
  }

  async joinCall(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')

    if (TERMINAL_STATUSES.includes(call.status)) {
      throw new Error(`Cannot join a call with status ${call.status}`)
    }

    if (call.status === 'ringing') {
      const result = await this.acceptCall(callId, userId)
      return { ...result, acceptedFromRinging: true }
    }

    const result = await this.joinAcceptedCall(call, userId)
    return { ...result, joinedExisting: true }
  }

  async getOrCreateAttendee(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')

    if (![...TERMINAL_STATUSES, ...ACTIVE_STATUSES].includes(call.status)) {
      throw new Error(`Invalid call status ${call.status}`)
    }

    if (TERMINAL_STATUSES.includes(call.status)) {
      throw new Error(`Cannot join a call with status ${call.status}`)
    }

    if (call.status === 'accepted') {
      return this.joinAcceptedCall(call, userId)
    }

    this.assertCallParticipant(call, userId)
    const attendee = await this.createAttendeeForUser(call, userId)
    return { call: this.toPublicCall(call, userId), meeting: call.meeting, attendee }
  }

  async getCall(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')
    await this.assertCanJoinCall(call, userId)
    return { call: this.toPublicCall(call, userId) }
  }

  async getCurrentCallForUser(userId) {
    const call = await CallRepository.findLatestActiveByUser(userId)
    if (!call) {
      return { call: null }
    }

    await this.assertCanJoinCall(call, userId)

    if (call.status === 'accepted' && this.isGroupCall(call)) {
      if (this.getActiveJoinedParticipantIds(call).length <= 1) {
        return { call: null }
      }
      return { call: this.toPublicCall(call, userId) }
    }

    if (this.isParticipantInactive(call, userId)) {
      return { call: null }
    }

    if (call.status === 'ringing') {
      const callerId = this.normalizeId(call.callerId)
      const remainingRecipientIds = this.getRemainingCallParticipantIds(call).filter((participantId) => participantId !== callerId)
      if (remainingRecipientIds.length === 0) {
        return { call: null }
      }
    }

    return { call: this.toPublicCall(call, userId) }
  }

  async getActiveCallForConversation(conversationId, userId) {
    await this.ensureCurrentConversationParticipant(conversationId, userId)
    const call = await CallRepository.findActiveByConversation(conversationId)
    if (!call) {
      return { call: null }
    }

    await this.assertCanJoinCall(call, userId)
    if (call.status === 'accepted' && this.isGroupCall(call) && this.getActiveJoinedParticipantIds(call).length <= 1) {
      return { call: null }
    }

    return { call: this.toPublicCall(call, userId) }
  }

  async declineCall(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')
    this.assertCallParticipant(call, userId)

    if (!ACTIVE_STATUSES.includes(call.status)) {
      return { call: this.toPublicCall(call, userId) }
    }

    if (call.status === 'accepted' && this.isGroupCall(call)) {
      return this.leaveAcceptedGroupCall(call, userId, 'declined')
    }

    const participantIds = this.getCallParticipantIds(call)
    const normalizedUserId = this.normalizeId(userId)
    const isMultiParticipantCall = this.isGroupCall(call)
    const callerId = this.normalizeId(call.callerId)

    if (isMultiParticipantCall && normalizedUserId !== callerId) {
      const declinedByIds = this.uniqueIds([...(call.declinedByIds || []), normalizedUserId])
      const recipientIds = participantIds.filter((participantId) => participantId !== callerId)
      const everyRecipientDeclined = recipientIds.every((participantId) => declinedByIds.includes(participantId))

      if (!everyRecipientDeclined) {
        const updated = await CallRepository.update(callId, { declinedByIds })
        return { call: this.toPublicCall(updated, normalizedUserId), partial: true }
      }
    }

    const wasAccepted = this.hasAcceptedCall(call)
    const terminalAt = Date.now()
    const nextStatus = wasAccepted ? 'ended' : 'missed'
    const updates = {
      status: nextStatus,
      durationSeconds: wasAccepted ? this.calculateDurationSeconds(call, terminalAt) : 0,
    }

    if (wasAccepted) {
      updates.endedBy = normalizedUserId
      updates.endedAt = terminalAt
    } else {
      updates.declinedBy = normalizedUserId
      updates.declinedAt = terminalAt
      updates.missedAt = terminalAt
    }

    const updated = await CallRepository.update(callId, updates)
    await this.finalizeTerminalCall(call, updated)

    return { call: this.toPublicCall(updated, normalizedUserId) }
  }

  async endCall(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')
    this.assertCallParticipant(call, userId)

    if (TERMINAL_STATUSES.includes(call.status)) {
      return { call: this.toPublicCall(call, userId) }
    }

    if (call.status === 'accepted' && this.isGroupCall(call)) {
      return this.leaveAcceptedGroupCall(call, userId, 'left')
    }

    const wasAccepted = this.hasAcceptedCall(call)
    const terminalAt = Date.now()
    const normalizedUserId = this.normalizeId(userId)
    const updates = wasAccepted
      ? {
          status: 'ended',
          endedBy: normalizedUserId,
          endedAt: terminalAt,
          durationSeconds: this.calculateDurationSeconds(call, terminalAt),
        }
      : {
          status: 'missed',
          endedBy: normalizedUserId,
          missedAt: terminalAt,
          durationSeconds: 0,
        }

    const updated = await CallRepository.update(callId, updates)
    await this.finalizeTerminalCall(call, updated)

    return { call: this.toPublicCall(updated, normalizedUserId) }
  }

  async leaveAcceptedGroupCall(call, userId, reason = 'left') {
    const normalizedUserId = this.normalizeId(userId)
    const leftByIds = this.uniqueIds([...(call.leftByIds || []), normalizedUserId])
    const declinedByIds = reason === 'declined'
      ? this.uniqueIds([...(call.declinedByIds || []), normalizedUserId])
      : this.uniqueIds(call.declinedByIds || [])
    const nextCall = {
      ...call,
      leftByIds,
      declinedByIds,
    }
    const remainingActiveIds = this.getActiveJoinedParticipantIds(nextCall)

    if (remainingActiveIds.length > 1) {
      const updated = await CallRepository.update(call.callId, { leftByIds, declinedByIds })
      return { call: this.toPublicCall(updated, normalizedUserId), partial: true }
    }

    const terminalAt = Date.now()
    const updated = await CallRepository.update(call.callId, {
      status: 'ended',
      endedBy: normalizedUserId,
      endedAt: terminalAt,
      durationSeconds: this.calculateDurationSeconds(call, terminalAt),
      leftByIds,
      declinedByIds,
    })
    await this.finalizeTerminalCall(call, updated)

    return { call: this.toPublicCall(updated, normalizedUserId) }
  }

  async finalizeTerminalCall(previousCall, updatedCall) {
    this.clearCallTimers(updatedCall.callId)
    await this.completeGroupCallActiveNotice(updatedCall, Number(updatedCall.endedAt || updatedCall.missedAt || Date.now()))
    await this.persistCallMessage(updatedCall)
    await this.deleteMeetingQuietly(previousCall.meetingId)
  }

  async handleConversationParticipantAdded(payload = {}) {
    const conversationId = this.normalizeId(payload.conversationId)
    const participantId = this.normalizeId(payload.participantId)
    if (!conversationId || !participantId) return

    const call = await CallRepository.findActiveByConversation(conversationId)
    if (!call || call.status !== 'accepted' || !this.isGroupCall(call)) return

    const participantIds = this.uniqueIds([...this.getCallParticipantIds(call), participantId])
    const updated = await CallRepository.update(call.callId, { participantIds })
    this.emitToUser('call:active_available', participantId, updated)
  }

  async handleConversationParticipantRemoved(payload = {}) {
    const conversationId = this.normalizeId(payload.conversationId)
    const participantId = this.normalizeId(payload.participantId)
    if (!conversationId || !participantId) return

    const call = await CallRepository.findActiveByConversation(conversationId)
    if (!call || !this.getCallParticipantIds(call).includes(participantId)) return

    if (call.status === 'accepted' && this.isGroupCall(call)) {
      const result = await this.leaveAcceptedGroupCall(call, participantId, 'removed')
      if (result.partial) {
        this.emitToCallParticipants('call:participant_left', result.call, {
          participantId,
          reason: 'removed',
        })
        return
      }

      this.emitToCallParticipants('call:ended', result.call, { endedBy: participantId })
      return
    }

    if (call.status === 'ringing') {
      const callerId = this.normalizeId(call.callerId)
      if (participantId === callerId) {
        const updated = await CallRepository.update(call.callId, {
          status: 'missed',
          endedBy: participantId,
          missedAt: Date.now(),
          durationSeconds: 0,
        })
        await this.finalizeTerminalCall(call, updated)
        this.emitToCallParticipants('call:missed', updated, { endedBy: participantId })
        return
      }

      const declinedByIds = this.uniqueIds([...(call.declinedByIds || []), participantId])
      const recipientIds = this.getCallParticipantIds(call).filter((id) => id !== callerId)
      const everyRecipientDeclined = recipientIds.every((id) => declinedByIds.includes(id))

      if (!everyRecipientDeclined) {
        const updated = await CallRepository.update(call.callId, { declinedByIds })
        this.emitToCallParticipants('call:participant_left', updated, {
          participantId,
          reason: 'removed',
        })
        return
      }

      const updated = await CallRepository.update(call.callId, {
        status: 'missed',
        declinedBy: participantId,
        declinedAt: Date.now(),
        missedAt: Date.now(),
        durationSeconds: 0,
        declinedByIds,
      })
      await this.finalizeTerminalCall(call, updated)
      this.emitToCallParticipants('call:missed', updated, { declinedBy: participantId })
    }
  }

  async deleteMeetingQuietly(meetingId) {
    if (!meetingId) return
    try {
      await this.chimeClient.send(new DeleteMeetingCommand({ MeetingId: meetingId }))
    } catch (error) {
      console.warn('Failed to delete Chime meeting:', error?.message || error)
    }
  }
}

export default new CallService()
