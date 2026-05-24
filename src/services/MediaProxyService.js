const ALLOWED_IMAGE_HOSTS = new Set([
  'commons.wikimedia.org',
  'upload.wikimedia.org',
])

const IMAGE_CONTENT_TYPE_PATTERN = /^image\//i

const normalizeProxyUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('url is required')

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('url is invalid')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only https image URLs are allowed')
  }

  if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
    throw new Error('Image host is not allowed')
  }

  return parsed
}

class MediaProxyService {
  async fetchImage(url) {
    const targetUrl = normalizeProxyUrl(url)
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'TixChatMediaProxy/1.0',
        Accept: 'image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      const error = new Error(`Upstream image request failed with status ${response.status}`)
      error.statusCode = response.status
      throw error
    }

    const contentType = String(response.headers.get('content-type') || '').trim()
    if (!IMAGE_CONTENT_TYPE_PATTERN.test(contentType)) {
      throw new Error('Upstream resource is not an image')
    }

    const body = Buffer.from(await response.arrayBuffer())
    return {
      statusCode: 200,
      contentType,
      cacheControl: response.headers.get('cache-control') || 'public, max-age=3600',
      body,
    }
  }
}

export default new MediaProxyService()
