import callService from '../services/CallService.js'
import notificationService from '../services/NotificationService.js'

class CallController {
  emit(eventName, call, payload = {}) {
    callService.emitToCallParticipants(eventName, call, payload)
  }

  async startCall(req, res) {
    try {
      const { conversationId, callType } = req.body || {}
      if (!conversationId) {
        return res.status(400).json({ error: 'conversationId is required' })
      }

      const result = await callService.startCall(conversationId, req.userId, callType)
      const { call } = result

      callService.getIncomingCallRecipientIds(call).forEach((userId) => {
        callService.emitToUser('call:incoming', userId, call)
      })
      callService.emitToUser('call:ringing', call.callerId, call)
      notificationService.sendIncomingCallNotification({ call }).catch((error) => {
        console.warn('Failed to send incoming call push notification:', error?.message || error)
      })

      return res.status(201).json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to start call' })
    }
  }

  async acceptCall(req, res) {
    try {
      const result = await callService.acceptCall(req.params.callId, req.userId)
      this.emit('call:accepted', result.call, { acceptedBy: req.userId })
      this.emit('call:participant_joined', result.call, { participantId: req.userId })
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to accept call' })
    }
  }

  async declineCall(req, res) {
    try {
      const result = await callService.declineCall(req.params.callId, req.userId)
      if (result.partial) {
        this.emit('call:participant_left', result.call, {
          participantId: req.userId,
          reason: 'declined',
        })
        return res.json(result)
      }
      const eventName = result.call?.status === 'missed' ? 'call:missed' : 'call:declined'
      this.emit(eventName, result.call, { declinedBy: req.userId })
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to decline call' })
    }
  }

  async endCall(req, res) {
    try {
      const result = await callService.endCall(req.params.callId, req.userId)
      if (result.partial) {
        this.emit('call:participant_left', result.call, {
          participantId: req.userId,
          reason: 'left',
        })
        return res.json(result)
      }
      const eventName = result.call?.status === 'missed' ? 'call:missed' : 'call:ended'
      this.emit(eventName, result.call, { endedBy: req.userId })
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to end call' })
    }
  }

  async getAttendee(req, res) {
    try {
      const result = await callService.getOrCreateAttendee(req.params.callId, req.userId)
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to join call' })
    }
  }

  async getCall(req, res) {
    try {
      const result = await callService.getCall(req.params.callId, req.userId)
      return res.json(result)
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to get call' })
    }
  }
}

export default new CallController()
