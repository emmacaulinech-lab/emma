import { createHash } from 'node:crypto'
import { getStore } from '@netlify/blobs'

const project = 'emma-31a56'
// Firebase's public web API key identifies the project in Identity Toolkit.
const publicFirebaseKey = 'AIzaSyBaw29Os1wREiWr_qq2zASAQsb0h-3dTw8'
const keyFormat = /^[a-f0-9]{64}$/
const maxBytes = 200_000
const allowedOrigin = /^https:\/\/(?:deploy-preview-\d+--)?emmacaulinech\.netlify\.app$/

async function authenticate(request) {
  const match = /^Bearer ([\w.-]{1,8192})$/.exec(request.headers.get('authorization') || '')
  if (!match) return null
  const token = match[1]
  const parts = token.split('.')
  if (parts.length !== 3) return null
  let claims
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url'))
  } catch {
    return null
  }
  if (claims?.aud !== project || claims.iss !== 'https://securetoken.google.com/' + project) return null
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + publicFirebaseKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) return null
  const user = (await response.json()).users?.[0]
  return user && !user.disabled && user.localId === claims.sub ? user.localId : null
}

export function makeCalendarHandler(openStore, verify = authenticate) {
  return async function handle(request) {
    const origin = request.headers.get('origin')
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' }
    if (origin && (allowedOrigin.test(origin) || origin === 'https://emmacaulinech-lab.github.io')) {
      headers['Access-Control-Allow-Origin'] = origin
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
      headers['Access-Control-Allow-Methods'] = 'GET, HEAD, POST, OPTIONS'
    }
    const answer = (status, body = null, extra = {}) => new Response(body, { status, headers: { ...headers, ...extra } })
    if (request.method === 'OPTIONS') return answer(204)
    try {
      const url = new URL(request.url)
      if (request.method === 'GET' || request.method === 'HEAD') {
        const key = url.searchParams.get('key')
        if (!keyFormat.test(key || '')) return answer(404)
        const hash = createHash('sha256').update(key).digest('hex')
        const feed = await openStore(url).get(hash, { type: 'json' })
        if (!feed?.calendar) return answer(404)
        return answer(200, request.method === 'HEAD' ? null : feed.calendar, { 'Content-Type': 'text/calendar; charset=utf-8' })
      }
      if (request.method !== 'POST') return answer(405)
      if (origin && !headers['Access-Control-Allow-Origin']) return answer(403)
      const owner = await verify(request)
      if (!owner) return answer(401)
      const raw = await request.text()
      if (Buffer.byteLength(raw) > maxBytes * 2) return answer(413)
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return answer(400)
      }
      const { key, calendar, revoke } = body || {}
      if (typeof key !== 'string' || !keyFormat.test(key)) return answer(400)
      if (revoke !== true && (typeof calendar !== 'string' || Buffer.byteLength(calendar) > maxBytes ||
          !calendar.startsWith('BEGIN:VCALENDAR\r\n') || !calendar.endsWith('END:VCALENDAR\r\n'))) return answer(400)

      const hash = createHash('sha256').update(key).digest('hex')
      const store = openStore(url)
      const current = await store.getWithMetadata(hash, { type: 'json' })
      if (current && current.data.owner !== owner) return answer(403)
      if (current?.data.revoked) return answer(revoke === true ? 204 : 410)
      if (revoke === true && !current) return answer(204)
      const value = revoke === true ? { owner, revoked: true } : { owner, calendar }
      const result = await store.setJSON(hash, value, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true })
      return answer(result.modified ? 204 : 409)
    } catch {
      return answer(503)
    }
  }
}

export default makeCalendarHandler(url => getStore({
  name: url.hostname.startsWith('deploy-preview-') ? 'emma-calendar-preview' : 'emma-calendar',
  consistency: 'strong',
}))
