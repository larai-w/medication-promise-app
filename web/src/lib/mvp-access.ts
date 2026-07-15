const ACCESS_MESSAGE = 'drug-and-oath-mvp-access-v1'

export const MVP_ACCESS_COOKIE = 'drug_and_oath_mvp_access'
export const MVP_ACCESS_MAX_AGE = 60 * 60 * 24 * 30

type AccessEnvironment = Record<string, string | undefined>

export function isAccessGateEnabled(env: AccessEnvironment = process.env) {
  if (env.MVP_ACCESS_GATE === 'disabled') return false
  return env.NODE_ENV === 'production' || Boolean(env.MVP_ACCESS_CODE || env.MVP_SESSION_SECRET)
}

export function getAccessConfigurationError(env: AccessEnvironment = process.env) {
  if (!isAccessGateEnabled(env)) return null
  if (!env.MVP_ACCESS_CODE || env.MVP_ACCESS_CODE.length < 16) {
    return 'MVP_ACCESS_CODE must be at least 16 characters'
  }
  if (!env.MVP_SESSION_SECRET || env.MVP_SESSION_SECRET.length < 32) {
    return 'MVP_SESSION_SECRET must be at least 32 characters'
  }
  return null
}

async function hmacHex(message: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

export async function createAccessToken(env: AccessEnvironment = process.env) {
  const error = getAccessConfigurationError(env)
  if (error) throw new Error(error)
  return hmacHex(`${ACCESS_MESSAGE}:${env.MVP_ACCESS_CODE}`, env.MVP_SESSION_SECRET!)
}

export async function isAccessCodeValid(candidate: unknown, env: AccessEnvironment = process.env) {
  if (getAccessConfigurationError(env) || typeof candidate !== 'string' || candidate.length > 256) {
    return false
  }
  const [candidateHash, expectedHash] = await Promise.all([
    hmacHex(candidate, env.MVP_SESSION_SECRET!),
    hmacHex(env.MVP_ACCESS_CODE!, env.MVP_SESSION_SECRET!),
  ])
  return constantTimeEqual(candidateHash, expectedHash)
}

export async function isAccessTokenValid(token: string | undefined, env: AccessEnvironment = process.env) {
  if (!isAccessGateEnabled(env)) return true
  if (!token || getAccessConfigurationError(env)) return false
  return constantTimeEqual(token, await createAccessToken(env))
}

export function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim())
  }
  return undefined
}

export async function isMvpRequestAuthorized(request: Request, env: AccessEnvironment = process.env) {
  if (!isAccessGateEnabled(env)) return true
  const token = readCookie(request.headers.get('cookie'), MVP_ACCESS_COOKIE)
  return isAccessTokenValid(token, env)
}

export async function rejectUnauthorizedMvpRequest(request: Request) {
  if (await isMvpRequestAuthorized(request)) return null
  return Response.json(
    { error: 'この記録にアクセスするにはログインが必要です' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } }
  )
}
