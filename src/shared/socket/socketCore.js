import { io } from 'socket.io-client'

const withTimeout = (factory, timeoutMs, errorMessage) =>
  new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error(errorMessage)) }
    }, timeoutMs)
    factory(
      (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value) },
      (error) => { if (settled) return; settled = true; clearTimeout(timer); reject(error) }
    )
  })

export const createSocketCore = ({
  socketUrl, getAccessToken,
  reconnection = true, reconnectionAttempts = 10, reconnectionDelay = 1000,
  reconnectionDelayMax, transports,
}) => {
  let socket = null
  const connect = () => {
    const token = typeof getAccessToken === 'function' ? getAccessToken() : null
    if (!token) return null
    if (socket?.connected) return socket
    socket = io(socketUrl, { auth: { token }, reconnection, reconnectionAttempts, reconnectionDelay, reconnectionDelayMax, transports })
    return socket
  }
  const getSocket = () => socket
  const disconnect = () => {
    if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null }
  }
  const ensureConnected = (timeoutMs = 10000) =>
    withTimeout((resolve, reject) => {
      const current = socket?.connected ? socket : connect()
      if (!current) { reject(new Error('Socket initialization failed')); return }
      if (current.connected) { resolve(current); return }
      current.once('connect', () => resolve(current))
    }, timeoutMs, 'Socket connection timeout')
  const emitWithAck = (eventName, payload = {}, timeoutMs = 5000, failureMessage = 'Socket emit failed') =>
    withTimeout(async (resolve, reject) => {
      try {
        const current = await ensureConnected(timeoutMs)
        current.emit(eventName, payload, (ack) => {
          if (ack?.success || ack === undefined || ack === null) resolve(ack)
          else reject(new Error(ack?.error || failureMessage))
        })
      } catch (error) { reject(error) }
    }, timeoutMs, failureMessage)
  const joinConversation = (conversationId, timeoutMs = 5000) =>
    emitWithAck('conversation:join', { conversationId }, timeoutMs, 'Join conversation failed')
  const leaveConversation = (conversationId, timeoutMs = 5000) =>
    emitWithAck('conversation:leave', { conversationId }, timeoutMs, 'Leave conversation failed')
  const emit = async (eventName, payload = {}, timeoutMs = 3000) => {
    const current = await ensureConnected(timeoutMs)
    current.emit(eventName, payload)
  }
  const on = (eventName, handler) => {
    const current = socket || connect()
    if (!current || typeof handler !== 'function') return () => {}
    current.on(eventName, handler)
    return () => current.off(eventName, handler)
  }
  const off = (eventName, handler) => { if (!socket) return; socket.off(eventName, handler) }
  return { connect, getSocket, disconnect, ensureConnected, emitWithAck, joinConversation, leaveConversation, emit, on, off }
}
