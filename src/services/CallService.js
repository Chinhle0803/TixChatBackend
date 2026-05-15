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
import { messageEvents } from '../events/EventBus.js'
import { MESSAGE_EVENTS } from '../events/EventTypes.js'
import { getIO } from '../utils/ioInstance.js'

const TERMINAL_STATUSES = ['declined', 'ended', 'missed']
const RINGING_EVENT_INTERVAL_MS = 5000

class CallService {
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
  }

  normalizeId(value) {
    if (!value) return ''
    if (typeof value === 'object') return String(value._id || value.userId || value.id || '')
    return String(value)
  }

  toPublicCall(call) {
    if (!call) return null
    const { meeting, attendees, ...publicCall } = call
    return publicCall
  }

  emitToCallParticipants(eventName, call, payload = {}) {
    const publicCall = this.toPublicCall(call)
    if (!publicCall) return

    try {
      const io = getIO()
      const userIds = this.getCallParticipantIds(publicCall)
        .map((id) => this.normalizeId(id))
        .filter(Boolean)

      userIds.forEach((userId) => {
        io.to(`user:${userId}`).emit(eventName, {
          call: publicCall,
          ...payload,
        })
      })
    } catch (error) {
      console.warn(`Failed to emit ${eventName}:`, error?.message || error)
    }
  }

  getCallParticipantIds(call) {
    const participantIds = Array.isArray(call?.participantIds) ? call.participantIds : []
    const fallbackIds = [call?.callerId, call?.calleeId]
    return [...new Set([...participantIds, ...fallbackIds].map((id) => this.normalizeId(id)).filter(Boolean))]
  }

  getIncomingCallRecipientIds(call) {
    const callerId = this.normalizeId(call?.callerId)
    return this.getCallParticipantIds(call).filter((userId) => userId && userId !== callerId)
  }

  getRemainingCallParticipantIds(call) {
    const inactiveIds = new Set([
      ...(Array.isArray(call?.leftByIds) ? call.leftByIds : []),
      ...(Array.isArray(call?.declinedByIds) ? call.declinedByIds : []),
    ].map((id) => this.normalizeId(id)).filter(Boolean))

    return this.getCallParticipantIds(call).filter((userId) => !inactiveIds.has(userId))
  }

  emitToUser(eventName, userId, call, payload = {}) {
    const publicCall = this.toPublicCall(call)
    const normalizedUserId = this.normalizeId(userId)
    if (!publicCall || !normalizedUserId) return

    try {
      const io = getIO()
      io.to(`user:${normalizedUserId}`).emit(eventName, {
        call: publicCall,
        ...payload,
      })
    } catch (error) {
      console.warn(`Failed to emit ${eventName}:`, error?.message || error)
    }
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
      callerId: this.normalizeId(actorId),
      calleeId: this.normalizeId(callee?.userId),
      participantIds: participants.map((participant) => this.normalizeId(participant.userId)).filter(Boolean),
    }
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

  async startCall(conversationId, callerId, callType) {
    const normalizedType = String(callType || '').toLowerCase()
    if (!['audio', 'video'].includes(normalizedType)) {
      throw new Error('Call type must be audio or video')
    }

    const activeCall = await CallRepository.findActiveByConversation(conversationId)
    if (activeCall) {
      throw new Error('There is already an active call in this conversation')
    }

    const { calleeId, participantIds } = await this.ensureCallParticipants(conversationId, callerId)
    const callId = uuidv4()
    const meetingResponse = await this.chimeClient.send(new CreateMeetingCommand({
      ClientRequestToken: callId,
      MediaRegion: config.chimeMeetingRegion,
      ExternalMeetingId: conversationId.slice(0, 64),
    }))

    const meeting = meetingResponse.Meeting
    const attendeeResponse = await this.chimeClient.send(new CreateAttendeeCommand({
      MeetingId: meeting.MeetingId,
      ExternalUserId: this.normalizeId(callerId).slice(0, 64),
    }))

    const callerAttendee = attendeeResponse.Attendee
    const now = Date.now()
    const call = await CallRepository.create({
      callId,
      conversationId,
      callerId: this.normalizeId(callerId),
      calleeId,
      participantIds,
      callType: normalizedType,
      status: 'ringing',
      meetingId: meeting.MeetingId,
      meeting,
      attendees: {
        [this.normalizeId(callerId)]: callerAttendee,
      },
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    this.scheduleMissedTimeout(callId)
    return { call: this.toPublicCall(call), meeting, attendee: callerAttendee }
  }

  async acceptCall(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')
    this.assertCallParticipant(call, userId)

    if (call.status !== 'ringing' && call.status !== 'accepted') {
      throw new Error(`Cannot accept a call with status ${call.status}`)
    }

    const wasAlreadyAccepted = call.status === 'accepted'
    const acceptedAt = call.acceptedAt || Date.now()

    if (!wasAlreadyAccepted) {
      this.clearCallTimers(callId)
    }

    let attendee
    let updated
    try {
      attendee = await this.createAttendeeForUser(call, userId)
      updated = await CallRepository.update(callId, {
        status: 'accepted',
        acceptedAt,
        answeredAt: acceptedAt,
      })
    } catch (error) {
      if (!wasAlreadyAccepted) {
        this.scheduleMissedTimeout(callId)
      }
      throw error
    }

    this.clearCallTimers(callId)

    return { call: this.toPublicCall(updated), meeting: updated.meeting, attendee }
  }

  async getOrCreateAttendee(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')
    this.assertCallParticipant(call, userId)

    if (![...TERMINAL_STATUSES, 'ringing', 'accepted'].includes(call.status)) {
      throw new Error(`Invalid call status ${call.status}`)
    }

    if (TERMINAL_STATUSES.includes(call.status)) {
      throw new Error(`Cannot join a call with status ${call.status}`)
    }

    const attendee = await this.createAttendeeForUser(call, userId)
    return { call: this.toPublicCall(call), meeting: call.meeting, attendee }
  }

  async getCall(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')
    this.assertCallParticipant(call, userId)
    return { call: this.toPublicCall(call) }
  }

  async declineCall(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')
    this.assertCallParticipant(call, userId)

    if (!['ringing', 'accepted'].includes(call.status)) {
      return { call: this.toPublicCall(call) }
    }

    const participantIds = this.getCallParticipantIds(call)
    const normalizedUserId = this.normalizeId(userId)
    const isMultiParticipantCall = participantIds.length > 2
    const callerId = this.normalizeId(call.callerId)

    if (isMultiParticipantCall && normalizedUserId !== callerId) {
      const declinedByIds = [...new Set([
        ...(Array.isArray(call.declinedByIds) ? call.declinedByIds : []),
        normalizedUserId,
      ].map((id) => this.normalizeId(id)).filter(Boolean))]
      const recipientIds = participantIds.filter((participantId) => participantId !== callerId)
      const everyRecipientDeclined = recipientIds.every((participantId) => declinedByIds.includes(participantId))

      if (!everyRecipientDeclined) {
        const updated = await CallRepository.update(callId, { declinedByIds })
        return { call: this.toPublicCall(updated), partial: true }
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
    this.clearCallTimers(callId)
    await this.persistCallMessage(updated)
    await this.deleteMeetingQuietly(call.meetingId)

    return { call: this.toPublicCall(updated) }
  }

  async endCall(callId, userId) {
    const call = await CallRepository.findById(callId)
    if (!call) throw new Error('Call not found')
    this.assertCallParticipant(call, userId)

    if (TERMINAL_STATUSES.includes(call.status)) {
      return { call: this.toPublicCall(call) }
    }

    const participantIds = this.getCallParticipantIds(call)
    const normalizedUserId = this.normalizeId(userId)
    const isMultiParticipantCall = participantIds.length > 2

    if (isMultiParticipantCall) {
      const leftByIds = [...new Set([
        ...(Array.isArray(call.leftByIds) ? call.leftByIds : []),
        normalizedUserId,
      ].map((id) => this.normalizeId(id)).filter(Boolean))]
      const inactiveIds = new Set([
        ...leftByIds,
        ...(Array.isArray(call.declinedByIds) ? call.declinedByIds : []),
      ].map((id) => this.normalizeId(id)).filter(Boolean))
      const everyoneLeft = participantIds.every((participantId) => inactiveIds.has(participantId))

      if (!everyoneLeft) {
        const updated = await CallRepository.update(callId, { leftByIds })
        return { call: this.toPublicCall(updated), partial: true }
      }
    }

    const wasAccepted = this.hasAcceptedCall(call)
    const terminalAt = Date.now()
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
    this.clearCallTimers(callId)
    await this.persistCallMessage(updated)
    await this.deleteMeetingQuietly(call.meetingId)

    return { call: this.toPublicCall(updated) }
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
