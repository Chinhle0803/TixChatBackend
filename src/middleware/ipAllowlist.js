const normalizeIp = (value = '') => {
  const ip = String(value || '').trim()
  if (!ip) return ''
  if (ip.startsWith('::ffff:')) return ip.slice('::ffff:'.length)
  if (ip === '::1') return '127.0.0.1'
  return ip
}

export const createIpAllowlistMiddleware = (allowedIps = []) => {
  const allowlist = new Set((allowedIps || []).map(normalizeIp).filter(Boolean))

  return (req, res, next) => {
    if (allowlist.size === 0) {
      next()
      return
    }

    const candidates = [
      req.ip,
      req.socket?.remoteAddress,
      req.headers['x-forwarded-for']?.split(',')?.[0],
    ].map(normalizeIp).filter(Boolean)

    if (candidates.some((ip) => allowlist.has(ip))) {
      next()
      return
    }

    res.status(403).json({ error: 'IP is not allowed to access map resources' })
  }
}
